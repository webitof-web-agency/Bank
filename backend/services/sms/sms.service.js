// Informational SMS for banking events (Phase 1: SSA Paid To Member only).
//
// Flow (transactional outbox):
//   1. inside the voucher's own transaction, queueForVoucher() writes one
//      sms_messages row per recipient: PENDING, or SKIPPED with a reason
//      (no valid mobile, template not set up, SMS turned off, ...). If the
//      voucher rolls back, so does the row: nothing is ever sent for a
//      voucher that does not exist.
//   2. after COMMIT, dispatch() claims each PENDING row and calls Flowit.
//      Its failure never undoes the voucher: the row becomes FAILED (or stays
//      PENDING for a retry when Flowit could not be reached at all).
//   3. Flowit's delivery report (webhook) moves SENT rows to DELIVERED/FAILED.
//
// The destination number is never taken from the request: the member comes
// from the voucher (partyCode) and the number from members.mobileNo.
//
// sms_messages is read and written with plain SQL, not through a model: the
// model layer serves reads from an in-process cache that only refreshes after
// transactions, while this table needs atomic claims ("UPDATE ... WHERE
// status = 'PENDING'") so a row is sent at most once even with the retry job
// running alongside.
const crypto = require('crypto');
const { Member, SmsTemplate, Voucher } = require('../../models/banking.models');
const { initializeDatabase, restoreMainRow, withTransaction } = require('../../config/postgres');
const { getSmsConfig, getSmsConfigProblems, getSmsTestConfig } = require('../../config/sms');
const { canAccessBranchRecord, resolveBranchCode } = require('../../utils/branchScope');
const flowit = require('./flowit.provider');

const STATUS = Object.freeze({ PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED', DELIVERED: 'DELIVERED', SKIPPED: 'SKIPPED' });

const SKIP = Object.freeze({
  SMS_DISABLED: 'SMS_DISABLED',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  TEMPLATE_NOT_CONFIGURED: 'TEMPLATE_NOT_CONFIGURED',
  TEMPLATE_DISABLED: 'TEMPLATE_DISABLED',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MEMBER_DELETED: 'MEMBER_DELETED',
  MEMBER_DISMEMBERED: 'MEMBER_DISMEMBERED',
  NO_MOBILE: 'NO_MOBILE',
  INVALID_MOBILE: 'INVALID_MOBILE',
  PLACEHOLDER_MOBILE: 'PLACEHOLDER_MOBILE'
});

// Events and the variables a template may use, in the order the DLT text
// expects them unless the template row says otherwise. Adding a page later
// means adding its event here and its voucher key below.
const SMS_EVENTS = Object.freeze({
  MEMBER_SSA_PAID: {
    entityType: 'MEMBER',
    label: 'SSA Paid To Member',
    variableKeys: ['memberName', 'amount', 'voucherNo', 'date']
  }
});

const EVENT_BY_VOUCHER_KEY = Object.freeze({
  'ssa-paid-member': 'MEMBER_SSA_PAID'
});

const MAX_ATTEMPTS = 3;
// The provider's code for "could not connect, nothing was sent".
const RETRYABLE_ERROR = 'NETWORK';
// Column sizes in sms_messages (config/tableSchemas.js).
const MAX_ERROR_CODE = 40;
const MAX_REQUEST_ID = 120;
// A claimed row not finished within this time (process died mid-send) may be
// picked up again by the retry job.
const CLAIM_LEASE_MS = 5 * 60 * 1000;
// DLT headers seen in use: 6 letters, or numeric (e.g. 5 digits on Flowit).
// Flowit's docs give no format, so only letters/digits and a sane length.
const SENDER_ID_RE = /^[A-Z0-9]{3,11}$/;
const SENDER_ID_RULE = '3 to 11 letters or digits';

function cleanText(value) {
  return String(value ?? '').trim();
}

function quote(identifier) {
  return `"${identifier}"`;
}

// ---------------------------------------------------------------------------
// Mobile numbers

// +919876543210 / 919876543210 / 09876543210 / 9876543210 -> 9876543210.
function normalizeMobile(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return { mobile: '', reason: SKIP.NO_MOBILE };
  let mobile = digits;
  if (mobile.length === 12 && mobile.startsWith('91')) mobile = mobile.slice(2);
  else if (mobile.length === 11 && mobile.startsWith('0')) mobile = mobile.slice(1);
  if (!/^[6-9]\d{9}$/.test(mobile)) return { mobile: '', reason: SKIP.INVALID_MOBILE };
  // Filler entered to get past a required field: 9999999999, 9898989898,
  // and keyboard runs such as 9876543210 or 6789012345.
  if (/^(\d)\1{9}$/.test(mobile) || /^(\d\d)\1{4}$/.test(mobile) || isDigitRun(mobile)) return { mobile: '', reason: SKIP.PLACEHOLDER_MOBILE };
  return { mobile, reason: '' };
}

// Every digit one more (or one less) than the one before, wrapping 9 -> 0.
function isDigitRun(mobile) {
  const digits = [...mobile].map(Number);
  const step = (digits[1] - digits[0] + 10) % 10;
  if (step !== 1 && step !== 9) return false;
  return digits.every((digit, i) => i === 0 || (digit - digits[i - 1] + 10) % 10 === step);
}

function maskMobile(mobile) {
  const text = cleanText(mobile);
  if (text.length < 4) return '';
  return `${text.slice(0, 2)}${'X'.repeat(text.length - 4)}${text.slice(-2)}`;
}

// Keyed hash: Indian mobile numbers are few enough that a plain SHA-256
// could be reversed by trying them all.
function hashMobile(mobile) {
  if (!mobile) return '';
  const key = cleanText(process.env.SMS_HASH_SECRET) || cleanText(process.env.JWT_SECRET) || 'sms-mobile-hash';
  return crypto.createHmac('sha256', key).update(String(mobile)).digest('hex');
}

// ---------------------------------------------------------------------------
// Templates

async function resolveTemplate(eventCode) {
  const row = await SmsTemplate.findOne({ eventCode }).lean();
  if (!row || !cleanText(row.dltMessageId)) return { template: null, reason: SKIP.TEMPLATE_NOT_CONFIGURED };
  if (!row.isEnabled) return { template: null, reason: SKIP.TEMPLATE_DISABLED };
  return { template: row, reason: '' };
}

function templateVariableKeys(eventCode, template) {
  const keys = Array.isArray(template?.variableKeys) && template.variableKeys.length
    ? template.variableKeys
    : SMS_EVENTS[eventCode]?.variableKeys || [];
  return keys.map(cleanText);
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : cleanText(value);
}

// Values in template order. Never shortened: with a length limit set
// (SMS_MAX_VARIABLE_LENGTH), an over-long value refuses the whole SMS rather
// than sending a cut-off name.
function buildVariables(keys, { voucher, member }, { maxLength = 0 } = {}) {
  const values = {
    memberName: cleanText(member?.name),
    memberCode: cleanText(member?.code),
    amount: formatAmount(voucher?.amount),
    voucherNo: cleanText(voucher?.voucherNo),
    date: formatDate(voucher?.date)
  };
  return keys.map((key) => {
    if (!(key in values)) {
      const error = new Error(`Template variable "${key}" is not available`);
      error.code = 'TEMPLATE_VARIABLE';
      throw error;
    }
    const value = values[key];
    if (maxLength && value.length > maxLength) {
      // The key and length only: the value may be a member's name.
      const error = new Error(`Template variable "${key}" is ${value.length} characters; the limit is ${maxLength}`);
      error.code = 'VARIABLE_TOO_LONG';
      throw error;
    }
    return value;
  });
}

// ---------------------------------------------------------------------------
// sms_messages rows

const ROW_COLUMNS = [
  'id', 'createdAt', 'updatedAt', 'idempotencyKey', 'eventCode', 'entityType', 'entityCode', 'voucherId', 'voucherNo',
  'maskedMobile', 'mobileHash', 'provider', 'providerRequestId', 'status', 'skipReason', 'errorCode', 'errorMessage',
  'attempts', 'lastAttemptAt', 'deliveredAt', 'createdByUserId'
];

// Inserts unless a row with the same idempotency key exists. Returns the new
// row, or null for a duplicate.
async function insertRow(db, data) {
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, attempts: 0, provider: flowit.PROVIDER, ...data };
  const columns = ROW_COLUMNS.filter((column) => row[column] !== undefined);
  const result = await db.query(
    `INSERT INTO "sms_messages" (${columns.map(quote).join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT ("idempotencyKey") DO NOTHING RETURNING *`,
    columns.map((column) => row[column])
  );
  return result.rows[0] || null;
}

async function updateRow(db, id, fields, { whereStatus = null } = {}) {
  const set = { ...fields, updatedAt: new Date().toISOString() };
  const columns = Object.keys(set);
  const params = columns.map((column) => set[column]);
  params.push(id);
  let where = `"id" = $${params.length}`;
  if (whereStatus) {
    params.push(whereStatus);
    where += ` AND "status" = ANY($${params.length}::text[])`;
  }
  const result = await db.query(
    `UPDATE "sms_messages" SET ${columns.map((column, i) => `${quote(column)} = $${i + 1}`).join(', ')} WHERE ${where} RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

function publicResult(row) {
  if (!row) return null;
  const result = { id: row.id, status: row.status };
  if (row.status === STATUS.SKIPPED && row.skipReason) result.reason = row.skipReason;
  return result;
}

// ---------------------------------------------------------------------------
// 1. Queue, inside the voucher's transaction

function accessDenied() {
  const error = new Error('You do not have access to this member.');
  error.statusCode = 403;
  return error;
}

// voucher: the saved voucher (with its id). meta: { actorUser, actorUserId }.
// Returns the queued rows ({ id, status, reason? }); [] when this voucher does
// not ask for an SMS or one was already queued for it (idempotency key).
async function queueForVoucher(tx, voucher = {}, meta = {}) {
  const eventCode = EVENT_BY_VOUCHER_KEY[cleanText(voucher?.details?.key)];
  if (!eventCode || voucher?.details?.sms !== true) return [];
  const event = SMS_EVENTS[eventCode];
  const voucherId = cleanText(voucher.id || voucher._id);
  const memberCode = cleanText(voucher.partyCode).toUpperCase();
  if (!voucherId || !memberCode) return [];

  const member = await Member.findOne({ code: memberCode }).withDeleted().lean();
  // The voucher save already refuses another branch's member; checked again
  // here so no caller can queue an SMS to a member it cannot see.
  if (member && !canAccessBranchRecord('members', member, meta.actorUser || {})) throw accessDenied();

  const base = {
    idempotencyKey: `${voucherId}:${eventCode}:${memberCode}`,
    eventCode,
    entityType: event.entityType,
    entityCode: memberCode,
    voucherId,
    voucherNo: cleanText(voucher.voucherNo),
    createdByUserId: cleanText(meta.actorUserId) || null
  };

  const config = getSmsConfig();
  let reason = '';
  let mobile = '';
  if (!config.enabled) reason = SKIP.SMS_DISABLED;
  else if (getSmsConfigProblems(config).length) reason = SKIP.PROVIDER_NOT_CONFIGURED;
  if (!reason) {
    const resolved = await resolveTemplate(eventCode);
    reason = resolved.reason;
    if (!reason && !cleanText(resolved.template.senderId) && !config.senderId) reason = SKIP.PROVIDER_NOT_CONFIGURED;
  }
  if (!reason) {
    if (!member) reason = SKIP.MEMBER_NOT_FOUND;
    else if (member.deletedAt) reason = SKIP.MEMBER_DELETED;
    else if (member.dismembered) reason = SKIP.MEMBER_DISMEMBERED;
  }
  if (!reason) {
    const normalized = normalizeMobile(member.mobileNo);
    reason = normalized.reason;
    mobile = normalized.mobile;
  }
  if (reason === SKIP.PROVIDER_NOT_CONFIGURED) {
    console.error(`[sms] ${eventCode} for voucher ${base.voucherNo || voucherId} skipped: SMS is enabled but the Flowit API key or sender ID is not configured.`);
  }

  const row = await insertRow(tx, reason
    ? { ...base, status: STATUS.SKIPPED, skipReason: reason }
    : { ...base, status: STATUS.PENDING, maskedMobile: maskMobile(mobile), mobileHash: hashMobile(mobile) });
  return row ? [publicResult(row)] : [];
}

// ---------------------------------------------------------------------------
// 2. Dispatch, after commit

// A row may be (re)sent only when Flowit cannot have received it: never
// tried, or every earlier try failed before connecting (errorCode NETWORK).
// Claiming clears errorCode, so a send interrupted by a crash leaves a row
// that matches neither and is never sent again (dispatchPending fails it).
const SENDABLE_SQL = `(COALESCE("attempts", 0) = 0 OR "errorCode" = '${RETRYABLE_ERROR}')`;

// One atomic UPDATE: Postgres locks the row, and a concurrent claimer
// re-checks the WHERE after the first commits, finds attempts/lastAttemptAt
// changed and errorCode cleared, and gets no row. So only one caller (live
// save or retry job, in any process) sends a given attempt.
async function claim(db, id) {
  const result = await db.query(
    `UPDATE "sms_messages"
       SET "attempts" = COALESCE("attempts", 0) + 1, "lastAttemptAt" = $2, "updatedAt" = $2, "errorCode" = NULL, "errorMessage" = NULL
     WHERE "id" = $1 AND "status" = 'PENDING' AND COALESCE("attempts", 0) < $3
       AND ("lastAttemptAt" IS NULL OR "lastAttemptAt" < $4) AND ${SENDABLE_SQL}
     RETURNING *`,
    [id, new Date().toISOString(), MAX_ATTEMPTS, new Date(Date.now() - CLAIM_LEASE_MS).toISOString()]
  );
  return result.rows[0] || null;
}

async function loadRow(db, id) {
  const result = await db.query('SELECT * FROM "sms_messages" WHERE "id" = $1', [id]);
  return result.rows[0] || null;
}

// Sends one claimed row. Everything the message needs is re-read here: the
// voucher (committed by now), the member and number, the template.
async function sendClaimed(db, row, { fetchImpl } = {}) {
  const fail = (errorCode, errorMessage) => updateRow(db, row.id, { status: STATUS.FAILED, errorCode, errorMessage: cleanText(errorMessage).slice(0, 255) }, { whereStatus: [STATUS.PENDING] });
  const skip = (skipReason) => updateRow(db, row.id, { status: STATUS.SKIPPED, skipReason }, { whereStatus: [STATUS.PENDING] });

  const config = getSmsConfig();
  if (!config.enabled) return skip(SKIP.SMS_DISABLED);
  if (getSmsConfigProblems(config).length) return skip(SKIP.PROVIDER_NOT_CONFIGURED);
  const { template, reason } = await resolveTemplate(row.eventCode);
  if (reason) return skip(reason);

  const voucher = await Voucher.findById(row.voucherId).lean();
  if (!voucher) return fail('VOUCHER_NOT_FOUND', 'The voucher no longer exists');
  const member = await Member.findOne({ code: row.entityCode }).withDeleted().lean();
  if (!member) return skip(SKIP.MEMBER_NOT_FOUND);
  if (member.deletedAt) return skip(SKIP.MEMBER_DELETED);
  if (member.dismembered) return skip(SKIP.MEMBER_DISMEMBERED);
  const { mobile, reason: mobileReason } = normalizeMobile(member.mobileNo);
  if (mobileReason) return skip(mobileReason);

  let variables;
  try {
    variables = buildVariables(templateVariableKeys(row.eventCode, template), { voucher, member }, { maxLength: config.maxVariableLength });
  } catch (error) {
    return fail(error.code || 'TEMPLATE_VARIABLE', error.message);
  }

  const result = await flowit.send({
    senderId: cleanText(template.senderId) || config.senderId,
    messageId: cleanText(template.dltMessageId),
    variables,
    numbers: [mobile],
    // Returned in the delivery report: the row id is how it finds this row.
    udf1: row.id,
    udf2: row.eventCode
  }, fetchImpl ? { fetchImpl } : {});

  const contact = { maskedMobile: maskMobile(mobile), mobileHash: hashMobile(mobile) };
  if (result.success) {
    const providerRequestId = fitRequestId(result.requestId);
    const sent = await updateRow(db, row.id, { ...contact, status: STATUS.SENT, providerRequestId, errorCode: null, errorMessage: null }, { whereStatus: [STATUS.PENDING] });
    // A delivery report can arrive before this update; keep its status.
    return sent || updateRow(db, row.id, { providerRequestId });
  }

  const errorCode = cleanText(result.errorCode).slice(0, MAX_ERROR_CODE);
  console.warn(`[sms] ${row.eventCode} ${row.id} to ${contact.maskedMobile} failed: ${errorCode} ${result.message}`);
  if (result.retryable && errorCode === RETRYABLE_ERROR && Number(row.attempts || 0) < MAX_ATTEMPTS) {
    // Left PENDING: the retry job tries again once the claim lease runs out.
    return updateRow(db, row.id, { ...contact, errorCode, errorMessage: result.message }, { whereStatus: [STATUS.PENDING] });
  }
  return updateRow(db, row.id, { ...contact, status: STATUS.FAILED, errorCode, errorMessage: result.message }, { whereStatus: [STATUS.PENDING] });
}

// A request id longer than the column would make the SENT update fail after
// Flowit accepted the SMS; the row is still found by its own id (udf1).
function fitRequestId(requestId) {
  const text = cleanText(requestId);
  return text && text.length <= MAX_REQUEST_ID ? text : null;
}

async function dispatchOne(id, options = {}) {
  const db = await initializeDatabase();
  const row = await claim(db, id);
  if (!row) return loadRow(db, id); // already sent, skipped, or being sent
  try {
    return (await sendClaimed(db, row, options)) || loadRow(db, id);
  } catch (error) {
    // Unexpected error: the row stays PENDING for the retry job.
    console.error(`[sms] dispatch ${id} failed: ${error.message}`);
    return loadRow(db, id);
  }
}

// queued: what queueForVoucher returned. Only PENDING rows are sent; never
// throws, so a caller can always return its saved voucher.
async function dispatch(queued = [], options = {}) {
  const results = [];
  for (const entry of queued) {
    if (!entry) continue;
    if (entry.status !== STATUS.PENDING) {
      results.push(entry);
      continue;
    }
    try {
      results.push(publicResult(await dispatchOne(entry.id, options)) || entry);
    } catch (error) {
      console.error(`[sms] dispatch ${entry.id} failed: ${error.message}`);
      results.push(entry);
    }
  }
  return results;
}

// The SMS part of a voucher save response: one recipient per voucher in
// Phase 1, so the single result itself.
function summarizeForResponse(results = []) {
  if (!results.length) return null;
  if (results.length === 1) {
    const { status, reason } = results[0];
    return reason ? { status, reason } : { status };
  }
  return { status: 'MULTIPLE', results: results.map(({ status, reason }) => (reason ? { status, reason } : { status })) };
}

// Retry job. Sends PENDING rows that Flowit cannot have received: never
// claimed (the process stopped between commit and dispatch), or failed only
// with NETWORK (could not connect). A row claimed but never finished (the
// process stopped while talking to Flowit) may already have been sent, so it
// is marked FAILED (INTERRUPTED) for a person to check, never re-sent.
async function dispatchPending({ limit = 50, ...options } = {}) {
  const db = await initializeDatabase();
  const staleBefore = new Date(Date.now() - CLAIM_LEASE_MS).toISOString();
  const result = await db.query(
    `SELECT "id" FROM "sms_messages"
     WHERE "status" = 'PENDING' AND COALESCE("attempts", 0) < $1 AND ("lastAttemptAt" IS NULL OR "lastAttemptAt" < $2) AND ${SENDABLE_SQL}
     ORDER BY "createdAt" ASC LIMIT $3`,
    [MAX_ATTEMPTS, staleBefore, limit]
  );
  const results = [];
  for (const { id } of result.rows) results.push(publicResult(await dispatchOne(id, options)));
  const now = new Date().toISOString();
  await db.query(
    `UPDATE "sms_messages" SET "status" = 'FAILED', "errorCode" = 'INTERRUPTED',
       "errorMessage" = 'Sending was interrupted; Flowit may or may not have received it. Not retried automatically.', "updatedAt" = $1
     WHERE "status" = 'PENDING' AND COALESCE("attempts", 0) > 0 AND "errorCode" IS NULL AND "lastAttemptAt" < $2`,
    [now, staleBefore]
  );
  // Out of attempts: give up visibly instead of staying PENDING for ever.
  await db.query(
    `UPDATE "sms_messages" SET "status" = 'FAILED', "errorCode" = COALESCE("errorCode", 'MAX_ATTEMPTS'), "updatedAt" = $1
     WHERE "status" = 'PENDING' AND COALESCE("attempts", 0) >= $2 AND "lastAttemptAt" < $3`,
    [now, MAX_ATTEMPTS, staleBefore]
  );
  return results;
}

// ---------------------------------------------------------------------------
// 3. Flowit delivery report

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verifyWebhookSecret(provided) {
  const expected = getSmsConfig().webhookSecret;
  if (!expected || !provided) return false;
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function deliveryTime(report) {
  const epoch = Number(report.delivery_timestamp);
  if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch * 1000).toISOString();
  return new Date().toISOString();
}

// One report: found by udf1 (our row id) and/or request_id, never by the
// number alone. A report whose request id or number does not match the row
// is ignored.
async function applyDeliveryReport(db, report = {}) {
  const requestId = cleanText(report.request_id);
  const udf1 = cleanText(report.udf1);
  let row = null;
  if (UUID_RE.test(udf1)) row = await loadRow(db, udf1);
  if (!row && requestId) {
    const found = await db.query('SELECT * FROM "sms_messages" WHERE "providerRequestId" = $1 LIMIT 2', [requestId]);
    if (found.rows.length === 1) row = found.rows[0];
  }
  if (!row) return 'unmatched';
  if (requestId && row.providerRequestId && row.providerRequestId !== requestId) return 'mismatch';
  const mobile = normalizeMobile(report.mobile).mobile;
  if (mobile && row.mobileHash && hashMobile(mobile) !== row.mobileHash) return 'mismatch';

  const status = cleanText(report.status).toLowerCase();
  const providerRequestId = row.providerRequestId || fitRequestId(requestId);
  if (status === 'delivered') {
    // FAILED included: a send that timed out on our side may still arrive.
    const updated = await updateRow(db, row.id, { status: STATUS.DELIVERED, deliveredAt: deliveryTime(report), providerRequestId, errorCode: null, errorMessage: null },
      { whereStatus: [STATUS.PENDING, STATUS.SENT, STATUS.FAILED] });
    return updated ? 'updated' : 'ignored';
  }
  if (status === 'failed' || status === 'undelivered' || status === 'rejected') {
    const reason = cleanText(report.failure_reason || report.status_description).slice(0, 255);
    const updated = await updateRow(db, row.id, { status: STATUS.FAILED, providerRequestId, errorCode: 'DLR_FAILED', errorMessage: reason || 'Delivery failed' },
      { whereStatus: [STATUS.PENDING, STATUS.SENT] });
    return updated ? 'updated' : 'ignored';
  }
  return 'ignored'; // "sent" and other interim states
}

async function handleWebhook(body) {
  const reports = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [body];
  const db = await initializeDatabase();
  const counts = { updated: 0, ignored: 0, unmatched: 0, mismatch: 0 };
  for (const report of reports) {
    if (!report || typeof report !== 'object') continue;
    counts[await applyDeliveryReport(db, report)] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Settings: templates and the log

function templateResponse(row = {}, eventCode = row.eventCode) {
  const event = SMS_EVENTS[eventCode] || {};
  return {
    eventCode,
    label: event.label || eventCode,
    entityType: row.entityType || event.entityType || '',
    availableVariables: event.variableKeys || [],
    dltMessageId: row.dltMessageId || '',
    senderId: row.senderId || '',
    variableKeys: Array.isArray(row.variableKeys) && row.variableKeys.length ? row.variableKeys : event.variableKeys || [],
    previewText: row.previewText || '',
    isEnabled: Boolean(row.isEnabled),
    configured: Boolean(row.id),
    updatedAt: row.updatedAt || null
  };
}

async function listTemplates() {
  const rows = await SmsTemplate.find({}).lean();
  const byEvent = new Map(rows.map((row) => [row.eventCode, row]));
  return Object.keys(SMS_EVENTS).map((eventCode) => templateResponse(byEvent.get(eventCode) || {}, eventCode));
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function saveTemplate(eventCode, data = {}) {
  const code = cleanText(eventCode).toUpperCase();
  const event = SMS_EVENTS[code];
  if (!event) throw badRequest(`Unknown SMS event: ${code}`);
  const dltMessageId = cleanText(data.dltMessageId);
  if (dltMessageId && !/^[A-Za-z0-9_-]{1,120}$/.test(dltMessageId)) throw badRequest('DLT message ID may only contain letters, digits, - and _.');
  const senderId = cleanText(data.senderId).toUpperCase();
  if (senderId && !SENDER_ID_RE.test(senderId)) throw badRequest(`Sender ID must be ${SENDER_ID_RULE}.`);
  const variableKeys = Array.isArray(data.variableKeys) && data.variableKeys.length ? data.variableKeys.map(cleanText) : event.variableKeys;
  const unknown = variableKeys.filter((key) => !event.variableKeys.includes(key) && key !== 'memberCode');
  if (unknown.length) throw badRequest(`Unknown variable(s) for ${code}: ${unknown.join(', ')}`);
  const repeated = variableKeys.filter((key, index) => variableKeys.indexOf(key) !== index);
  if (repeated.length) throw badRequest(`Variable(s) listed more than once for ${code}: ${[...new Set(repeated)].join(', ')}`);
  const isEnabled = data.isEnabled === true;
  if (isEnabled && !dltMessageId) throw badRequest('Enter the DLT message ID before enabling this SMS.');

  const fields = { eventCode: code, entityType: event.entityType, dltMessageId, senderId, variableKeys, previewText: cleanText(data.previewText).slice(0, 1000), isEnabled };
  // A deleted row still holds the event code (soft delete): bring it back.
  const existing = await SmsTemplate.findOne({ eventCode: code }).withDeleted().lean();
  if (existing?.deletedAt) await restoreMainRow('sms_templates', existing.id);
  const saved = existing
    ? await SmsTemplate.findByIdAndUpdate(existing.id, fields, { new: true }).lean()
    : await SmsTemplate.create(fields);
  return templateResponse(saved?.toObject ? saved.toObject() : saved, code);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Filters are exact matches (codes are upper-cased like everywhere else);
// dateFrom/dateTo are calendar days in India time, both inclusive. A
// branch-scoped user sees only the SMS of their own branch's vouchers
// (deleted vouchers included, so the log stays complete).
async function listMessages({ voucherId = '', voucherNo = '', status = '', eventCode = '', memberCode = '', dateFrom = '', dateTo = '', limit = 100, user = null } = {}) {
  for (const value of [dateFrom, dateTo]) {
    if (cleanText(value) && !DATE_RE.test(cleanText(value))) throw badRequest('Dates must be in YYYY-MM-DD format.');
  }
  const db = await initializeDatabase();
  const params = [];
  const where = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  const branchCode = resolveBranchCode(user || {});
  if (branchCode) add('"voucherId" IN (SELECT "id"::text FROM "vouchers" WHERE UPPER("branchCode") = ?)', branchCode);
  if (cleanText(voucherId)) add('"voucherId" = ?', cleanText(voucherId));
  if (cleanText(voucherNo)) add('"voucherNo" = ?', cleanText(voucherNo));
  if (cleanText(status)) add('"status" = ?', cleanText(status).toUpperCase());
  if (cleanText(eventCode)) add('"eventCode" = ?', cleanText(eventCode).toUpperCase());
  if (cleanText(memberCode)) add('"entityCode" = ?', cleanText(memberCode).toUpperCase());
  if (cleanText(dateFrom)) add('("createdAt" AT TIME ZONE \'Asia/Kolkata\')::date >= ?::date', cleanText(dateFrom));
  if (cleanText(dateTo)) add('("createdAt" AT TIME ZONE \'Asia/Kolkata\')::date <= ?::date', cleanText(dateTo));
  params.push(Math.max(1, Math.min(500, Number(limit) || 100)));
  const result = await db.query(
    `SELECT "id", "eventCode", "entityType", "entityCode", "voucherId", "voucherNo", "maskedMobile", "provider", "providerRequestId",
            "status", "skipReason", "errorCode", "errorMessage", "attempts", "lastAttemptAt", "deliveredAt", "createdByUserId", "createdAt", "updatedAt"
     FROM "sms_messages" ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY "createdAt" DESC LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({ ...row, errorMessage: redactSecrets(row.errorMessage) }));
}

// errorMessage holds provider text; should Flowit ever echo a credential
// back, the log still never shows it.
function redactSecrets(text) {
  if (!text) return text;
  const { apiKey, webhookSecret } = getSmsConfig();
  let safe = String(text);
  for (const secret of [apiKey, webhookSecret]) {
    if (secret) safe = safe.split(secret).join('[redacted]');
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Temporary Flowit connectivity test (Settings -> SMS -> Send Test OTP)
//
// One OTP through an already-approved DLT template of another client, to
// the configured test number, to prove authentication, /dev/bulkV2, the
// request_id and the delivery webhook. Isolated from the banking events: not
// in SMS_EVENTS (no template row, not editable), not reachable from any
// voucher, and every value comes from the backend environment.

const TEST_EVENT = 'FLOWIT_TEST_OTP';
const TEST_COOLDOWN_MS = 60 * 1000;

// What blocks a test send, by setting name only (never a value).
function testSendProblems(config = getSmsConfig(), test = getSmsTestConfig()) {
  const problems = [];
  if (!test.allowedHere) problems.push('The connectivity test is disabled in production (set FLOWIT_TEST_ALLOW_IN_PRODUCTION=true to allow it).');
  if (!config.enabled) problems.push('SMS_ENABLED is not true.');
  if (!config.apiKey) problems.push('FLOWIT_API_KEY is not set.');
  if (!/^https:\/\//i.test(config.baseUrl)) problems.push('FLOWIT_BASE_URL must be an https:// URL.');
  // The webhook always requires the secret: without it the delivery report
  // this test is meant to verify would be rejected.
  if (!config.webhookSecret) problems.push('FLOWIT_WEBHOOK_SECRET is not set (delivery reports would be rejected).');
  if (!test.senderId) problems.push('FLOWIT_TEST_SENDER_ID is not set.');
  else if (!SENDER_ID_RE.test(test.senderId)) problems.push(`FLOWIT_TEST_SENDER_ID must be ${SENDER_ID_RULE}.`);
  if (!test.messageId) problems.push('FLOWIT_TEST_MESSAGE_ID is not set.');
  else if (!/^[A-Za-z0-9_-]{1,120}$/.test(test.messageId)) problems.push('FLOWIT_TEST_MESSAGE_ID may only contain letters, digits, - and _.');
  if (!test.mobile) problems.push('FLOWIT_TEST_MOBILE is not set.');
  else if (normalizeMobile(test.mobile).reason) problems.push('FLOWIT_TEST_MOBILE is not a valid 10-digit Indian mobile number.');
  if (!test.otp) problems.push('FLOWIT_TEST_OTP is not set.');
  else if (!/^\d{4,8}$/.test(test.otp)) problems.push('FLOWIT_TEST_OTP must be 4 to 8 digits.');
  return problems;
}

// For the settings page: yes/no flags and the masked number only.
function getTestSendStatus() {
  const test = getSmsTestConfig();
  const { mobile } = normalizeMobile(test.mobile);
  const problems = testSendProblems(getSmsConfig(), test);
  return {
    eventCode: TEST_EVENT,
    senderConfigured: Boolean(test.senderId),
    templateConfigured: Boolean(test.messageId),
    mobileConfigured: Boolean(test.mobile),
    mobileValid: Boolean(mobile),
    maskedMobile: mobile ? maskMobile(mobile) : '',
    allowedHere: test.allowedHere,
    cooldownSeconds: TEST_COOLDOWN_MS / 1000,
    ready: problems.length === 0,
    problems
  };
}

function testResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventCode: row.eventCode,
    status: row.status,
    providerRequestId: row.providerRequestId || null,
    errorCode: row.errorCode || null,
    errorMessage: redactSecrets(row.errorMessage) || null,
    maskedMobile: row.maskedMobile || '',
    attempts: Number(row.attempts || 0),
    createdAt: row.createdAt
  };
}

// Sends one test SMS. Takes no input: sender ID, DLT message ID, number and
// OTP all come from the environment. The OTP and message text are not
// stored; the number only masked and hashed.
async function sendTestOtp({ actorUserId = null, fetchImpl } = {}) {
  const config = getSmsConfig();
  const test = getSmsTestConfig();
  const problems = testSendProblems(config, test);
  if (problems.length) {
    const error = new Error(`The Flowit connectivity test is not configured: ${problems.join(' ')}`);
    error.statusCode = 400;
    error.code = 'SMS_TEST_CONFIG';
    error.problems = problems;
    throw error;
  }
  const { mobile } = normalizeMobile(test.mobile);
  const now = new Date();

  // Cooldown, checked and recorded under a transaction-scoped advisory lock
  // so two rapid clicks (or two servers) cannot both pass the check. The row
  // is inserted already claimed (attempts 1): the retry job never sends it,
  // and a send interrupted by a crash ends as FAILED (INTERRUPTED).
  const row = await withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [TEST_EVENT]);
    const recent = await tx.query(
      'SELECT "createdAt" FROM "sms_messages" WHERE "eventCode" = $1 AND "createdAt" > $2 ORDER BY "createdAt" DESC LIMIT 1',
      [TEST_EVENT, new Date(now.getTime() - TEST_COOLDOWN_MS).toISOString()]
    );
    if (recent.rows.length) {
      const waitMs = new Date(recent.rows[0].createdAt).getTime() + TEST_COOLDOWN_MS - now.getTime();
      const error = new Error(`A test SMS was sent less than ${TEST_COOLDOWN_MS / 1000} seconds ago. Wait and check the SMS log before sending another.`);
      error.statusCode = 429;
      error.retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));
      throw error;
    }
    const mobileHash = hashMobile(mobile);
    return insertRow(tx, {
      idempotencyKey: `${TEST_EVENT}:${mobileHash.slice(0, 16)}:${Math.floor(now.getTime() / TEST_COOLDOWN_MS)}`,
      eventCode: TEST_EVENT,
      entityType: 'SYSTEM_TEST',
      maskedMobile: maskMobile(mobile),
      mobileHash,
      status: STATUS.PENDING,
      attempts: 1,
      lastAttemptAt: now.toISOString(),
      createdByUserId: cleanText(actorUserId) || null
    });
  });
  if (!row) {
    const error = new Error(`A test SMS was sent less than ${TEST_COOLDOWN_MS / 1000} seconds ago.`);
    error.statusCode = 429;
    error.retryAfterSeconds = TEST_COOLDOWN_MS / 1000;
    throw error;
  }

  // The OTP is the template's single {#var#}, sent as is: no truncation.
  const result = await flowit.send({
    senderId: test.senderId,
    messageId: test.messageId,
    variables: [test.otp],
    numbers: [mobile],
    udf1: row.id,
    udf2: TEST_EVENT
  }, fetchImpl ? { fetchImpl } : {});

  const db = await initializeDatabase();
  if (result.success) {
    const providerRequestId = fitRequestId(result.requestId);
    const sent = await updateRow(db, row.id, { status: STATUS.SENT, providerRequestId }, { whereStatus: [STATUS.PENDING] });
    return testResponse(sent || await updateRow(db, row.id, { providerRequestId }));
  }
  // Never retried automatically, whatever the error: the administrator
  // decides whether to send again.
  const errorCode = cleanText(result.errorCode).slice(0, MAX_ERROR_CODE);
  console.warn(`[sms] ${TEST_EVENT} ${row.id} to ${row.maskedMobile} failed: ${errorCode} ${result.message}`);
  const failed = await updateRow(db, row.id, { status: STATUS.FAILED, errorCode, errorMessage: result.message }, { whereStatus: [STATUS.PENDING] });
  return testResponse(failed || await loadRow(db, row.id));
}

module.exports = {
  EVENT_BY_VOUCHER_KEY,
  MAX_ATTEMPTS,
  SKIP,
  SMS_EVENTS,
  STATUS,
  buildVariables,
  dispatch,
  dispatchOne,
  dispatchPending,
  handleWebhook,
  hashMobile,
  listMessages,
  listTemplates,
  maskMobile,
  normalizeMobile,
  queueForVoucher,
  saveTemplate,
  summarizeForResponse,
  TEST_EVENT,
  getTestSendStatus,
  sendTestOtp,
  verifyWebhookSecret
};

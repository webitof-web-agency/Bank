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
const { initializeDatabase, restoreMainRow } = require('../../config/postgres');
const { getSmsConfig, getSmsConfigProblems } = require('../../config/sms');
const { canAccessBranchRecord } = require('../../utils/branchScope');
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
// A claimed row not finished within this time (process died mid-send) may be
// picked up again by the retry job.
const CLAIM_LEASE_MS = 5 * 60 * 1000;
// DLT variables are commonly limited to 30 characters.
const MAX_VARIABLE_LENGTH = 30;

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
  // Filler entered to get past a required field: 9999999999, 9898989898.
  if (/^(\d)\1{9}$/.test(mobile) || /^(\d\d)\1{4}$/.test(mobile)) return { mobile: '', reason: SKIP.PLACEHOLDER_MOBILE };
  return { mobile, reason: '' };
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

function buildVariables(keys, { voucher, member }) {
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
    return values[key].slice(0, MAX_VARIABLE_LENGTH);
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

async function claim(db, id) {
  const result = await db.query(
    `UPDATE "sms_messages"
       SET "attempts" = COALESCE("attempts", 0) + 1, "lastAttemptAt" = $2, "updatedAt" = $2
     WHERE "id" = $1 AND "status" = 'PENDING' AND COALESCE("attempts", 0) < $3
       AND ("lastAttemptAt" IS NULL OR "lastAttemptAt" < $4)
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
    variables = buildVariables(templateVariableKeys(row.eventCode, template), { voucher, member });
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
    const sent = await updateRow(db, row.id, { ...contact, status: STATUS.SENT, providerRequestId: result.requestId, errorCode: null, errorMessage: null }, { whereStatus: [STATUS.PENDING] });
    // A delivery report can arrive before this update; keep its status.
    return sent || updateRow(db, row.id, { providerRequestId: result.requestId });
  }

  console.warn(`[sms] ${row.eventCode} ${row.id} to ${contact.maskedMobile} failed: ${result.errorCode} ${result.message}`);
  if (result.retryable && Number(row.attempts || 0) < MAX_ATTEMPTS) {
    // Left PENDING: the retry job tries again once the claim lease runs out.
    return updateRow(db, row.id, { ...contact, errorCode: String(result.errorCode), errorMessage: result.message }, { whereStatus: [STATUS.PENDING] });
  }
  return updateRow(db, row.id, { ...contact, status: STATUS.FAILED, errorCode: String(result.errorCode), errorMessage: result.message }, { whereStatus: [STATUS.PENDING] });
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

// Retry job: PENDING rows left by a crash, or by Flowit being unreachable.
async function dispatchPending({ limit = 50, ...options } = {}) {
  const db = await initializeDatabase();
  const result = await db.query(
    `SELECT "id" FROM "sms_messages"
     WHERE "status" = 'PENDING' AND COALESCE("attempts", 0) < $1 AND ("lastAttemptAt" IS NULL OR "lastAttemptAt" < $2)
     ORDER BY "createdAt" ASC LIMIT $3`,
    [MAX_ATTEMPTS, new Date(Date.now() - CLAIM_LEASE_MS).toISOString(), limit]
  );
  const results = [];
  for (const { id } of result.rows) results.push(publicResult(await dispatchOne(id, options)));
  // Out of attempts: give up visibly instead of staying PENDING for ever.
  await db.query(
    `UPDATE "sms_messages" SET "status" = 'FAILED', "errorCode" = COALESCE("errorCode", 'MAX_ATTEMPTS'), "updatedAt" = $1
     WHERE "status" = 'PENDING' AND COALESCE("attempts", 0) >= $2 AND "lastAttemptAt" < $3`,
    [new Date().toISOString(), MAX_ATTEMPTS, new Date(Date.now() - CLAIM_LEASE_MS).toISOString()]
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
  const providerRequestId = row.providerRequestId || requestId || null;
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
  if (senderId && !/^[A-Z]{3,6}$/.test(senderId)) throw badRequest('Sender ID must be 3 to 6 letters.');
  const variableKeys = Array.isArray(data.variableKeys) && data.variableKeys.length ? data.variableKeys.map(cleanText) : event.variableKeys;
  const unknown = variableKeys.filter((key) => !event.variableKeys.includes(key) && key !== 'memberCode');
  if (unknown.length) throw badRequest(`Unknown variable(s) for ${code}: ${unknown.join(', ')}`);
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

async function listMessages({ voucherId = '', status = '', limit = 100 } = {}) {
  const db = await initializeDatabase();
  const params = [];
  const where = [];
  if (cleanText(voucherId)) { params.push(cleanText(voucherId)); where.push(`"voucherId" = $${params.length}`); }
  if (cleanText(status)) { params.push(cleanText(status).toUpperCase()); where.push(`"status" = $${params.length}`); }
  params.push(Math.max(1, Math.min(500, Number(limit) || 100)));
  const result = await db.query(
    `SELECT "id", "eventCode", "entityType", "entityCode", "voucherId", "voucherNo", "maskedMobile", "provider", "providerRequestId",
            "status", "skipReason", "errorCode", "errorMessage", "attempts", "lastAttemptAt", "deliveredAt", "createdByUserId", "createdAt", "updatedAt"
     FROM "sms_messages" ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY "createdAt" DESC LIMIT $${params.length}`,
    params
  );
  return result.rows;
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
  verifyWebhookSecret
};

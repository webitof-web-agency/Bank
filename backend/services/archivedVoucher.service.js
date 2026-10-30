'use strict';

// Editing and deleting archived legacy vouchers (legacy_historical_vouchers)
// while their FY is open.
//
// The cutover FY's balances live on the master rows as a snapshot taken at
// the cutover (members.balances and its totals, employees' loan columns,
// ledgers.openingBalance / balanceSide): the balance after every archived
// voucher. Reports walk the archive back from it, and live vouchers forward.
// So an edit changes the archived row AND moves each snapshot it touches by
// exactly the change in what the voucher does (new effect - old effect): the
// balances before the voucher stay as they were, the ones after follow it. A
// delete is an edit to nothing. What a voucher does comes from
// utils/legacyMovements.js, the same rules the reports read it with.
//
// A legacy FY database is one FY: a voucher stays in its FY, and only an open
// FY can change (fyLock: every FY before 2026-27 was closed in the old
// software; later ones until closed in Settings -> Financial Year Closing).

const crypto = require('crypto');
const { withTransaction } = require('../config/postgres');
const fyLock = require('./fyClosing/fyLock');
const {
  EMPLOYEE_GROUPS, MEMBER_BUCKETS, employeeVoucherMovement, legacyLedgerEntries, legacyNumber,
  memberVoucherMovement, recoveryLineMovement, toPaise
} = require('../utils/legacyMovements');

// The amount fields each voucher type is entered with: its total is their
// sum (true of every such legacy voucher). A Recovery From Member (5) is
// entered by its lines; the other types (bank, payment, receipt) by total.
const MEMBER_HEADS = ['ShareAmt', 'CDAmt', 'SSAamt', 'RLoanAmt', 'DLoanAmt'];
const EMPLOYEE_HEADS = ['HomeLoan', 'VehicleLoan', 'GrainAdvance'];
const HEADS_BY_TYPE = {
  1: ['RLoanAmt', 'DLoanAmt'],
  2: ['CDAmt'],
  3: ['SSAamt'],
  4: ['PremiumAmt'],
  12: EMPLOYEE_HEADS,
  13: EMPLOYEE_HEADS,
  14: MEMBER_HEADS,
  15: MEMBER_HEADS,
  20: ['CDAmt', 'SSAamt', 'RLoanAmt', 'DLoanAmt'],
  21: ['CDAmt', 'SSAamt', 'RLoanAmt', 'DLoanAmt'],
  22: EMPLOYEE_HEADS
};
const ALL_HEADS = ['ShareAmt', 'CDAmt', 'SSAamt', 'RLoanAmt', 'DLoanAmt', 'PremiumAmt', 'AdmissionFee', 'SuspenseAmt', 'HomeLoan', 'VehicleLoan', 'GrainAdvance'];
// A recovery line's fields, and the voucher head each one sums into.
const LINE_TO_HEAD = { Share: 'ShareAmt', CD: 'CDAmt', SSA: 'SSAamt', RLoan: 'RLoanAmt', DLoan: 'DLoanAmt', Premium: 'PremiumAmt', Admission: 'AdmissionFee', Suspense: 'SuspenseAmt' };
const LINE_FIELDS = Object.keys(LINE_TO_HEAD);

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function round2(value) {
  return Math.round(legacyNumber(value) * 100) / 100;
}

function parseId(id) {
  // 'legacy:<uuid>', or the CD Paid view of a transfer voucher, 'legacy:<uuid>:cd'.
  return String(id || '').replace(/^legacy:/, '').replace(/:cd$/, '');
}

// 'JilaSahkariDB2627' -> 2026-04-01 .. 2027-03-31
function fyRangeOf(sourceDatabase) {
  const match = /(\d{2})(\d{2})$/.exec(String(sourceDatabase || ''));
  if (!match) return null;
  const start = 2000 + Number(match[1]);
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

// Whether the archived vouchers of that legacy database may change.
async function isArchiveFyOpen(sourceDatabase, state = null) {
  const range = fyRangeOf(sourceDatabase);
  if (!range) return false;
  return !(await fyLock.lockFor(range.from, state)).locked;
}

function isoDay(value) {
  return value ? String(value).slice(0, 10) : '';
}

function typeOf(row) {
  return Number(row.voucherCategory);
}

// AccID -> code maps and the cash ledger, read inside the transaction. An
// AccID only means something inside its own FY database, so members and
// employees are matched among those whose master row came from it (a member
// migrated from an older FY can't appear on this FY's vouchers). Rows made in
// the app carry no source database and are matched too.
async function loadParties(tx, sourceDatabase) {
  const party = (table) => tx.query(
    `SELECT code, payload->'raw'->>'AccID' AS acc FROM ${table}
     WHERE "deletedAt" IS NULL AND payload->'raw'->>'AccID' IS NOT NULL
       AND coalesce(payload->>'sourceDatabase', $1) = $1`,
    [sourceDatabase]
  );
  // Sequential: one transaction client runs one query at a time.
  const ledgers = await tx.query(`SELECT code, payload->'raw'->>'AccID' AS acc FROM ledgers WHERE "deletedAt" IS NULL`);
  const members = await party('members');
  const employees = await party('employees');
  const codeByAccId = new Map();
  let cashAccId = '';
  for (const row of ledgers.rows) {
    if (row.acc == null) continue;
    codeByAccId.set(String(row.acc), String(row.code).trim().toUpperCase());
    if (String(row.code).trim() === '2') cashAccId = String(row.acc);
  }
  return {
    codeByAccId,
    cashAccId,
    memberByAccId: new Map(members.rows.map((row) => [String(row.acc), row.code])),
    employeeByAccId: new Map(employees.rows.map((row) => [String(row.acc), row.code]))
  };
}

// What a voucher (with its recovery lines) does to the snapshots, paise,
// signed credit-positive: Map code -> { bucket: paise } for members and
// employees, Map code -> paise for ledgers.
function effectOf(type, raw, lines, parties) {
  const members = new Map();
  const employees = new Map();
  const ledgers = new Map();
  const add = (map, code, movement, keys) => {
    if (!code || !movement) return;
    const totals = map.get(code) || Object.fromEntries(keys.map((key) => [key, 0]));
    for (const key of keys) totals[key] += (movement[key]?.credit || 0) - (movement[key]?.debit || 0);
    map.set(code, totals);
  };
  add(members, parties.memberByAccId.get(String(raw.ParticularAccID)), memberVoucherMovement(type, raw), MEMBER_BUCKETS);
  if (type === 5) {
    for (const line of lines) add(members, line.memberCode, recoveryLineMovement(line.raw), MEMBER_BUCKETS);
  }
  add(employees, parties.employeeByAccId.get(String(raw.ParticularAccID)), employeeVoucherMovement(type, raw), EMPLOYEE_GROUPS);
  for (const entry of legacyLedgerEntries(raw, parties.codeByAccId, parties.cashAccId)) {
    ledgers.set(entry.code, (ledgers.get(entry.code) || 0) + toPaise(entry.cr + entry.dr));
  }
  return { members, employees, ledgers };
}

// after - before, dropping what doesn't move.
function deltaOf(before, after) {
  const merge = (a, b, keys) => {
    const out = new Map();
    for (const code of new Set([...a.keys(), ...b.keys()])) {
      const d = Object.fromEntries(keys.map((key) => [key, (b.get(code)?.[key] || 0) - (a.get(code)?.[key] || 0)]));
      if (keys.some((key) => d[key])) out.set(code, d);
    }
    return out;
  };
  const ledgers = new Map();
  for (const code of new Set([...before.ledgers.keys(), ...after.ledgers.keys()])) {
    const d = (after.ledgers.get(code) || 0) - (before.ledgers.get(code) || 0);
    if (d) ledgers.set(code, d);
  }
  return { members: merge(before.members, after.members, MEMBER_BUCKETS), employees: merge(before.employees, after.employees, EMPLOYEE_GROUPS), ledgers };
}

// The member balance keys as member.balances spells them (see
// memberBalanceAnchors in banking.service).
const MEMBER_BALANCE_KEY = { share: 'share', specialDeposit: 'specialDeposit', compulsoryDeposit: 'compulsoryDeposit', loan: 'loan', loanAgainstDeposit: 'loanAgainstDeposit' };
const MEMBER_BALANCE_ALIAS = { specialDeposit: 'ssa', compulsoryDeposit: 'cd', loan: 'regularLoan', loanAgainstDeposit: 'lad' };
const EMPLOYEE_COLUMN = { housingLoan: 'homeLoanBalance', vehicleLoan: 'vehicleLoanBalance', grainAdvance: 'grainAdvanceBalance' };

async function applyDelta(tx, delta) {
  for (const [code, d] of delta.members) {
    const row = (await tx.query('SELECT balances FROM members WHERE code = $1 AND "deletedAt" IS NULL FOR UPDATE', [code])).rows[0];
    if (!row) continue;
    const balances = { ...(row.balances || {}) };
    for (const bucket of MEMBER_BUCKETS) {
      const key = MEMBER_BALANCE_KEY[bucket];
      const current = legacyNumber(balances[key] ?? balances[MEMBER_BALANCE_ALIAS[bucket]] ?? 0);
      balances[key] = round2(current + d[bucket] / 100);
    }
    await tx.query(
      `UPDATE members SET balances = $2::jsonb, "openingBalance" = $3, "depositBalance" = $4, "loanOutstanding" = $5, "updatedAt" = now()
       WHERE code = $1 AND "deletedAt" IS NULL`,
      [code, JSON.stringify(balances), balances.share,
        round2(Math.abs(balances.compulsoryDeposit) + Math.abs(balances.specialDeposit)),
        round2(Math.abs(balances.loan) + Math.abs(balances.loanAgainstDeposit))]
    );
  }
  for (const [code, d] of delta.employees) {
    const sets = EMPLOYEE_GROUPS.map((group, i) => `"${EMPLOYEE_COLUMN[group]}" = round(coalesce("${EMPLOYEE_COLUMN[group]}", 0) + $${i + 2}::numeric, 2)`);
    await tx.query(
      `UPDATE employees SET ${sets.join(', ')}, "updatedAt" = now() WHERE code = $1 AND "deletedAt" IS NULL`,
      [code, ...EMPLOYEE_GROUPS.map((group) => d[group] / 100)]
    );
  }
  for (const [code, paise] of delta.ledgers) {
    const row = (await tx.query('SELECT "openingBalance", "balanceSide" FROM ledgers WHERE code = $1 AND "deletedAt" IS NULL FOR UPDATE', [code])).rows[0];
    if (!row) continue;
    const signed = (row.balanceSide === 'DR' ? -1 : 1) * legacyNumber(row.openingBalance) + paise / 100;
    const side = signed > 0.005 ? 'CR' : signed < -0.005 ? 'DR' : 'ZERO';
    await tx.query(
      'UPDATE ledgers SET "openingBalance" = $2, "balanceSide" = $3, "updatedAt" = now() WHERE code = $1 AND "deletedAt" IS NULL',
      [code, round2(Math.abs(signed)), side]
    );
  }
}

async function loadArchived(tx, id, { lock = false } = {}) {
  const row = (await tx.query(
    `SELECT id, "sourceDatabase", "sourceTable", "sourceKey", "voucherNo", "voucherCategory", amount, narration, payload
     FROM legacy_historical_vouchers WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [parseId(id)]
  )).rows[0];
  if (!row) return null;
  const raw = row.payload?.raw || {};
  const lines = typeOf(row) === 5
    ? (await tx.query(
      `SELECT id, "sourceKey", "memberCode", "totalAmount", payload FROM legacy_historical_recovery
       WHERE "sourceDatabase" = $1 AND payload->'raw'->>'TransNo' = $2${lock ? ' FOR UPDATE' : ''}`,
      [row.sourceDatabase, String(raw.TransNo)]
    )).rows.map((line) => ({ ...line, raw: line.payload?.raw || {} }))
    : [];
  return { row, raw, lines };
}

async function writeAudit(tx, recordId, action, changes, actorUserId) {
  const now = new Date().toISOString();
  await tx.query(
    `INSERT INTO audit_log ("id", "tableName", "recordId", "action", "actorUserId", "changes", "createdAt", "updatedAt")
     VALUES ($1, 'legacy_historical_vouchers', $2, $3, $4, $5, $6, $6)`,
    [crypto.randomUUID(), String(recordId), action, actorUserId || null, JSON.stringify(changes), now]
  );
}

function resetCaches() {
  // Lazy: banking.service requires this module.
  require('./banking.service').resetLegacyArchiveCaches();
}

function enteredByOf(type) {
  return type === 5 ? 'lines' : HEADS_BY_TYPE[type] ? 'heads' : 'total';
}

const TYPE_LABELS = { 1: 'Loan Paid to Member', 3: 'SSA Paid to Member', 5: 'Recovery From Member', 8: 'Deposit in Bank', 9: 'Cheque Issue' };

const PARTNER_TYPES = { 1: [9], 3: [9], 9: [1, 3], 5: [8], 8: [5] };

// The voucher's other side, when it can be found. In the old software only a
// cash voucher balances on its own (it carries the cash leg); a cheque / DD
// voucher has no pay-mode leg, and its bank side is a separate voucher with
// the same cheque no. and amount — a Loan / SSA Paid by cheque and its Cheque
// Issue, a recovery by DD and its Deposit in Bank. Only a single match counts.
async function findPartner(tx, row, raw, options = {}) {
  if (legacyNumber(raw.PayModeAccID) > 0) return null;
  const cheque = String(raw.ChequeNo ?? '').trim();
  if (!cheque) return null;
  const { rows } = await tx.query(
    `SELECT id FROM legacy_historical_vouchers
     WHERE "sourceDatabase" = $1 AND id <> $2
       AND trim(payload->'raw'->>'ChequeNo') = $3
       AND (payload->'raw'->>'TotalAmt')::numeric = $4::numeric
       AND coalesce((payload->'raw'->>'PayModeAccID')::numeric, 0) = 0`,
    [row.sourceDatabase, row.id, cheque, legacyNumber(raw.TotalAmt)]
  );
  if (rows.length !== 1) return null;
  const partner = await loadArchived(tx, rows[0].id, options);
  // Only the real pairs: a voucher of another type with the same cheque no.
  // and amount is not this one's other side (and editing it here would skip
  // that type's own permission).
  return partner && (PARTNER_TYPES[typeOf(row)] || []).includes(typeOf(partner.row)) ? partner : null;
}

function partnerInfo(partner) {
  if (!partner) return null;
  const type = typeOf(partner.row);
  return {
    id: `legacy:${partner.row.id}`,
    voucherNo: String(partner.row.voucherNo ?? ''),
    transType: type,
    label: TYPE_LABELS[type] || `voucher type ${type}`,
    // Its amount follows an edit only when it is entered by its total.
    followsAmount: enteredByOf(type) === 'total'
  };
}

function sumDeltas(a, b) {
  const merge = (x, y) => {
    const out = new Map(x);
    for (const [code, d] of y) {
      const prev = out.get(code);
      out.set(code, prev ? Object.fromEntries(Object.keys(d).map((k) => [k, prev[k] + d[k]])) : d);
    }
    return out;
  };
  const ledgers = new Map(a.ledgers);
  for (const [code, d] of b.ledgers) ledgers.set(code, (ledgers.get(code) || 0) + d);
  return { members: merge(a.members, b.members), employees: merge(a.employees, b.employees), ledgers };
}

// The Trial Balance moves by the sum of every ledger change: 0 when the
// change is balanced (a cash voucher, or both sides of a pair).
function imbalanceOf(delta) {
  let paise = 0;
  for (const d of delta.ledgers.values()) paise += d;
  return paise / 100;
}

function imbalanceError(amount, action) {
  const rupees = Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const error = fail(
    `This voucher's other side is a separate voucher that can't be found, so ${action} it alone puts the Trial Balance out by Rs ${rupees}. Change the other voucher by the same amount too, or confirm to go ahead.`,
    409
  );
  error.code = 'TB_IMBALANCE';
  error.amount = amount;
  return error;
}

// For the edit dialog: the fields the voucher is entered with.
async function getArchivedVoucher(id) {
  const { initializeDatabase } = require('../config/postgres');
  const database = await initializeDatabase();
  const found = await loadArchived(database, id);
  if (!found) return null;
  const { row, raw, lines } = found;
  const type = typeOf(row);
  const memberNames = lines.length
    ? new Map((await database.query('SELECT code, name FROM members WHERE code = ANY($1)', [lines.map((line) => line.memberCode)])).rows.map((m) => [m.code, m.name]))
    : new Map();
  const range = fyRangeOf(row.sourceDatabase);
  const partner = await findPartner(database, row, raw);
  return {
    id: `legacy:${row.id}`,
    // A cash voucher balances on its own; otherwise its other side, if found.
    selfBalancing: legacyNumber(raw.PayModeAccID) > 0,
    partner: partnerInfo(partner),
    voucherNo: String(row.voucherNo ?? ''),
    transType: type,
    voucherType: raw.VoucherType || '',
    voucherDate: isoDay(raw.VoucherDate),
    chequeNo: raw.ChequeNo ?? '',
    chequeDate: isoDay(raw.ChequeDate),
    narration: row.narration || raw.Narration || '',
    totalAmt: legacyNumber(raw.TotalAmt),
    // Entered by heads (total = their sum), by lines (recovery) or by total.
    enteredBy: enteredByOf(type),
    heads: (HEADS_BY_TYPE[type] || []).map((field) => ({ field, value: legacyNumber(raw[field]) })),
    lines: lines.map((line) => ({
      id: line.id,
      memberCode: line.memberCode,
      memberName: memberNames.get(line.memberCode) || '',
      ...Object.fromEntries(LINE_FIELDS.map((field) => [field, legacyNumber(line.raw[field])])),
      total: legacyNumber(line.raw.TotalAmount)
    })),
    fyFrom: range?.from || '',
    fyTo: range?.to || '',
    editable: await isArchiveFyOpen(row.sourceDatabase)
  };
}

function amountOf(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw fail(`${label} must be a number of 0 or more.`);
  return round2(number);
}

// The edited raw row (and lines) from the dialog's input.
function applyInput(type, raw, lines, input) {
  const next = { ...raw };
  if (input.voucherDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.voucherDate))) throw fail('Enter a valid voucher date.');
    next.VoucherDate = `${input.voucherDate}T00:00:00.000Z`;
  }
  if (input.chequeNo !== undefined) next.ChequeNo = String(input.chequeNo ?? '').trim() || null;
  if (input.chequeDate !== undefined) next.ChequeDate = input.chequeDate ? `${String(input.chequeDate).slice(0, 10)}T00:00:00.000Z` : null;
  if (input.narration !== undefined) next.Narration = String(input.narration ?? '').trim();

  let nextLines = lines;
  if (type === 5) {
    const edits = new Map((input.lines || []).map((line) => [String(line.id), line]));
    nextLines = lines.map((line) => {
      const edit = edits.get(String(line.id));
      if (!edit) return line;
      const lineRaw = { ...line.raw };
      for (const field of LINE_FIELDS) {
        if (edit[field] !== undefined) lineRaw[field] = amountOf(edit[field], `${line.memberCode} ${field}`);
      }
      lineRaw.TotalAmount = round2(LINE_FIELDS.reduce((sum, field) => sum + legacyNumber(lineRaw[field]), 0));
      return { ...line, raw: lineRaw };
    });
    for (const [field, head] of Object.entries(LINE_TO_HEAD)) {
      next[head] = round2(nextLines.reduce((sum, line) => sum + legacyNumber(line.raw[field]), 0));
    }
    next.TotalAmt = round2(nextLines.reduce((sum, line) => sum + legacyNumber(line.raw.TotalAmount), 0));
  } else if (HEADS_BY_TYPE[type]) {
    for (const field of HEADS_BY_TYPE[type]) {
      if (input.amounts?.[field] !== undefined) next[field] = amountOf(input.amounts[field], field);
    }
    next.TotalAmt = round2(ALL_HEADS.reduce((sum, field) => sum + legacyNumber(next[field]), 0));
  } else if (input.amounts?.TotalAmt !== undefined) {
    next.TotalAmt = amountOf(input.amounts.TotalAmt, 'Amount');
  }
  if (!(legacyNumber(next.TotalAmt) > 0)) throw fail('The voucher amount must be more than 0.');
  return { raw: next, lines: nextLines };
}

async function updateArchivedVoucher(id, input = {}, meta = {}) {
  const result = await withTransaction(async (tx) => {
    const found = await loadArchived(tx, id, { lock: true });
    if (!found) return null;
    const { row, raw, lines } = found;
    const type = typeOf(row);
    const range = fyRangeOf(row.sourceDatabase);
    const next = applyInput(type, raw, lines, input);
    const newDate = isoDay(next.raw.VoucherDate);
    await fyLock.assertDatesOpen([range?.from, newDate]);
    if (range && (newDate < range.from || newDate > range.to)) {
      throw fail(`The date must stay in FY ${range.from.slice(0, 4)}-${range.to.slice(2, 4)}: each legacy year is its own set of books.`);
    }

    const parties = await loadParties(tx, row.sourceDatabase);
    let delta = deltaOf(effectOf(type, raw, lines, parties), effectOf(type, next.raw, next.lines, parties));

    // Its other side follows the date and cheque, and the amount when that
    // voucher is entered by its total (a Cheque Issue, a Deposit in Bank).
    const partner = await findPartner(tx, row, raw, { lock: true });
    let partnerRaw = null;
    if (partner) {
      partnerRaw = { ...partner.raw, VoucherDate: next.raw.VoucherDate, ChequeNo: next.raw.ChequeNo, ChequeDate: next.raw.ChequeDate };
      if (enteredByOf(typeOf(partner.row)) === 'total') partnerRaw.TotalAmt = next.raw.TotalAmt;
      const partnerType = typeOf(partner.row);
      delta = sumDeltas(delta, deltaOf(effectOf(partnerType, partner.raw, partner.lines, parties), effectOf(partnerType, partnerRaw, partner.lines, parties)));
    }
    const imbalance = imbalanceOf(delta);
    if (Math.abs(imbalance) >= 0.005 && input.acceptImbalance !== true) throw imbalanceError(imbalance, 'changing');
    await applyDelta(tx, delta);

    if (partner) {
      await tx.query(
        'UPDATE legacy_historical_vouchers SET payload = $2::jsonb, amount = $3, "updatedAt" = now() WHERE id = $1',
        [partner.row.id, JSON.stringify({ ...(partner.row.payload || {}), raw: partnerRaw }), partnerRaw.TotalAmt]
      );
      await writeAudit(tx, partner.row.id, 'UPDATE', { before: { raw: partner.raw }, after: { raw: partnerRaw }, followed: `legacy:${row.id}` }, meta.actorUserId);
    }

    const payload = { ...(row.payload || {}), raw: next.raw };
    await tx.query(
      'UPDATE legacy_historical_vouchers SET payload = $2::jsonb, amount = $3, narration = $4, "updatedAt" = now() WHERE id = $1',
      [row.id, JSON.stringify(payload), next.raw.TotalAmt, next.raw.Narration ?? row.narration]
    );
    for (const line of next.lines) {
      if (line.raw === lines.find((old) => old.id === line.id)?.raw) continue;
      await tx.query(
        'UPDATE legacy_historical_recovery SET payload = $2::jsonb, "totalAmount" = $3, "updatedAt" = now() WHERE id = $1',
        [line.id, JSON.stringify({ ...(line.payload || {}), raw: line.raw }), line.raw.TotalAmount]
      );
    }
    await writeAudit(tx, row.id, 'UPDATE', { before: { raw, lines: lines.map((l) => l.raw) }, after: { raw: next.raw, lines: next.lines.map((l) => l.raw) }, imbalance }, meta.actorUserId);
    return { id: `legacy:${row.id}`, partner: partnerInfo(partner), imbalance };
  });
  resetCaches();
  return result;
}

// Removes one archived voucher (and its recovery lines): logged in the
// deleted-voucher tables, and in the audit log.
async function removeArchived(tx, { row, raw, lines }, meta, note = {}) {
  const now = new Date().toISOString();
  const deletedBy = { deletedInApp: true, deletedByUserId: meta.actorUserId || null, ...note };
  await tx.query(
    `INSERT INTO legacy_deleted_vouchers ("id", "sourceDatabase", "sourceTable", "sourceKey", "voucherNo", "transType", "voucherType", "date", "amount", "deletedAt", "payload", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10, $10)`,
    [crypto.randomUUID(), row.sourceDatabase, row.sourceTable, row.sourceKey, row.voucherNo, String(typeOf(row)), raw.VoucherType || null,
      raw.VoucherDate || null, legacyNumber(raw.TotalAmt), now, JSON.stringify({ raw, ...deletedBy })]
  );
  for (const line of lines) {
    await tx.query(
      `INSERT INTO legacy_deleted_recovery_lines ("id", "sourceDatabase", "sourceTable", "sourceKey", "memberCode", "totalAmount", "deletedAt", "payload", "createdAt", "updatedAt")
       VALUES ($1, $2, 'EntTransData', $3, $4, $5, $6, $7, $6, $6)`,
      [crypto.randomUUID(), row.sourceDatabase, line.sourceKey, line.memberCode, legacyNumber(line.raw.TotalAmount), now, JSON.stringify({ raw: line.raw, ...deletedBy })]
    );
  }
  if (lines.length) await tx.query('DELETE FROM legacy_historical_recovery WHERE id = ANY($1)', [lines.map((line) => line.id)]);
  await tx.query('DELETE FROM legacy_historical_vouchers WHERE id = $1', [row.id]);
  await writeAudit(tx, row.id, 'DELETE', { before: { raw, lines: lines.map((l) => l.raw) }, after: null, ...note }, meta.actorUserId);
}

// Deletes the voucher, and its other side with it when that is found.
async function deleteArchivedVoucher(id, meta = {}, { acceptImbalance = false } = {}) {
  const result = await withTransaction(async (tx) => {
    const found = await loadArchived(tx, id, { lock: true });
    if (!found) return false;
    await fyLock.assertDatesOpen([fyRangeOf(found.row.sourceDatabase)?.from]);
    const partner = await findPartner(tx, found.row, found.raw, { lock: true });

    const parties = await loadParties(tx, found.row.sourceDatabase);
    const nothing = { members: new Map(), employees: new Map(), ledgers: new Map() };
    const removed = [found, partner].filter(Boolean);
    const delta = removed
      .map((v) => deltaOf(effectOf(typeOf(v.row), v.raw, v.lines, parties), nothing))
      .reduce((sum, d) => sumDeltas(sum, d), nothing);
    const imbalance = imbalanceOf(delta);
    if (Math.abs(imbalance) >= 0.005 && !acceptImbalance) throw imbalanceError(imbalance, 'deleting');
    await applyDelta(tx, delta);

    await removeArchived(tx, found, meta, { imbalance });
    if (partner) await removeArchived(tx, partner, meta, { deletedWith: `legacy:${found.row.id}` });
    return { partner: partnerInfo(partner), imbalance };
  });
  resetCaches();
  return result;
}

module.exports = {
  deleteArchivedVoucher,
  getArchivedVoucher,
  isArchiveFyOpen,
  updateArchivedVoucher
};

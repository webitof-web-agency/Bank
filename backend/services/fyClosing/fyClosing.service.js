// Year-end close for one financial year (2026-27 onward).
//
// The legacy software started a new SQL Server database every FY: Asset /
// Liability ledgers opened at the previous closing, Income / Expense / P&L at
// zero, and every member's and employee's opening was the previous closing
// plus that year's interest (MbrCBlnc / EmpCBlnc), with no voucher. The
// accountant posted the interest totals and the profit appropriation as
// vouchers on 31 March. This app keeps every year in one database, so the
// close does all of that here:
//
//   1. interest per member and employee, exactly as legacy computed it
//      (yearInterest.service.js);
//   2. a Journal Voucher on 31 March with the interest totals per head;
//   3. a Journal Voucher on 31 March appropriating the year's net profit to
//      the funds the society decides (P&L A/c Dr, funds Cr);
//   4. next year's member / employee openings (closing + interest), written
//      where the archived legacy openings are, so every member report shows
//      the carry-forward on 1 April as it does for the legacy years; Income /
//      Expense / P&L restart at zero in the reports (banking.service);
//   5. the year locked against any change (fyLock.js).
//
// Reopening undoes all of it, as long as the next year is still open.
const banking = require('../banking.service');
const { Ledger, Voucher } = require('../../models/banking.models');
const { initializeDatabase } = require('../../config/postgres');
const fyLock = require('./fyLock');
const yearInterest = require('./yearInterest.service');

const LEGACY_FYS = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
const SOURCE_DATABASE = 'APP-FY-CLOSE';

function cleanText(value) {
  return String(value ?? '').trim();
}

function httpError(message, statusCode = 400, code = '') {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// Today in India, 'YYYY-MM-DD'.
function todayIst(now = new Date()) {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function previousFy(fy) {
  const year = Number(fy.slice(0, 4)) - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Ledgers the close posts to

// The interest heads, found by their names (the legacy chart of accounts),
// and the principal ledgers by their accounting role.
const INTEREST_HEADS = [
  { key: 'cd', label: 'Compulsory Deposit interest paid', side: 'paid', principalRole: 'COMPULSORY_DEPOSIT', pattern: /intre?s?t\s*paid.*compulsory/i },
  { key: 'ssa', label: 'Special Saving interest paid', side: 'paid', principalRole: 'SPECIAL_DEPOSIT', pattern: /intre?s?t\s*paid.*s\.?\s*s\.?\s*a/i },
  { key: 'loan', label: 'Members loan interest received', side: 'received', principalRole: 'REGULAR_LOAN', pattern: /intre?s?t\s*rec\w*.*members?\s*loan/i },
  { key: 'dloan', label: 'Loan against deposit interest received', side: 'received', principalRole: 'LOAN_AGAINST_DEPOSIT', pattern: /intre?s?t\s*rec\w*.*deposit\s*loan/i },
  { key: 'housing', label: 'Staff housing loan interest received', side: 'received', principalRole: 'EMPLOYEE_HOUSING_LOAN', pattern: /intre?s?t\s*rec\w*.*house\s*loan.*staff/i },
  { key: 'vehicle', label: 'Staff vehicle loan interest received', side: 'received', principalRole: 'EMPLOYEE_VEHICLE_LOAN', pattern: /intre?s?t\s*rec\w*.*vehicle\s*loan.*staff/i }
];

async function findPostingLedgers() {
  const ledgers = await Ledger.find({}).lean();
  const byRole = new Map(ledgers.filter((l) => l.semanticRole).map((l) => [cleanText(l.semanticRole).toUpperCase(), l]));
  const heads = {};
  for (const head of INTEREST_HEADS) {
    heads[head.key] = {
      interest: ledgers.find((l) => head.pattern.test(cleanText(l.name))) || null,
      principal: byRole.get(head.principalRole) || null
    };
  }
  const profitAndLoss = ledgers.find((l) => cleanText(l.nature).toUpperCase() === 'PRIMARY') || null;
  return { ledgers, heads, profitAndLoss };
}

const ledgerRef = (l) => (l ? { code: cleanText(l.code), name: l.name } : null);

// ---------------------------------------------------------------------------
// Status

async function listYears({ now = new Date() } = {}) {
  const state = await fyLock.readState();
  const currentFy = fyLock.fyOfDate(todayIst(now));
  const years = LEGACY_FYS.map((fy) => ({ fy, status: 'CLOSED', source: 'legacy', note: 'Closed in the old software (one database per year).' }));
  const lastYear = Math.max(Number(currentFy.slice(0, 4)), Number(fyLock.FIRST_APP_FY.slice(0, 4)));
  for (let year = Number(fyLock.FIRST_APP_FY.slice(0, 4)); year <= lastYear; year += 1) {
    const fy = `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
    const record = state.years[fy] || {};
    years.push({
      fy,
      status: record.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
      source: 'app',
      // A reopened year keeps its old close in the record; show it only while closed.
      closedAt: record.status === 'CLOSED' ? record.closedAt || null : null,
      closedByUserId: record.status === 'CLOSED' ? record.closedByUserId || null : null,
      reopenedAt: record.reopenedAt || null,
      reopenReason: record.reopenReason || '',
      remarks: record.remarks || '',
      summary: record.status === 'CLOSED' ? record.summary || null : null
    });
  }
  return { currentFy, firstAppFy: fyLock.FIRST_APP_FY, years };
}

// Why a year cannot be closed right now (empty when it can).
async function closeBlockers(fy, { now = new Date() } = {}) {
  const { end } = yearInterest.fyBounds(fy);
  const state = await fyLock.readState();
  const problems = [];
  if (fy < fyLock.FIRST_APP_FY) problems.push(`FY ${fy} was closed in the old software.`);
  if (state.years[fy]?.status === 'CLOSED') problems.push(`FY ${fy} is already closed.`);
  const previous = previousFy(fy);
  if (fy > fyLock.FIRST_APP_FY && state.years[previous]?.status !== 'CLOSED') problems.push(`Close FY ${previous} first.`);
  if (todayIst(now) <= end) problems.push(`FY ${fy} ends on ${end.split('-').reverse().join('-')}; it can be closed from the next day.`);
  return problems;
}

// ---------------------------------------------------------------------------
// Preview

function interestJournalLines(totals, posting) {
  const lines = [];
  const missing = [];
  for (const head of INTEREST_HEADS) {
    const total = round2(totals[head.key]);
    if (!total) continue;
    const { interest, principal } = posting.heads[head.key];
    if (!interest || !principal) {
      missing.push(`${head.label}: ${!interest ? 'interest ledger' : `ledger with role ${head.principalRole}`} not found`);
      continue;
    }
    // Paid (deposits): interest expense Dr, member deposit Cr. Received
    // (loans): member loan Dr, interest income Cr. Member loan interest comes
    // out positive (legacy MbrCBlnc), employee interest negative (EmpCBlnc).
    let charged = head.side === 'paid' ? total : (['housing', 'vehicle'].includes(head.key) ? -total : total);
    const [drLedger, crLedger] = head.side === 'paid' ? [interest, principal] : [principal, interest];
    const [dr, cr] = charged >= 0 ? [drLedger, crLedger] : [crLedger, drLedger];
    charged = Math.abs(charged);
    lines.push({ ledgerCode: cleanText(dr.code), debit: charged, credit: 0, head: head.key });
    lines.push({ ledgerCode: cleanText(cr.code), debit: 0, credit: charged, head: head.key });
  }
  return { lines, missing };
}

// Net profit of the year (credit-positive: profit > 0) from the ledger
// snapshot, plus the effect of interest not yet posted.
async function yearProfit(fy, pendingLines = []) {
  const { start, end } = yearInterest.fyBounds(fy);
  const snapshot = await banking.getLedgerSnapshots({ dateFrom: start, dateTo: end });
  const natures = new Set(['INCOME', 'EXPENSE', 'PRIMARY']);
  let profit = snapshot.filter((row) => natures.has(cleanText(row.nature).toUpperCase()))
    .reduce((total, row) => total + Number(row.signedBalance || 0), 0);
  if (pendingLines.length) {
    const ledgers = await Ledger.find({}).lean();
    const natureByCode = new Map(ledgers.map((l) => [cleanText(l.code).toUpperCase(), cleanText(l.nature).toUpperCase()]));
    for (const line of pendingLines) {
      if (natures.has(natureByCode.get(cleanText(line.ledgerCode).toUpperCase()))) profit += Number(line.credit || 0) - Number(line.debit || 0);
    }
  }
  return round2(profit);
}

function sumHeads(rows, keys) {
  return Object.fromEntries(keys.map((k) => [k, rows.reduce((t, r) => t + Number(r.interest[k] || 0), 0)]));
}

async function preview(fy, { now = new Date() } = {}) {
  const bounds = yearInterest.fyBounds(fy);
  const [blockers, members, employees, posting, rates, noInterestCount] = await Promise.all([
    closeBlockers(fy, { now }),
    yearInterest.computeMemberInterest(fy),
    yearInterest.computeEmployeeInterest(fy),
    findPostingLedgers(),
    yearInterest.memberRates(bounds.end),
    banking.listResource('noInterestMembers').then((rows) => rows.length).catch(() => 0)
  ]);
  const totals = { ...sumHeads(members, ['cd', 'ssa', 'loan', 'dloan']), ...sumHeads(employees, ['housing', 'vehicle']) };
  const interest = interestJournalLines(totals, posting);
  const memberLines = interest.lines.filter((line) => !['housing', 'vehicle'].includes(line.head));
  // The profit to appropriate, with and without the staff interest (posted
  // only when the accountant includes it).
  const profitAfterInterest = await yearProfit(fy, memberLines);
  const profitWithEmployeeInterest = await yearProfit(fy, interest.lines);
  const funds = posting.ledgers
    .filter((l) => cleanText(l.nature).toUpperCase() === 'LIABILITY' && /fund|dividend|reserve/i.test(cleanText(l.name)))
    .map((l) => ({ code: cleanText(l.code), name: l.name }));
  const warnings = [];
  if (!noInterestCount) warnings.push('The no-interest member list is empty. Legacy excluded about 40 members from interest; load the list (Transactions -> Other -> No Interest Members) before closing, or they will be paid interest.');
  for (const [key, value] of Object.entries(rates)) if (!value) warnings.push(`The ${key} interest rate is 0 on ${bounds.end}.`);
  // Staff interest due but no year-end charge posted (legacy always posted one).
  for (const e of employees) {
    const due = round2(Number(e.interest.housing || 0) + Number(e.interest.vehicle || 0) + Number(e.received || 0));
    if (Math.abs(due) >= 1 && !Number(e.received || 0)) {
      warnings.push(`No year-end staff interest is posted for ${e.name || e.employeeCode} (about ${due.toFixed(2)} due). Post it as Interest Receive From Employee on ${bounds.end.split('-').reverse().join('-')} before closing.`);
    }
  }
  return {
    ...bounds,
    canClose: blockers.length === 0 && interest.missing.length === 0,
    blockers: blockers.concat(interest.missing),
    warnings,
    rates,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    interestLines: interest.lines,
    profitAfterInterest,
    profitWithEmployeeInterest,
    employeeInterestNote: 'As in the old software, post each employee\'s year-end interest first: Transactions -> Interest -> Receive From Employee, dated 31 March, mode Transfer (charged to the loan) or Cash. The close then carries only the small remainder between that charge and the old software\'s own calculation.',
    employeeInterestReceived: employees.reduce((t, e) => t + Number(e.received || 0), 0),
    profitAndLoss: ledgerRef(posting.profitAndLoss),
    funds,
    members: members.map((m) => ({ memberCode: m.memberCode, name: m.name, branchCode: m.branchCode, eligible: m.eligible, noInterest: m.noInterest, interest: m.interest, closing: m.closing })),
    employees: employees.map((e) => ({ employeeCode: e.employeeCode, name: e.name, interest: e.interest, received: e.received, due: round2(Number(e.interest.housing || 0) + Number(e.interest.vehicle || 0) + Number(e.received || 0)), closing: e.closing }))
  };
}

// ---------------------------------------------------------------------------
// Openings (next year)

async function ensureOpeningsTables(db) {
  const common = `id uuid PRIMARY KEY, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
    "sourceDatabase" varchar(120), "sourceTable" varchar(120), "sourceKey" varchar(120)`;
  await db.query(`CREATE TABLE IF NOT EXISTS legacy_historical_member_openings (${common}, "memberCode" varchar(80), "fyStart" varchar(10),
    share numeric(15,2), "compulsoryDeposit" numeric(15,2), "specialDeposit" numeric(15,2), loan numeric(15,2), "loanAgainstDeposit" numeric(15,2), payload jsonb,
    UNIQUE ("sourceDatabase", "sourceTable", "sourceKey"))`);
  await db.query(`CREATE TABLE IF NOT EXISTS legacy_historical_employee_openings (${common}, "employeeCode" varchar(80), "fyStart" varchar(10),
    "housingLoan" numeric(15,2), "vehicleLoan" numeric(15,2), "grainAdvance" numeric(15,2), payload jsonb,
    UNIQUE ("sourceDatabase", "sourceTable", "sourceKey"))`);
}

// Member opening for next year: closing plus interest (deposit interest adds,
// loan interest is charged, so it is taken off the signed loan balance).
function memberNextOpening(m) {
  const carried = {
    share: 0,
    compulsoryDeposit: round2(m.interest.cd),
    specialDeposit: round2(m.interest.ssa),
    loan: round2(-m.interest.loan),
    loanAgainstDeposit: round2(-m.interest.dloan)
  };
  const opening = {};
  for (const key of Object.keys(carried)) opening[key] = round2((m.closing[key] || 0) + carried[key]);
  return { opening, carried };
}

async function writeOpenings(db, fy, members, employees, nextStart, start) {
  const crypto = require('crypto');
  const table = `fy_close_${fy}`;
  const now = new Date().toISOString();
  const existing = await db.query('SELECT "memberCode", payload FROM legacy_historical_member_openings WHERE "fyStart" = $1', [start]);
  const priorRaw = new Map(existing.rows.map((r) => [r.memberCode, r.payload?.raw || {}]));
  const previousInterest = {};
  for (const m of members) {
    const { opening, carried } = memberNextOpening(m);
    const base = priorRaw.get(m.memberCode) || {};
    const raw = { ...base, MbrCBlnc: null, fyCloseInterest: carried, source: 'app-fy-close' };
    delete raw.opening;
    await db.query(
      `INSERT INTO legacy_historical_member_openings (id, "createdAt", "updatedAt", "sourceDatabase", "sourceTable", "sourceKey", "memberCode", "fyStart", share, "compulsoryDeposit", "specialDeposit", loan, "loanAgainstDeposit", payload)
       VALUES ($1,$2,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [crypto.randomUUID(), now, SOURCE_DATABASE, table, m.memberCode, nextStart, opening.share, opening.compulsoryDeposit, opening.specialDeposit, opening.loan, opening.loanAgainstDeposit, { raw }]
    );
    // This year's own row: the interest the close computed (members reports
    // read a closed year's interest from it), or a new row for a member the
    // archive does not have, so the carry-forward can be found.
    const yearInterestFields = { MContryIntr: m.interest.cd, MSSAIntr: m.interest.ssa, MRLoanIntr: m.interest.loan, MDLoanIntr: m.interest.dloan };
    if (priorRaw.has(m.memberCode)) {
      previousInterest[m.memberCode] = base.MbrCBlnc ?? null;
      await db.query(
        `UPDATE legacy_historical_member_openings SET payload = jsonb_set(payload, '{raw,MbrCBlnc}', $1::jsonb), "updatedAt" = $2 WHERE "fyStart" = $3 AND "memberCode" = $4`,
        [JSON.stringify(yearInterestFields), now, start, m.memberCode]
      );
    } else {
      await db.query(
        `INSERT INTO legacy_historical_member_openings (id, "createdAt", "updatedAt", "sourceDatabase", "sourceTable", "sourceKey", "memberCode", "fyStart", share, "compulsoryDeposit", "specialDeposit", loan, "loanAgainstDeposit", payload)
         VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [crypto.randomUUID(), now, SOURCE_DATABASE, `${table}_year`, m.memberCode, m.memberCode, start, m.opening.share, m.opening.compulsoryDeposit, m.opening.specialDeposit, m.opening.loan, m.opening.loanAgainstDeposit, { raw: { MbrCBlnc: yearInterestFields, source: 'app-fy-close' } }]
      );
    }
  }
  for (const e of employees) {
    // Employee interest is signed as legacy EmpCBlnc (charged = negative)
    // and adds straight onto the signed balance (legacy carried it so).
    const opening = {
      housingLoan: round2((e.closing.housingLoan || 0) + (e.interest.housing || 0)),
      vehicleLoan: round2((e.closing.vehicleLoan || 0) + (e.interest.vehicle || 0)),
      grainAdvance: round2(e.closing.grainAdvance || 0)
    };
    await db.query(
      `INSERT INTO legacy_historical_employee_openings (id, "createdAt", "updatedAt", "sourceDatabase", "sourceTable", "sourceKey", "employeeCode", "fyStart", "housingLoan", "vehicleLoan", "grainAdvance", payload)
       VALUES ($1,$2,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10)`,
      [crypto.randomUUID(), now, SOURCE_DATABASE, table, e.employeeCode, nextStart, opening.housingLoan, opening.vehicleLoan, opening.grainAdvance, { raw: { EmpCBlnc: { HLoanIntr: e.interest.housing, VLoanIntr: e.interest.vehicle }, source: 'app-fy-close' } }]
    );
  }
  return previousInterest;
}

async function removeOpenings(db, fy, start, previousInterest = {}) {
  const table = `fy_close_${fy}`;
  await db.query('DELETE FROM legacy_historical_member_openings WHERE "sourceDatabase" = $1 AND "sourceTable" IN ($2, $3)', [SOURCE_DATABASE, table, `${table}_year`]);
  await db.query('DELETE FROM legacy_historical_employee_openings WHERE "sourceDatabase" = $1 AND "sourceTable" = $2', [SOURCE_DATABASE, table]);
  const now = new Date().toISOString();
  for (const [memberCode, value] of Object.entries(previousInterest)) {
    await db.query(
      `UPDATE legacy_historical_member_openings SET payload = jsonb_set(payload, '{raw,MbrCBlnc}', $1::jsonb), "updatedAt" = $2 WHERE "fyStart" = $3 AND "memberCode" = $4`,
      [JSON.stringify(value), now, start, memberCode]
    );
  }
}

// ---------------------------------------------------------------------------
// Close / reopen

// appropriation: [{ ledgerCode, amount }] — amount credited to that fund
// (negative = debited, e.g. a loss charged to the Reserve Fund). Must add up
// to the year's net profit after interest, to the paisa.
// includeEmployeeInterest: post and carry the staff loan interest — the
// accrual net of the year's "Interest Receive From Employee" vouchers, as
// legacy computed it. On by default; the accountant can leave it out.
async function closeYear(fy, { appropriation = [], remarks = '', includeEmployeeInterest = true, actorUser = null, now = new Date() } = {}) {
  const bounds = yearInterest.fyBounds(fy);
  const blockers = await closeBlockers(fy, { now });
  if (blockers.length) throw httpError(blockers.join(' '), 409, 'FY_CLOSE_BLOCKED');

  const [members, computedEmployees, posting] = await Promise.all([
    yearInterest.computeMemberInterest(fy),
    yearInterest.computeEmployeeInterest(fy),
    findPostingLedgers()
  ]);
  const employees = includeEmployeeInterest
    ? computedEmployees
    : computedEmployees.map((e) => ({ ...e, interest: { housing: 0, vehicle: 0 } }));
  const totals = { ...sumHeads(members, ['cd', 'ssa', 'loan', 'dloan']), ...sumHeads(employees, ['housing', 'vehicle']) };
  const interest = interestJournalLines(totals, posting);
  if (interest.missing.length) throw httpError(interest.missing.join('; '), 409, 'FY_CLOSE_LEDGERS');
  if (!posting.profitAndLoss) throw httpError('No Profit & Loss A/c ledger (nature PRIMARY) was found.', 409, 'FY_CLOSE_LEDGERS');

  // Appropriation must clear the year's profit exactly.
  const profit = await yearProfit(fy, interest.lines);
  const lines = (Array.isArray(appropriation) ? appropriation : [])
    .map((row) => ({ ledgerCode: cleanText(row.ledgerCode).toUpperCase(), amount: round2(row.amount) }))
    .filter((row) => row.ledgerCode && row.amount);
  const appropriated = round2(lines.reduce((t, row) => t + row.amount, 0));
  if (Math.abs(appropriated - profit) >= 0.005) {
    throw httpError(`The appropriation adds up to ${appropriated.toFixed(2)} but the year's ${profit >= 0 ? 'profit' : 'loss'} is ${Math.abs(profit).toFixed(2)}${profit < 0 ? ' (enter it as negative amounts)' : ''}.`, 400, 'FY_CLOSE_APPROPRIATION');
  }
  const knownCodes = new Set(posting.ledgers.map((l) => cleanText(l.code).toUpperCase()));
  const unknown = lines.filter((row) => !knownCodes.has(row.ledgerCode));
  if (unknown.length) throw httpError(`Unknown ledger(s): ${unknown.map((r) => r.ledgerCode).join(', ')}.`, 400, 'FY_CLOSE_APPROPRIATION');
  const plCode = cleanText(posting.profitAndLoss.code).toUpperCase();
  if (lines.some((row) => row.ledgerCode === plCode)) throw httpError('Appropriate the profit to funds, not to the Profit & Loss A/c itself.', 400, 'FY_CLOSE_APPROPRIATION');

  const meta = { actorUser: actorUser || { isSuperAdmin: true }, actorUserId: actorUser?.id || null, allowClosedFy: fy, fyClose: true };
  const created = [];
  const db = await initializeDatabase();
  await ensureOpeningsTables(db);
  let previousInterest = {};
  try {
    if (interest.lines.length) {
      const voucher = await banking.createVoucher({
        date: bounds.end,
        narration: `Year-end interest FY ${fy} (members and staff, as computed at close)`,
        details: { key: 'journal-voucher', system: 'fy-close', fy, part: 'interest', journalLines: interest.lines }
      }, meta);
      created.push(String(voucher.id || voucher._id));
    }
    if (lines.length) {
      const journalLines = [];
      const plAmount = Math.abs(profit);
      // Profit: P&L A/c Dr, funds Cr. A loss: funds Dr, P&L A/c Cr.
      journalLines.push({ ledgerCode: plCode, debit: profit >= 0 ? plAmount : 0, credit: profit < 0 ? plAmount : 0 });
      for (const row of lines) journalLines.push({ ledgerCode: row.ledgerCode, debit: row.amount < 0 ? -row.amount : 0, credit: row.amount > 0 ? row.amount : 0 });
      const voucher = await banking.createVoucher({
        date: bounds.end,
        narration: `Appropriation of ${profit >= 0 ? 'net profit' : 'net loss'} FY ${fy}`,
        details: { key: 'journal-voucher', system: 'fy-close', fy, part: 'appropriation', journalLines }
      }, meta);
      created.push(String(voucher.id || voucher._id));
    }
    previousInterest = await writeOpenings(db, fy, members, employees, bounds.nextStart, bounds.start);
  } catch (error) {
    // Undo whatever was written before the failure.
    await removeOpenings(db, fy, bounds.start, previousInterest).catch(() => {});
    for (const id of created) await banking.deleteVoucher(id, meta).catch(() => {});
    throw error;
  }

  const state = await fyLock.readState();
  state.years[fy] = {
    status: 'CLOSED',
    closedAt: new Date().toISOString(),
    closedByUserId: actorUser?.id || null,
    remarks: cleanText(remarks).slice(0, 1000),
    voucherIds: created,
    previousInterest,
    summary: {
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
      profit,
      appropriation: lines,
      members: members.filter((m) => m.eligible).length,
      employees: employees.length,
      employeeInterestIncluded: Boolean(includeEmployeeInterest)
    }
  };
  await fyLock.writeState(state);
  return (await listYears({ now })).years.find((y) => y.fy === fy);
}

async function reopenYear(fy, { reason = '', actorUser = null, now = new Date() } = {}) {
  const bounds = yearInterest.fyBounds(fy);
  const state = await fyLock.readState();
  const record = state.years[fy];
  if (!record || record.status !== 'CLOSED') throw httpError(`FY ${fy} is not closed.`, 409, 'FY_NOT_CLOSED');
  if (state.years[bounds.next]?.status === 'CLOSED') throw httpError(`Reopen FY ${bounds.next} first.`, 409, 'FY_NEXT_CLOSED');
  if (!cleanText(reason)) throw httpError('Give a reason for reopening the year.', 400, 'FY_REOPEN_REASON');

  // Open first, so the close's own vouchers can be removed.
  state.years[fy] = { ...record, status: 'OPEN', reopenedAt: new Date().toISOString(), reopenedByUserId: actorUser?.id || null, reopenReason: cleanText(reason).slice(0, 1000) };
  await fyLock.writeState(state);
  const meta = { actorUser: actorUser || { isSuperAdmin: true }, actorUserId: actorUser?.id || null, fyClose: true };
  for (const id of record.voucherIds || []) {
    if (await Voucher.findById(id).lean()) await banking.deleteVoucher(id, meta);
  }
  const db = await initializeDatabase();
  await ensureOpeningsTables(db);
  await removeOpenings(db, fy, bounds.start, record.previousInterest || {});
  const fresh = await fyLock.readState();
  fresh.years[fy] = { ...fresh.years[fy], voucherIds: [], previousInterest: {} };
  await fyLock.writeState(fresh);
  return (await listYears({ now })).years.find((y) => y.fy === fy);
}

module.exports = {
  INTEREST_HEADS,
  closeBlockers,
  closeYear,
  listYears,
  preview,
  reopenYear,
  todayIst
};

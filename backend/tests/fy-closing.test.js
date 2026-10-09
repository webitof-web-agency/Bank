// Year-end close: the legacy interest port against real legacy rows, and a
// full close -> lock -> next-year reports -> reopen cycle.
//
// Runs on its own database (bank_test_fy_closing), which it empties of
// vouchers, members and close state first; never the working data.
process.env.PG_DATABASE = process.env.FY_CLOSING_TEST_DATABASE || 'bank_test_fy_closing';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/legacy-interest.json');
const { memberYearInterest, employeeYearInterest, roundHalfEven } = require('../services/fyClosing/legacyInterest');
const { initializeDatabase, closeDatabase } = require('../config/postgres');
const { Ledger, Member } = require('../models/banking.models');
const banking = require('../services/banking.service');
const fyClosing = require('../services/fyClosing/fyClosing.service');
const fyLock = require('../services/fyClosing/fyLock');

const admin = { id: null, isSuperAdmin: true };
const AFTER_YEAR_END = new Date('2027-04-02T06:00:00Z');
const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();
const M1 = `C${RUN}1`;
const M2 = `C${RUN}2`;
let db;

// ---------------------------------------------------------------------------
// The port itself, on legacy's own rows

test('legacy rounding: half to even on exact halves only, like .NET Math.Round', () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(2.5000001), 3);
  assert.equal(roundHalfEven(1.005, 2), 1);
  assert.equal(roundHalfEven(-2.5), -2);
});

test('member interest equals legacy MbrCBlnc to the rupee (FY 2025-26 rows, incl. interest settlement vouchers)', () => {
  for (const member of fixture.members) {
    const got = memberYearInterest(member.rows, fixture.memberRates, member.tillDate);
    for (const key of ['cd', 'ssa', 'loan', 'dloan']) {
      assert.equal(Math.round(got[key]), Math.round(member.expected[key]), `AccID ${member.accId} ${key}`);
    }
  }
});

test('a member on the no-interest list gets only the interest on settlement vouchers', () => {
  const member = fixture.members[0];
  const got = memberYearInterest(member.rows, fixture.memberRates, member.tillDate, { noInterest: true });
  const preset = member.rows.reduce((t, r) => t + (r.cdInt || 0), 0);
  assert.equal(got.cd, preset);
});

test('employee interest equals legacy EmpCBlnc (FY 2024-25)', () => {
  const { rows, rates, tillDate, expected } = fixture.employee;
  assert.deepEqual(employeeYearInterest(rows, rates, tillDate), expected);
});

// ---------------------------------------------------------------------------
// Close / lock / reopen on a small year

async function ensureLedger(match, fields) {
  const existing = await Ledger.findOne(match).lean();
  if (existing) return existing;
  return Ledger.create({ openingBalance: 0, balanceSide: 'ZERO', ...fields });
}

test.before(async () => {
  db = await initializeDatabase();
  // Start from an empty year: forget any close state, then remove earlier
  // runs' vouchers and members through the models (which keep their
  // in-memory cache in step).
  const Settings = require('../models/settings.model');
  const state = await Settings.findOne({ key: fyLock.STATE_KEY }).lean();
  if (state) await Settings.findByIdAndDelete(state.id);
  await db.query(`DELETE FROM legacy_historical_member_openings WHERE "sourceDatabase" = 'APP-FY-CLOSE'`).catch(() => {});
  await db.query(`DELETE FROM legacy_historical_employee_openings WHERE "sourceDatabase" = 'APP-FY-CLOSE'`).catch(() => {});
  const { Voucher } = require('../models/banking.models');
  for (const voucher of await Voucher.find({}).lean()) {
    await banking.deleteVoucher(String(voucher.id || voucher._id), { actorUser: admin, fyClose: true }).catch(() => {});
  }
  for (const member of await Member.find({}).lean()) await Member.findByIdAndDelete(member.id || member._id);

  await ensureLedger({ semanticRole: 'CASH' }, { code: 'FC2', name: 'Cash-In-Hand', nature: 'ASSET', group: 'ASSET', semanticRole: 'CASH' });
  await ensureLedger({ semanticRole: 'COMPULSORY_DEPOSIT' }, { code: 'FC6', name: 'Members Compulsory Deposit A/c', nature: 'LIABILITY', group: 'LIABILITY', semanticRole: 'COMPULSORY_DEPOSIT' });
  await ensureLedger({ semanticRole: 'SPECIAL_DEPOSIT' }, { code: 'FC7', name: 'Members Special Saving A/c', nature: 'LIABILITY', group: 'LIABILITY', semanticRole: 'SPECIAL_DEPOSIT' });
  await ensureLedger({ semanticRole: 'REGULAR_LOAN' }, { code: 'FC8', name: 'Loan to Members A/c', nature: 'ASSET', group: 'ASSET', semanticRole: 'REGULAR_LOAN' });
  await ensureLedger({ semanticRole: 'LOAN_AGAINST_DEPOSIT' }, { code: 'FC9', name: 'Loan against Deposit to Member A/c', nature: 'ASSET', group: 'ASSET', semanticRole: 'LOAN_AGAINST_DEPOSIT' });
  await ensureLedger({ name: 'Intrest Paid (Member Compulsory Deposit)' }, { code: 'FC63', name: 'Intrest Paid (Member Compulsory Deposit)', nature: 'EXPENSE', group: 'EXPENSE' });
  await ensureLedger({ name: 'Intrest Paid (Members S.S.A.)' }, { code: 'FC64', name: 'Intrest Paid (Members S.S.A.)', nature: 'EXPENSE', group: 'EXPENSE' });
  await ensureLedger({ name: 'Intrest Received (Members Loan)' }, { code: 'FC55', name: 'Intrest Received (Members Loan)', nature: 'INCOME', group: 'INCOME' });
  await ensureLedger({ name: 'INTREST RECEIVED (MEMBERS DEPOSIT LOAN)' }, { code: 'FC56', name: 'INTREST RECEIVED (MEMBERS DEPOSIT LOAN)', nature: 'INCOME', group: 'INCOME' });
  await ensureLedger({ nature: 'PRIMARY' }, { code: 'FC1', name: 'Profit & Loss A/c', nature: 'PRIMARY', group: 'PRIMARY' });
  await ensureLedger({ code: 'FC12' }, { code: 'FC12', name: 'Reserve Fund', nature: 'LIABILITY', group: 'LIABILITY' });
  await ensureLedger({ code: 'FC90' }, { code: 'FC90', name: 'Bank Interest Received', nature: 'INCOME', group: 'INCOME' });
  await ensureLedger({ name: 'Intrest Received (House Loan to Staff)' }, { code: 'FC57', name: 'Intrest Received (House Loan to Staff)', nature: 'INCOME', group: 'INCOME' });

  // Opening snapshot: CD 1,00,000, loan owed 50,000 (credit-positive).
  await Member.create({ code: M1, name: 'Close Test Member', status: 'ACTIVE', branchCode: '', balances: { compulsoryDeposit: 100000, loan: -50000 } });
  await Member.create({ code: M2, name: 'Inactive Member', status: 'INACTIVE', dismembered: true, branchCode: '', balances: { compulsoryDeposit: 5000 } });
});

test.after(async () => {
  await closeDatabase();
});

const cdOf = (ledgers, snapshot) => snapshot.find((row) => row.code === ledgers);

test('close FY 2026-27: interest posted, profit appropriated, next year opened, year locked; reopen undoes it', async () => {
  // During the year: CD 10,000 paid to the member on 01-10-2026, and 10,000
  // bank interest received.
  await banking.createVoucher({ date: '2026-10-01', mode: 'Cash', partyType: 'member', partyCode: M1, amount: 10000, details: { key: 'deposit-paid-member', payMode: 'Cash', components: { cd: 10000 } } }, { actorUser: admin });
  await banking.createVoucher({ date: '2026-12-31', narration: 'Bank interest', details: { key: 'journal-voucher', journalLines: [{ ledgerCode: 'FC2', debit: 10000 }, { ledgerCode: 'FC90', credit: 10000 }] } }, { actorUser: admin });

  // Not before the year has ended.
  await assert.rejects(fyClosing.closeYear('2026-27', { now: new Date('2027-03-31T10:00:00Z') }), (e) => e.statusCode === 409 && /can be closed from/.test(e.message));
  // Not a legacy year.
  await assert.rejects(fyClosing.closeYear('2025-26', { now: AFTER_YEAR_END }), (e) => e.statusCode === 409);

  const preview = await fyClosing.preview('2026-27', { now: AFTER_YEAR_END });
  const member = preview.members.find((m) => m.memberCode === M1);
  // CD: 1,00,000 for 183 days at 7% = 3,510; then 90,000 for 181 days = 3,124.
  // Loan: 50,000 owed all year (364 days, legacy counts from 1 April) at 9% = 4,488.
  assert.deepEqual(member.interest, { cd: 6634, ssa: 0, loan: 4488, dloan: 0 });
  assert.equal(preview.members.find((m) => m.memberCode === M2).eligible, false);
  // Profit: 10,000 bank interest + 4,488 loan interest - 6,634 CD interest.
  assert.equal(preview.profitAfterInterest, 7854);

  // The appropriation must clear the profit exactly.
  await assert.rejects(fyClosing.closeYear('2026-27', { appropriation: [{ ledgerCode: 'FC12', amount: 7000 }], now: AFTER_YEAR_END, actorUser: admin }), (e) => e.statusCode === 400 && /7854/.test(e.message));

  const closed = await fyClosing.closeYear('2026-27', { appropriation: [{ ledgerCode: 'FC12', amount: 7854 }], remarks: 'test', now: AFTER_YEAR_END, actorUser: admin });
  assert.equal(closed.status, 'CLOSED');
  assert.deepEqual(closed.summary.totals, { cd: 6634, ssa: 0, loan: 4488, dloan: 0, housing: 0, vehicle: 0 });

  // Locked: nothing dated in the closed year, nor in a legacy year.
  const jv = (date) => ({ date, narration: 'x', details: { key: 'journal-voucher', journalLines: [{ ledgerCode: 'FC2', debit: 1 }, { ledgerCode: 'FC90', credit: 1 }] } });
  await assert.rejects(banking.createVoucher(jv('2027-01-15'), { actorUser: admin }), (e) => e.statusCode === 409 && /2026-27 is closed/.test(e.message));
  await assert.rejects(banking.createVoucher(jv('2025-05-01'), { actorUser: admin }), (e) => e.statusCode === 409 && /old software/.test(e.message));
  const next = await banking.createVoucher(jv('2027-04-10'), { actorUser: admin });
  await banking.deleteVoucher(next.id, { actorUser: admin });

  // The member opens 2027-28 at closing + interest (deposit adds, loan interest is charged).
  const report = await banking.buildMemberLedgerReport({ memberCode: M1, dateFrom: '2027-04-01', dateTo: '2028-03-31', user: admin });
  assert.equal(report.rows[0].compulsoryDeposit.balance, 96634);
  assert.equal(report.rows[0].loan.balance, 54488);

  // Ledgers: 2027-28 Income / Expense / P&L open at zero, the fund holds the profit,
  // and the opening trial balance balances.
  const snapshot = await banking.getLedgerSnapshots({ dateFrom: '2027-04-01', dateTo: '2028-03-31' });
  for (const row of snapshot.filter((r) => ['INCOME', 'EXPENSE', 'PRIMARY'].includes(r.nature))) {
    assert.ok(row.opening < 0.005, `${row.code} ${row.name} opens at ${row.opening}`);
  }
  assert.equal(cdOf('FC12', snapshot).opening, 7854);
  assert.equal(cdOf('FC12', snapshot).openingSide, 'CR');
  const dr = snapshot.reduce((t, r) => t + (r.openingSide === 'DR' ? r.opening : 0), 0);
  const cr = snapshot.reduce((t, r) => t + (r.openingSide === 'CR' ? r.opening : 0), 0);
  assert.ok(Math.abs(dr - cr) < 0.005, `opening trial balance ${dr} vs ${cr}`);
  // The year's own ledgers include the year-end interest.
  const year = await banking.getLedgerSnapshots({ dateFrom: '2026-04-01', dateTo: '2027-03-31' });
  assert.equal(cdOf('FC63', year).closing, 6634);

  // The close's vouchers change only by reopening.
  const closeVoucherId = (await fyLock.readState()).years['2026-27'].voucherIds[0];
  await assert.rejects(banking.deleteVoucher(closeVoucherId, { actorUser: admin }), (e) => e.statusCode === 409);

  // Reopen: a reason is required; afterwards everything the close wrote is gone.
  await assert.rejects(fyClosing.reopenYear('2026-27', { reason: ' ', actorUser: admin }), (e) => e.statusCode === 400);
  const reopened = await fyClosing.reopenYear('2026-27', { reason: 'correction', actorUser: admin, now: AFTER_YEAR_END });
  assert.equal(reopened.status, 'OPEN');
  const after = await banking.buildMemberLedgerReport({ memberCode: M1, dateFrom: '2027-04-01', dateTo: '2028-03-31', user: admin });
  assert.equal(after.rows[0].compulsoryDeposit.balance, 90000);
  const left = await db.query(`SELECT count(*)::int AS n FROM vouchers WHERE details->>'system' = 'fy-close' AND "deletedAt" IS NULL`);
  assert.equal(left.rows[0].n, 0);
  const extra = await banking.createVoucher(jv('2027-01-15'), { actorUser: admin });
  await banking.deleteVoucher(extra.id, { actorUser: admin });
});

test('closing a later year needs the previous one closed first', async () => {
  const blockers = await fyClosing.closeBlockers('2027-28', { now: new Date('2028-04-02T06:00:00Z') });
  assert.ok(blockers.some((b) => /Close FY 2026-27 first/.test(b)));
});

test('Interest Receive From Employee: year-end charge by transfer raises the staff loan; cash goes to cash; the close carries only the remainder', async () => {
  const yearInterest = require('../services/fyClosing/yearInterest.service');
  const { JournalLine } = require('../models/banking.models');
  await ensureLedger({ semanticRole: 'EMPLOYEE_HOUSING_LOAN' }, { code: 'FC33', name: 'Housing Loan to Staff A/c', nature: 'ASSET', group: 'ASSET', semanticRole: 'EMPLOYEE_HOUSING_LOAN' });
  const ledgers = new Map((await Ledger.find({}).lean()).map((l) => [String(l.id || l._id), l]));
  const postedLines = async (id) => Object.fromEntries((await JournalLine.find({ voucherId: String(id) }).lean())
    .map((l) => [ledgers.get(String(l.ledgerId)).semanticRole || ledgers.get(String(l.ledgerId)).name, [Number(l.debitAmount), Number(l.creditAmount)]]));

  // As legacy: one voucher on 31 March charging the year's interest to the loan.
  const charge = await banking.createVoucher({
    date: '2027-03-31', mode: 'Transfer', partyType: 'employee', partyCode: 'E1', amount: 9000,
    details: { key: 'interest-recv-employee', accountType: 'House Loan to Employee', interestAmount: 9000 }
  }, { actorUser: admin });
  const cash = await banking.createVoucher({
    date: '2026-12-01', mode: 'Cash', partyType: 'employee', partyCode: 'E2', amount: 500,
    details: { key: 'interest-recv-employee', accountType: 'House Loan to Employee', interestAmount: 500 }
  }, { actorUser: admin });
  try {
    assert.deepEqual(await postedLines(charge.id), { EMPLOYEE_HOUSING_LOAN: [9000, 0], 'Intrest Received (House Loan to Staff)': [0, 9000] });
    assert.deepEqual(await postedLines(cash.id), { CASH: [500, 0], 'Intrest Received (House Loan to Staff)': [0, 500] });

    const [e1, e2] = await yearInterest.computeEmployeeInterest('2026-27', {
      employees: [
        { code: 'E1', name: 'Staff', homeLoanBalance: -100000, vehicleLoanBalance: 0, grainAdvanceBalance: 0 },
        { code: 'E2', name: 'Staff 2', homeLoanBalance: 0, vehicleLoanBalance: 0, grainAdvanceBalance: 0 }
      ]
    });
    // 1,00,000 owed all year at 9% (legacy: 364 days, daily interest to 2dp) = 8,976 due;
    // 9,000 charged, so the remainder legacy carries is 8,976 - 9,000 = -24.
    assert.equal(e1.received, 9000);
    assert.equal(e1.interest.housing, -24);
    assert.equal(e1.closing.housingLoan, -109000);
    // Cash interest leaves the loan alone.
    assert.equal(e2.received, 500);
    assert.equal(e2.closing.housingLoan, 0);
  } finally {
    await banking.deleteVoucher(String(charge.id), { actorUser: admin });
    await banking.deleteVoucher(String(cash.id), { actorUser: admin });
  }
});

// Recovery From Member + Demand: draft lines -> one atomic save (voucher,
// recovery_lines, journal_lines, exact demand links), edit reconciliation,
// delete/restore, stale protection, and the Demand List / Excel paths that
// feed it. Codes are unique per run so leftovers in the test database from
// earlier runs never collide — and kept under 10 characters: the model layer
// compares longer strings as dates when they parse as one.
//
// Own database (bank_test_recovery_flow): on the shared bank_app another
// test file running alongside could delete a role ledger (SHARE, ...) after
// this one had set them up.
process.env.PG_DATABASE = process.env.RECOVERY_FLOW_TEST_DATABASE || 'bank_test_recovery_flow';

const test = require('node:test');
const assert = require('node:assert/strict');
const xlsx = require('xlsx');
const banking = require('../services/banking.service');
const recoveryImport = require('../services/recoveryImport.service');
const { Ledger, Member, MemberDemandDefault, DemandList, DemandLine, RecoveryLine, JournalLine, Voucher, RecoveryImportRow } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase, closeDatabase, restoreMainRow } = require('../config/postgres');

const RUN = `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const BRANCH = `${RUN}B`;
const code = (n) => `${RUN}M${n}`;
const FY = { fyStart: '2026-04-01', fyEnd: '2027-03-31' };
// Demand list numbers are plain digits, as in the real data.
const LIST4 = String(700000 + Math.floor(Math.random() * 99999));
const LIST3 = String(Number(LIST4) + 100000);
const ids = {};

test.after(async () => { if (closeDatabase) await closeDatabase(); });

async function ensureLedgers() {
  for (const role of ['CASH', 'SHARE', 'COMPULSORY_DEPOSIT', 'SPECIAL_DEPOSIT', 'REGULAR_LOAN', 'LOAN_AGAINST_DEPOSIT', 'ADMISSION']) {
    const semanticRole = ACCOUNTING_ROLES[role];
    if (await Ledger.findOne({ semanticRole })) continue;
    const removed = await Ledger.findOne({ semanticRole }).withDeleted().lean();
    if (removed) await restoreMainRow('ledgers', removed.id);
    else await Ledger.create({ code: `TEST-${role}`, name: role, semanticRole });
  }
}

async function demandLine(n, amounts, status = 'PENDING', listNo = LIST4) {
  const total = Object.values(amounts).reduce((sum, value) => sum + value, 0);
  const line = await DemandLine.create({
    demandListNo: listNo, memberCode: code(n), memberName: `Member ${n}`, postedBranch: BRANCH,
    compulsoryDeposit: 0, specialDeposit: 0, regularLoan: 0, loanAgainstDeposit: 0, insurancePremium: 0, other: 0,
    ...amounts, totalAmount: total, recoveredAmount: 0, recoveryStatus: status,
    payload: { raw: { DMonth: listNo === LIST3 ? '03' : '04', DYear: '2026' } }
  });
  return String(line.id || line._id);
}

const status = async (id) => (await DemandLine.findById(id).lean()).recoveryStatus;
const fromDemand = (id, n, heads) => ({ member: code(n), source: 'DEMAND', demandLineId: id, demandListNo: LIST4, heads });
const recoveryVoucher = (lines, extra = {}) => ({
  date: '2026-10-07', voucherCategory: 'Recovery From Member', transactionType: 'receipt', mode: 'Cash', amount: 999999,
  details: { key: 'recovery-member', recoveryLines: lines }, ...extra
});
const journalOf = async (voucherId) => JournalLine.find({ voucherId }).lean();
const sum = (rows, key) => Math.round(rows.reduce((total, row) => total + Number(row[key] || 0) * 100, 0)) / 100;

test('setup: ledgers, members, demand lists', async () => {
  await initializeDatabase();
  await ensureLedgers();
  for (let n = 1; n <= 6; n += 1) await Member.create({ code: code(n), name: `Member ${n}`, branchCode: BRANCH, designation: 'CLERK' });
  // An April list (current FY) and a March list (FY 2025-26).
  await DemandList.create({ demandListNo: LIST4, branchCode: BRANCH, month: '1', year: '2026', status: 'PENDING', payload: { raw: { DMonth: '04', DYear: '2026' } } });
  await DemandList.create({ demandListNo: LIST3, branchCode: BRANCH, month: '1', year: '2026', status: 'PENDING', payload: { raw: { DMonth: '03', DYear: '2026' } } });
  ids.d101 = await demandLine(1, { compulsoryDeposit: 1000, specialDeposit: 500, regularLoan: 2000 });
  ids.d102 = await demandLine(2, { compulsoryDeposit: 1000, loanAgainstDeposit: 700 });
  ids.d103 = await demandLine(3, { compulsoryDeposit: 1000 });
  ids.d104 = await demandLine(4, { regularLoan: 2000 });
  ids.dOld = await demandLine(5, { compulsoryDeposit: 1000 }, 'RECOVERED');
  ids.dMarch = await demandLine(6, { compulsoryDeposit: 1000 }, 'PENDING', LIST3);
});

test('1-4, AK: Add From Demand List offers this month\'s pending lines only, read-only, with exact ids', async () => {
  const rows = await banking.buildRecoveryDemandCandidates({ branchCode: BRANCH, month: '4', year: '2026', ...FY });
  assert.deepEqual(rows.map((r) => r.demandLineId).sort(), [ids.d101, ids.d102, ids.d103, ids.d104].sort());
  const r101 = rows.find((r) => r.demandLineId === ids.d101);
  assert.equal(r101.compulsoryDeposit, 1000);
  assert.equal(r101.specialDeposit, 500);
  assert.equal(r101.regularLoan, 2000);
  assert.equal(r101.totalAmount, 3500);
  assert.equal(r101.month, 4);
  assert.equal(r101.designation, 'CLERK');
  // Loading does not touch status.
  assert.equal(await status(ids.d101), 'PENDING');
  // A month of a closed FY is never offered for a current-FY recovery.
  assert.equal((await banking.buildRecoveryDemandCandidates({ branchCode: BRANCH, month: '3', year: '2026', ...FY })).length, 0);
});

test('18-20, 14-15, 4: save is one unit — voucher, recovery_lines, journal_lines, exact demand links', async () => {
  const v = await banking.createVoucher(recoveryVoucher([
    // Demand 3500 recovered as 3000 (operator corrected the loan).
    fromDemand(ids.d101, 1, { cd: 1000, ssa: 500, loan: 1500 }),
    fromDemand(ids.d102, 2, { cd: 1000, lad: 700 }),
    // Manual and Excel rows for members who also have pending demand: no link.
    { member: code(3), source: 'MANUAL', heads: { cd: 1000 } },
    { member: code(4), source: 'EXCEL', heads: { loan: 2000 } }
  ]));
  ids.v1 = String(v.id || v._id);
  ids.v1No = v.voucherNo;
  const lines = await RecoveryLine.find({ voucherId: ids.v1 }).lean();
  assert.equal(lines.length, 4);
  const l101 = lines.find((l) => l.demandLineId === ids.d101);
  assert.equal(l101.memberCode, code(1));
  assert.equal(Number(l101.regularLoan), 1500);
  assert.equal(Number(l101.specialDeposit), 500);
  assert.equal(Number(l101.total), 3000);
  assert.equal(Number(lines.find((l) => l.demandLineId === ids.d102).depositLoan), 700);
  // Voucher amount recalculated server-side (client sent 999999).
  assert.equal(Number((await Voucher.findById(ids.v1).lean()).amount), 7700);
  const journal = await journalOf(ids.v1);
  assert.equal(sum(journal, 'debitAmount'), 7700);
  assert.equal(sum(journal, 'creditAmount'), 7700);
  assert.equal(await status(ids.d101), 'RECOVERED');
  assert.equal(await status(ids.d102), 'RECOVERED');
  assert.equal(await status(ids.d103), 'PENDING');
  assert.equal(await status(ids.d104), 'PENDING');
  // Demand amounts untouched.
  assert.equal(Number((await DemandLine.findById(ids.d101).lean()).regularLoan), 2000);
});

test('21: the same demand line twice in one recovery is rejected, nothing saved', async () => {
  const before = await Voucher.countDocuments({});
  await assert.rejects(banking.createVoucher(recoveryVoucher([
    fromDemand(ids.d103, 3, { cd: 1000 }), fromDemand(ids.d103, 3, { cd: 1000 })
  ])), /twice/);
  assert.equal(await Voucher.countDocuments({}), before);
  assert.equal(await status(ids.d103), 'PENDING');
});

test('22-23: a stale demand line (already recovered) fails the save and rolls everything back', async () => {
  const before = await Voucher.countDocuments({});
  const err = await banking.createVoucher(recoveryVoucher([
    fromDemand(ids.d103, 3, { cd: 1000 }),
    fromDemand(ids.d101, 1, { cd: 1000 })
  ])).catch((error) => error);
  assert.equal(err.statusCode, 409);
  assert.equal(await Voucher.countDocuments({}), before);
  // d103 was marked inside the failed transaction: rolled back.
  assert.equal(await status(ids.d103), 'PENDING');
  assert.equal((await DemandLine.findById(ids.d101).lean()).payload.recoveryVoucherId, ids.v1);
});

test('24, 35: a blocked head (Premium/Suspense) fails posting and leaves demand pending', async () => {
  const before = await Voucher.countDocuments({});
  await assert.rejects(banking.createVoucher(recoveryVoucher([
    fromDemand(ids.d103, 3, { cd: 1000, ins: 100 })
  ])), /PREMIUM/);
  await assert.rejects(banking.createVoucher(recoveryVoucher([
    fromDemand(ids.d103, 3, { cd: 1000, suspense: 50 })
  ])), /SUSPENSE/);
  assert.equal(await Voucher.countDocuments({}), before);
  assert.equal(await status(ids.d103), 'PENDING');
});

test('25-29: editing a saved recovery reconciles exactly the changed demand links', async () => {
  const current = await Voucher.findById(ids.v1).lean();
  await banking.updateVoucher(ids.v1, {
    ...current,
    details: { ...current.details, recoveryLines: [
      fromDemand(ids.d101, 1, { cd: 1000, ssa: 500, loan: 1700 }), // amount edited, link kept
      fromDemand(ids.d103, 3, { cd: 1000 }), // added
      { member: code(4), source: 'EXCEL', heads: { loan: 2000 } }
      // d102 removed
    ] }
  });
  assert.equal(await status(ids.d101), 'RECOVERED');
  assert.equal(await status(ids.d102), 'PENDING');
  assert.equal(await status(ids.d103), 'RECOVERED');
  assert.equal(Number((await DemandLine.findById(ids.d101).lean()).regularLoan), 2000);
  const lines = await RecoveryLine.find({ voucherId: ids.v1 }).lean();
  assert.equal(lines.length, 3);
  assert.equal(Number(lines.find((l) => l.demandLineId === ids.d101).regularLoan), 1700);
  const journal = await journalOf(ids.v1);
  assert.equal(sum(journal, 'debitAmount'), 6200);
  assert.equal(sum(journal, 'creditAmount'), 6200);
});

test('30: a failed edit leaves the voucher, its lines, journal and demand as they were', async () => {
  const before = {
    lines: (await RecoveryLine.find({ voucherId: ids.v1 }).lean()).map((l) => `${l.demandLineId}|${l.total}`).sort(),
    journal: sum(await journalOf(ids.v1), 'debitAmount')
  };
  const current = await Voucher.findById(ids.v1).lean();
  const err = await banking.updateVoucher(ids.v1, {
    ...current,
    details: { ...current.details, recoveryLines: [
      fromDemand(ids.d101, 1, { cd: 1000 }),
      fromDemand(ids.dOld, 5, { cd: 1000 }) // recovered elsewhere -> stale
    ] }
  }).catch((error) => error);
  assert.equal(err.statusCode, 409);
  assert.deepEqual((await RecoveryLine.find({ voucherId: ids.v1 }).lean()).map((l) => `${l.demandLineId}|${l.total}`).sort(), before.lines);
  assert.equal(sum(await journalOf(ids.v1), 'debitAmount'), before.journal);
  assert.equal(await status(ids.d103), 'RECOVERED');
});

test('AH: a demand list with a recovered line cannot be deleted', async () => {
  const list = await DemandList.findOne({ demandListNo: LIST4 }).lean();
  await assert.rejects(banking.deleteResource('demandLists', String(list.id || list._id)), /recovered member line/);
});

test('36: Demand List report shows each line\'s status and recovery reference (April lists keep month in raw)', async () => {
  const rows = (await banking.buildDemandListReport({ month: '4', year: '2026', branchCode: BRANCH }))
    .filter((row) => String(row.memberCode).startsWith(RUN));
  assert.equal(rows.length, 5);
  const byMember = new Map(rows.map((row) => [row.memberCode, row]));
  assert.equal(byMember.get(code(1)).status, 'RECOVERED');
  assert.equal(byMember.get(code(1)).recoveryVoucherNo, String(ids.v1No));
  assert.equal(byMember.get(code(2)).status, 'PENDING');
});

test('37: the member ledger picks up the saved recovery line', async () => {
  const ledger = await banking.buildMemberLedgerReport({ memberCode: code(1), dateFrom: '2026-04-01', dateTo: '2027-03-31' });
  const rows = JSON.stringify(ledger);
  assert.match(rows, /1700/);
});

test('31-32: delete returns demand to pending; a failed delete changes nothing', async () => {
  const original = JournalLine.deleteMany;
  JournalLine.deleteMany = async () => { throw new Error('injected failure'); };
  try {
    await assert.rejects(banking.deleteVoucher(ids.v1), /injected failure/);
  } finally {
    JournalLine.deleteMany = original;
  }
  assert.ok(await Voucher.findById(ids.v1).lean());
  assert.equal(await status(ids.d101), 'RECOVERED');
  assert.equal(await status(ids.d103), 'RECOVERED');

  assert.equal(await banking.deleteVoucher(ids.v1), true);
  assert.equal(await status(ids.d101), 'PENDING');
  assert.equal(await status(ids.d103), 'PENDING');
  assert.equal((await RecoveryLine.find({ voucherId: ids.v1 }).lean()).length, 0);
  assert.equal((await journalOf(ids.v1)).length, 0);

  // Restore takes the demand back.
  assert.equal(await banking.restoreVoucher(ids.v1), true);
  assert.equal(await status(ids.d101), 'RECOVERED');
});

test('required header: a recovery without a date or without a mode is refused', async () => {
  const before = await Voucher.countDocuments({});
  await assert.rejects(banking.createVoucher(recoveryVoucher([{ member: code(6), heads: { cd: 100 } }], { date: '' })), /voucher date/);
  await assert.rejects(banking.createVoucher(recoveryVoucher([{ member: code(6), heads: { cd: 100 } }], { mode: '' })), /payment mode/);
  assert.equal(await Voucher.countDocuments({}), before);
});

test('33-34: a migrated (historical) recovery is not a modern voucher: no edit, no delete', async () => {
  assert.equal(await banking.updateVoucher('legacy-historical-row', { amount: 1 }), null);
  assert.equal(await banking.deleteVoucher('legacy-historical-row'), false);
});

test('S: Excel import matches the migrated PF (payload.raw.PFNo) exactly, leading zeros kept', async () => {
  const pf = `0${Math.floor(Math.random() * 90000 + 10000)}`;
  await Member.create({ code: code(9), name: 'Import Member', branchCode: BRANCH, payload: { raw: { PFNo: pf } } });
  await MemberDemandDefault.create({ memberCode: code(9), compulsoryDeposit: 1000, regularLoan: 500 });
  const sheet = xlsx.utils.aoa_to_sheet([['Sno', 'Branch', 'PF', 'EmpName', 'Grade', 'TotalAmt'], [1, 'X', pf, 'Import Member', 'CLERK', 1500], [2, 'X', pf.slice(1), 'Nobody', 'CLERK', 100]]);
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, 'Sheet1');
  const buffer = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
  const batch = await recoveryImport.uploadAndParseBatch('import.xlsx', buffer, { pfNo: 'PF', amount: 'TotalAmt', branch: 'Branch', empName: 'EmpName', grade: 'Grade' }, 'test');
  const rows = await RecoveryImportRow.find({ batchId: batch.id }).lean();
  const matched = rows.find((row) => row.pfNo === pf);
  assert.equal(matched.status, 'VALID');
  assert.equal(Number(matched.allocatedCompulsoryDeposit), 1000);
  assert.equal(rows.find((row) => row.pfNo === pf.slice(1)).status, 'MEMBER NOT FOUND');
});

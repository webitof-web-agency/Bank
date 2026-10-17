// Member transactions -> balances, Monthly Demand -> snapshot, bank Excel ->
// Recovery (exact reconciliation) -> balances. Uses a workbook laid out like
// the bank's (title rows, headings on row 3, a column-number row, a footer
// total). Short / numeric codes: the model layer compares long date-like
// strings as dates, and the test database keeps rows from earlier runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const xlsx = require('xlsx');
const banking = require('../services/banking.service');
const recoveryImport = require('../services/recoveryImport.service');
const { Ledger, Branch, DemandLine, DemandList, RecoveryImportRow, RecoveryLine, JournalLine, Voucher } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase, closeDatabase, restoreMainRow } = require('../config/postgres');

const RUN = `T${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const BRANCH = `${RUN}B`;
const LIST = String(800000 + Math.floor(Math.random() * 99999));
// PFs with a leading zero: kept exactly as written.
const PF = (n) => `0${Math.floor(10000 + Math.random() * 80000)}${n}`;
const admin = { actorUser: { isSuperAdmin: true } };
const ctx = { pf: {} };

test.after(async () => { if (closeDatabase) await closeDatabase(); });

const balancesOf = async (id) => (await banking.getResource('members', id)).currentBalances;
const memberVoucher = (key, partyCode, amount, components) => ({
  date: '2026-10-05', mode: 'Cash', partyType: 'member', partyCode, amount, details: { key, payMode: 'Cash', components }
});

test('setup: ledgers, branch, three members with opening balances and monthly demand', async () => {
  await initializeDatabase();
  for (const role of ['CASH', 'SHARE', 'COMPULSORY_DEPOSIT', 'SPECIAL_DEPOSIT', 'REGULAR_LOAN', 'LOAN_AGAINST_DEPOSIT', 'ADMISSION']) {
    const semanticRole = ACCOUNTING_ROLES[role];
    if (await Ledger.findOne({ semanticRole })) continue;
    const removed = await Ledger.findOne({ semanticRole }).withDeleted().lean();
    if (removed) await restoreMainRow('ledgers', removed.id);
    else await Ledger.create({ code: `TEST-${role}`, name: role, semanticRole });
  }
  await Branch.create({ code: BRANCH, label: 'FLOW TEST' });
  const make = async (n, openingBalances, demandDefaults) => {
    ctx.pf[n] = PF(n);
    const created = await banking.createResource('members', {
      name: `Flow ${RUN} ${n}`, branchCode: BRANCH, pfNo: ctx.pf[n], mobileNo: `98765${String(40000 + n).slice(-5)}`, password: 'secret12',
      openingBalances, demandDefaults
    }, admin);
    return created;
  };
  const a = await make(1, { regularLoan: 100000, loanAgainstDeposit: 20000, compulsoryDeposit: 100000, specialDeposit: 30000 }, { compulsoryDeposit: 2000, regularLoan: 8000 });
  const b = await make(2, { compulsoryDeposit: 5000 }, { compulsoryDeposit: 1000 });
  const c = await make(3, {}, { compulsoryDeposit: 500 });
  Object.assign(ctx, { a, b, c });
  assert.deepEqual(await balancesOf(a.id), { share: 0, compulsoryDeposit: 100000, specialDeposit: 30000, regularLoan: 100000, loanAgainstDeposit: 20000 });
});

test('49-50: Loan Payment raises Regular Loan and LAD outstanding (own GL ledgers); the monthly demand is untouched', async () => {
  const v = await banking.createVoucher(memberVoucher('loan-paid-member', ctx.a.code, 60000, { loanAmt: 50000, lad: 10000 }), admin);
  const bal = await balancesOf(ctx.a.id);
  assert.equal(bal.regularLoan, 150000);
  assert.equal(bal.loanAgainstDeposit, 30000);
  const journal = await JournalLine.find({ voucherId: String(v.id) }).lean();
  const ledgerCode = async (role) => String((await Ledger.findOne({ semanticRole: role }).lean()).id);
  const drOf = async (role) => journal.filter((l) => l.ledgerId === ledgerCode && false).length + Number(journal.find((l) => l.ledgerId === (role)).debitAmount);
  assert.equal(await drOf(await ledgerCode(ACCOUNTING_ROLES.REGULAR_LOAN)), 50000);
  assert.equal(await drOf(await ledgerCode(ACCOUNTING_ROLES.LOAN_AGAINST_DEPOSIT)), 10000);
  assert.equal(journal.reduce((t, l) => t + Number(l.creditAmount), 0), 60000);
  assert.equal((await banking.getResource('members', ctx.a.id)).demandDefaults.regularLoan, 8000);
  // A split that doesn't add up to the total is refused.
  await assert.rejects(banking.createVoucher(memberVoucher('loan-paid-member', ctx.a.code, 100, { loanAmt: 50, lad: 10 }), admin), /must equal Regular Loan Amount \+ Loan Against Deposit/);
});

test('51-52: CD and SSA paid to the member lower those balances', async () => {
  await banking.createVoucher(memberVoucher('deposit-paid-member', ctx.a.code, 5000, { cd: 5000 }), admin);
  await banking.createVoucher(memberVoucher('ssa-paid-member', ctx.a.code, 4000, { specialDeposit: 4000 }), admin);
  const bal = await balancesOf(ctx.a.id);
  assert.equal(bal.compulsoryDeposit, 95000);
  assert.equal(bal.specialDeposit, 26000);
});

test('53: the monthly demand is a snapshot of the defaults', async () => {
  const rows = await banking.getDemandEntryMembers({ branchCode: BRANCH });
  const saved = await banking.saveDemandEntry({
    demandListNo: LIST, demandListDate: '2026-10-01', branchCode: BRANCH, month: '10', year: '2026', fyCode: '2026-27', lines: rows
  }, { fyStart: '2026-04-01', fyEnd: '2027-03-31' });
  ctx.demand = Object.fromEntries(saved.lines.map((line) => [line.memberCode, line.id]));
  await banking.updateResource('members', ctx.a.id, { demandDefaults: { compulsoryDeposit: 2000, regularLoan: 10000 } }, admin);
  const line = await DemandLine.findById(ctx.demand[ctx.a.code]).lean();
  assert.equal(Number(line.regularLoan), 8000, 'October keeps 8,000');
  assert.equal((await banking.getDemandEntryMembers({ branchCode: BRANCH })).find((r) => r.memberCode === ctx.a.code).regularLoan, 10000, 'a new month starts from 10,000');
  // Creating demand moves no balance.
  assert.equal((await balancesOf(ctx.a.id)).regularLoan, 150000);
});

function bankWorkbook(rows, footer) {
  const sheet = xlsx.utils.aoa_to_sheet([
    ['Bank : DISTRICT COOPERATIVE BANK RAIPUR'],
    ['Salary Register For OCTOBER 2026'],
    ['S', 'BRANCH', 'PF', 'EMPNAME', 'DESIGNATION', 'COECOS RD'],
    [1, 2, 3, 4, 5, 6],
    ...rows.map((row, i) => [i + 1, 'FLOW', { t: 's', v: row.pf }, row.name, 'CLERK', row.amount]),
    [null, null, null, null, null, footer]
  ]);
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, 'TREEFT');
  return xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
}

test('22: the bank workbook is read from its heading row; footer total checked; leading zeros kept', async () => {
  const buffer = bankWorkbook([
    { pf: ctx.pf[1], name: 'A', amount: 12000 },
    { pf: ctx.pf[2], name: 'B', amount: 1000 },
    { pf: ctx.pf[3], name: 'C', amount: 500 }
  ], 13500);
  const analysis = recoveryImport.analyzeFileHeaders(buffer);
  assert.equal(analysis.headerRow, 3);
  assert.equal(analysis.colMap.amount, 'COECOS RD');
  const batch = await recoveryImport.uploadAndParseBatch('oct.xlsx', buffer, analysis.colMap, 'test');
  assert.equal(batch.totalRows, 3, 'title, heading, column-number and footer rows are not members');
  assert.equal(batch.payload.footerTotal, 13500);
  assert.equal(batch.payload.footerMatches, true);
  const rows = await RecoveryImportRow.find({ batchId: batch.id }).lean();
  assert.deepEqual(rows.map((r) => r.pfNo).sort(), [ctx.pf[1], ctx.pf[2], ctx.pf[3]].sort());
  ctx.rows = Object.fromEntries(rows.map((r) => [r.pfNo, String(r.id)]));
});

const line = (n, heads, extra = {}) => {
  const member = ctx[['a', 'b', 'c'][n - 1]];
  return { member: member.code, source: 'DEMAND', demandLineId: ctx.demand[member.code], importRowId: ctx.rows[ctx.pf[n]], heads, ...extra };
};
const recovery = (lines, details = {}) => ({
  date: '2026-10-31', voucherCategory: 'Recovery From Member', transactionType: 'receipt', mode: 'Cash',
  details: { key: 'recovery-member', recoveryLines: lines, ...details }
});

test('54-56: Excel 12,000 vs demand 10,000 is refused — whatever the client claims — until it adds up exactly', async () => {
  const before = await Voucher.countDocuments({});
  // Demand split: 2,000 CD + 8,000 Loan = 10,000 against Excel 12,000.
  await assert.rejects(banking.createVoucher(recovery([
    line(1, { cd: 2000, loan: 8000 }, { expectedAmount: 10000, status: 'VALID', confirmed: true, difference: 0 }),
    line(2, { cd: 1000 }), line(3, { cd: 500 })
  ]), admin), /expected 12000, allocated 10000 \(under by 2000\)/);
  // 1 paisa over.
  await assert.rejects(banking.createVoucher(recovery([line(1, { cd: 2000, loan: 10000.01 }), line(2, { cd: 1000 }), line(3, { cd: 500 })]), admin), /over by 0\.01/);
  // An Excel row left out silently.
  await assert.rejects(banking.createVoucher(recovery([line(1, { cd: 2000, loan: 10000 }), line(2, { cd: 1000 })]), admin), /neither in this recovery nor excluded/);
  // A forged header total.
  await assert.rejects(banking.createVoucher({ ...recovery([line(1, { cd: 2000, loan: 10000 }), line(2, { cd: 1000 }), line(3, { cd: 500 })]), amount: 13000 }, admin), /does not equal the recovery total/);
  assert.equal(await Voucher.countDocuments({}), before);
  assert.equal((await DemandLine.findById(ctx.demand[ctx.a.code]).lean()).recoveryStatus, 'PENDING');
});

test('37-38, 48: one voucher for the batch; expected kept per line; demand recovered only on Save; balances move', async () => {
  // C is excluded explicitly (e.g. deducted for another month).
  const saved = await banking.createVoucher(recovery(
    [line(1, { cd: 2000, loan: 10000 }), line(2, { cd: 1000 })],
    { recoveryExcluded: [{ importRowId: ctx.rows[ctx.pf[3]], reason: 'Deducted for September', amount: 1 }] }
  ), admin);
  assert.equal(Number(saved.amount), 13000);
  const voucher = await Voucher.findById(String(saved.id)).lean();
  assert.deepEqual(voucher.details.reconciliation, { expectedTotal: 13000, recoveryTotal: 13000, difference: 0, lineCount: 2, excludedCount: 1, excludedTotal: 500 });
  assert.equal(voucher.details.recoveryExcluded[0].amount, 500, 'the excluded amount is the Excel row\'s, not the client\'s');
  const lines = await RecoveryLine.find({ voucherId: String(saved.id) }).lean();
  assert.equal(lines.length, 2);
  assert.equal(Number(lines.find((l) => l.memberCode === ctx.a.code).payload.expectedAmount), 12000);
  const journal = await JournalLine.find({ voucherId: String(saved.id) }).lean();
  assert.equal(journal.reduce((t, l) => t + Number(l.debitAmount), 0), 13000);
  assert.equal(journal.reduce((t, l) => t + Number(l.creditAmount), 0), 13000);
  assert.equal((await DemandLine.findById(ctx.demand[ctx.a.code]).lean()).recoveryStatus, 'RECOVERED');
  assert.equal((await DemandLine.findById(ctx.demand[ctx.c.code]).lean()).recoveryStatus, 'PENDING');
  assert.equal(Number((await DemandLine.findById(ctx.demand[ctx.a.code]).lean()).regularLoan), 8000, 'demand amounts unchanged');

  const bal = await balancesOf(ctx.a.id);
  assert.equal(bal.regularLoan, 140000, '1,50,000 - 10,000 recovered');
  assert.equal(bal.compulsoryDeposit, 97000, '95,000 + 2,000 recovered');
  ctx.recoveryId = String(saved.id);
});

test('39: member ledger and closing-balance report follow the live transactions', async () => {
  const ledger = await banking.buildMemberLedgerReport({ memberCode: ctx.a.code, dateFrom: '2026-04-01', dateTo: '2027-03-31' });
  const last = ledger.rows[ledger.rows.length - 1];
  assert.equal(last.loan.balance, 140000);
  assert.equal(last.compulsoryDeposit.balance, 97000);
  const closing = await banking.buildAccountStatementReport({ type: 'members-closing-balance', dateFrom: '2026-04-01', dateTo: '2027-03-31' });
  const row = closing.find((r) => r.memberCode === ctx.a.code);
  assert.ok(row, 'an app-created member is in the closing balance report');
  assert.equal(row.loan.balance, 140000);
  assert.equal(row.compulsoryDeposit.balance, 97000);
  assert.equal(row.specialDeposit.balance, 26000);
});

test('46: deleting the recovery reverses its effect and frees the demand', async () => {
  await banking.deleteVoucher(ctx.recoveryId, admin);
  assert.equal((await balancesOf(ctx.a.id)).regularLoan, 150000);
  assert.equal((await DemandLine.findById(ctx.demand[ctx.a.code]).lean()).recoveryStatus, 'PENDING');
});

test('cleanup', async () => {
  for (const l of await DemandLine.find({ demandListNo: LIST }).lean()) await DemandLine.findByIdAndDelete(String(l.id || l._id));
  for (const l of await DemandList.find({ demandListNo: LIST }).lean()) await DemandList.findByIdAndDelete(String(l.id || l._id));
});

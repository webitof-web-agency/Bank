// Member form: Current / Opening Balances and Monthly Demand Data are two
// separate things. Balances live on the member; the monthly demand defaults
// in member_demand_defaults (CD, SSA, Regular Loan, LAD, Insurance, Other —
// no Share), total derived. Neither is ever copied into the other, and a
// saved demand list keeps its own amounts when the defaults change later.
// Short / numeric codes: the model layer compares long date-like strings as
// dates, and the test database keeps rows from earlier runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const banking = require('../services/banking.service');
const { Branch, MemberDemandDefault, DemandList, DemandLine } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const RUN = `D${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const BRANCH = `${RUN}B`;
const LIST = String(700000 + Math.floor(Math.random() * 99999));
const admin = { actorUser: { isSuperAdmin: true } };
const ctx = {};

test.after(async () => { if (closeDatabase) await closeDatabase(); });

const memberData = (extra = {}) => ({
  name: `Demand Test ${RUN}`,
  branchCode: BRANCH,
  mobileNo: '9876500011',
  password: 'secret12',
  openingBalances: { regularLoan: 202499, compulsoryDeposit: 370812.8 },
  nomineeName: 'NOMINEE ONE',
  nomineeRelation: 'Spouse',
  ...extra
});

test('setup', async () => {
  await initializeDatabase();
  await Branch.create({ code: BRANCH, label: 'DEMAND TEST BRANCH' });
});

test('create: balances and monthly demand save independently; total derived; no Share', async () => {
  const created = await banking.createResource('members', memberData({
    demandDefaults: { compulsoryDeposit: '2000', regularLoan: 8000, specialDeposit: '500.50', insurancePremium: '', other: 25, share: 999, total: 1 }
  }), admin);
  ctx.id = created.id;
  ctx.code = created.code;
  assert.equal(created.openingBalances.regularLoan, 202499);
  assert.equal(created.openingBalances.compulsoryDeposit, 370812.8);
  assert.equal(Number(created.balances.loan), -202499, 'stored with the ledger sign: a loan owed is negative');
  assert.deepEqual(created.demandDefaults, {
    compulsoryDeposit: 2000, specialDeposit: 500.5, regularLoan: 8000, loanAgainstDeposit: 0, insurancePremium: 0, other: 25, total: 10525.5
  });
  assert.equal(Object.hasOwn(created.demandDefaults, 'share'), false);
  const row = await MemberDemandDefault.findOne({ memberCode: ctx.code }).lean();
  assert.equal(Number(row.share || 0), 0, 'Share is never set from the member form');

  const read = await banking.getResource('members', ctx.id);
  assert.equal(read.demandDefaults.total, 10525.5);
  assert.equal(read.openingBalances.regularLoan, 202499);
  assert.equal(read.currentBalances.regularLoan, 202499);
  assert.equal(read.nomineeName, 'NOMINEE ONE');
  assert.equal(read.nomineeRelation, 'Spouse');
});

test('changing the Regular Loan balance leaves the monthly loan demand alone', async () => {
  const updated = await banking.updateResource('members', ctx.id, { openingBalances: { regularLoan: 150000, compulsoryDeposit: 370812.8 } }, admin);
  assert.equal(updated.openingBalances.regularLoan, 150000);
  assert.equal(updated.demandDefaults.regularLoan, 8000);
});

test('changing the monthly loan demand leaves the Regular Loan balance alone', async () => {
  const updated = await banking.updateResource('members', ctx.id, {
    demandDefaults: { compulsoryDeposit: 2000, specialDeposit: 500.5, regularLoan: 9000, other: 25 }
  }, admin);
  assert.equal(updated.demandDefaults.regularLoan, 9000);
  assert.equal(updated.demandDefaults.total, 11525.5);
  assert.equal(updated.openingBalances.regularLoan, 150000);
  assert.equal(updated.openingBalances.compulsoryDeposit, 370812.8);
  assert.equal(updated.nomineeName, 'NOMINEE ONE');
});

test('a save without demand defaults (e.g. photo/documents) keeps them', async () => {
  const updated = await banking.updateResource('members', ctx.id, { address: 'NEW ADDRESS' }, admin);
  assert.equal(updated.demandDefaults.regularLoan, 9000);
});

test('validation: negative or 3-decimal amounts are refused and nothing is saved', async () => {
  await assert.rejects(banking.updateResource('members', ctx.id, { demandDefaults: { regularLoan: -1 } }, admin), /Regular Loan.*0 or more/);
  await assert.rejects(banking.updateResource('members', ctx.id, { demandDefaults: { other: '1.234' } }, admin), /Other.*2 decimals/);
  await assert.rejects(banking.createResource('members', memberData({ mobileNo: '9876500012', demandDefaults: { compulsoryDeposit: 'abc' } }), admin), /Compulsory Deposit/);
  const read = await banking.getResource('members', ctx.id);
  assert.equal(read.demandDefaults.regularLoan, 9000);
});

test('Demand Entry copies the defaults; a later change does not rewrite the saved demand', async () => {
  const rows = await banking.getDemandEntryMembers({ branchCode: BRANCH });
  const mine = rows.find((row) => row.memberCode === ctx.code);
  assert.equal(mine.regularLoan, 9000);
  const saved = await banking.saveDemandEntry({
    demandListNo: LIST, demandListDate: '2026-09-01', branchCode: BRANCH, month: '9', year: '2026', fyCode: '2026-27',
    lines: [mine]
  }, { fyStart: '2026-04-01', fyEnd: '2027-03-31' });
  ctx.listId = saved.id;

  await banking.updateResource('members', ctx.id, { demandDefaults: { regularLoan: 1 } }, admin);
  const line = (await DemandLine.find({ demandListNo: LIST }).lean()).find((row) => row.memberCode === ctx.code);
  assert.equal(Number(line.regularLoan), 9000);
  assert.equal(Number(line.compulsoryDeposit), 2000);
});

test('cleanup', async () => {
  for (const line of await DemandLine.find({ demandListNo: LIST }).lean()) await DemandLine.findByIdAndDelete(String(line.id || line._id));
  for (const list of await DemandList.find({ demandListNo: LIST }).lean()) await DemandList.findByIdAndDelete(String(list.id || list._id));
});

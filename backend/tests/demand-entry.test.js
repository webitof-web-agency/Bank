// Demand Entry: a demand list header with member component lines (CD, SSA,
// Regular Loan, LAD, Insurance, Other — no Share), total always derived,
// lines PENDING until a saved recovery collects them, recovered lines locked.
// Short / numeric codes: the model layer compares long date-like strings as
// dates, and the test database keeps rows from earlier runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const banking = require('../services/banking.service');
const { Ledger, Member, MemberDemandDefault, Branch, DemandLine } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase, closeDatabase, restoreMainRow } = require('../config/postgres');

const RUN = `E${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const BRANCH = `${RUN}B`;
const OTHER_BRANCH = `${RUN}C`;
const code = (n) => `${RUN}M${n}`;
const LIST = String(600000 + Math.floor(Math.random() * 99999));
const FY = { fyStart: '2026-04-01', fyEnd: '2027-03-31' };
const ctx = {};

test.after(async () => { if (closeDatabase) await closeDatabase(); });

const header = (extra = {}) => ({ demandListNo: LIST, demandListDate: '2026-08-23', branchCode: BRANCH, month: '8', year: '2026', fyCode: '2026-27', ...extra });
const statusOf = async (id) => (await DemandLine.findById(id).lean()).recoveryStatus;

test('setup', async () => {
  await initializeDatabase();
  for (const role of ['CASH', 'SHARE', 'COMPULSORY_DEPOSIT', 'SPECIAL_DEPOSIT', 'REGULAR_LOAN', 'LOAN_AGAINST_DEPOSIT', 'ADMISSION']) {
    const semanticRole = ACCOUNTING_ROLES[role];
    if (await Ledger.findOne({ semanticRole })) continue;
    const removed = await Ledger.findOne({ semanticRole }).withDeleted().lean();
    if (removed) await restoreMainRow('ledgers', removed.id);
    else await Ledger.create({ code: `TEST-${role}`, name: role, semanticRole });
  }
  await Branch.create({ code: BRANCH, label: 'Test Branch', place: 'TEST BRANCH' });
  await Branch.create({ code: OTHER_BRANCH, label: 'Other Branch', place: 'OTHER BRANCH' });
  for (let n = 1; n <= 4; n += 1) await Member.create({ code: code(n), name: `Member ${n}`, branchCode: BRANCH, designation: 'CLERK' });
  await MemberDemandDefault.create({ memberCode: code(1), share: 0, compulsoryDeposit: 2000, regularLoan: 10000, loanAgainstDeposit: 3000 });
});

test('Load Members prefills each member\'s configured demand split (no Share)', async () => {
  const rows = await banking.getDemandEntryMembers({ branchCode: BRANCH });
  assert.equal(rows.length, 4);
  const m1 = rows.find((row) => row.memberCode === code(1));
  assert.deepEqual([m1.compulsoryDeposit, m1.regularLoan, m1.loanAgainstDeposit, m1.specialDeposit], [2000, 10000, 3000, 0]);
  assert.equal(Object.hasOwn(m1, 'share'), false);
});

test('save: lines carry the components, total is derived, nil members skipped, all PENDING', async () => {
  const saved = await banking.saveDemandEntry({
    ...header(),
    lines: [
      { memberCode: code(1), compulsoryDeposit: 2000, regularLoan: 10000, loanAgainstDeposit: 3000, totalAmount: 99, share: 500 },
      { memberCode: code(2), compulsoryDeposit: 1000.1, specialDeposit: 0.2, insurancePremium: 100, other: 50 },
      { memberCode: code(3), compulsoryDeposit: 1000 },
      { memberCode: code(4) } // nothing demanded -> not saved
    ]
  }, FY);
  ctx.id = saved.id;
  assert.equal(saved.memberCount, 3);
  assert.equal(saved.month, 8);
  assert.equal(saved.year, '2026');
  const byCode = new Map(saved.lines.map((line) => [line.memberCode, line]));
  assert.equal(byCode.get(code(1)).totalAmount, 15000); // client total 99 and Share ignored
  assert.equal(byCode.get(code(2)).totalAmount, 1150.3);
  assert.equal(saved.totalAmount, 17150.3);
  assert.ok(saved.lines.every((line) => line.recoveryStatus === 'PENDING'));
  ctx.lineIds = Object.fromEntries(saved.lines.map((line) => [line.memberCode, line.id]));
});

test('validation: duplicate member, month outside the FY, same list number in the same branch', async () => {
  await assert.rejects(banking.saveDemandEntry({ ...header({ demandListNo: `${Number(LIST) + 1}` }), lines: [{ memberCode: code(1), compulsoryDeposit: 1 }, { memberCode: code(1), compulsoryDeposit: 1 }] }, FY), /entered twice/);
  await assert.rejects(banking.saveDemandEntry({ ...header({ demandListNo: `${Number(LIST) + 1}`, month: '3' }), lines: [{ memberCode: code(1), compulsoryDeposit: 1 }] }, FY), /outside the selected financial year/);
  await assert.rejects(banking.saveDemandEntry({ ...header(), lines: [{ memberCode: code(1), compulsoryDeposit: 1 }] }, FY), /already exists/);
  await assert.rejects(banking.saveDemandEntry({ ...header({ demandListNo: `${Number(LIST) + 1}` }), lines: [{ memberCode: code(1), compulsoryDeposit: -5 }] }, FY), /zero or more/);
});

test('the same list number is allowed for another branch (as legacy numbers lists)', async () => {
  await Member.create({ code: code(9), name: 'Other', branchCode: OTHER_BRANCH });
  const other = await banking.saveDemandEntry({ ...header({ branchCode: OTHER_BRANCH }), lines: [{ memberCode: code(9), compulsoryDeposit: 500 }] }, FY);
  assert.equal(other.demandListNo, LIST);
  assert.equal(other.memberCount, 1);
});

test('the saved demand is offered by Add From Demand List and shown on the Demand List report', async () => {
  const candidates = await banking.buildRecoveryDemandCandidates({ branchCode: BRANCH, month: '8', year: '2026', ...FY });
  assert.equal(candidates.length, 3);
  const report = await banking.buildDemandListReport({ month: '8', year: '2026', branchCode: BRANCH });
  assert.equal(report.length, 3);
});

test('after a recovery collects a line it is locked; pending lines keep their ids when edited', async () => {
  const voucher = await banking.createVoucher({
    date: '2026-10-07', voucherCategory: 'Recovery From Member', transactionType: 'receipt', mode: 'Cash',
    details: { key: 'recovery-member', recoveryLines: [{ member: code(3), source: 'DEMAND', demandLineId: ctx.lineIds[code(3)], heads: { cd: 1000 } }] }
  });
  ctx.voucherId = String(voucher.id || voucher._id);
  assert.equal(await statusOf(ctx.lineIds[code(3)]), 'RECOVERED');

  const lines = [
    { memberCode: code(1), compulsoryDeposit: 2500, regularLoan: 10000, loanAgainstDeposit: 3000 },
    { memberCode: code(3), compulsoryDeposit: 1000 },
    { memberCode: code(4), specialDeposit: 300 }
    // member 2 removed
  ];
  // Changing a recovered member's demand, or dropping it, is refused.
  await assert.rejects(banking.saveDemandEntry({ ...header(), lines: lines.map((l) => (l.memberCode === code(3) ? { ...l, compulsoryDeposit: 900 } : l)) }, { id: ctx.id, ...FY }), /already been recovered/);
  await assert.rejects(banking.saveDemandEntry({ ...header(), lines: lines.filter((l) => l.memberCode !== code(3)) }, { id: ctx.id, ...FY }), /already been recovered/);
  await assert.rejects(banking.saveDemandEntry({ ...header({ month: '9' }), lines }, { id: ctx.id, ...FY }), /cannot change/);

  const saved = await banking.saveDemandEntry({ ...header(), lines }, { id: ctx.id, ...FY });
  const byCode = new Map(saved.lines.map((line) => [line.memberCode, line]));
  assert.equal(byCode.get(code(1)).id, ctx.lineIds[code(1)]); // same demand line, amount updated
  assert.equal(byCode.get(code(1)).compulsoryDeposit, 2500);
  assert.equal(byCode.get(code(3)).recoveryStatus, 'RECOVERED');
  assert.equal(byCode.has(code(2)), false);
  assert.equal(byCode.get(code(4)).recoveryStatus, 'PENDING');
});

test('a list with recovered members cannot be deleted; once the recovery is deleted it can', async () => {
  await assert.rejects(banking.deleteDemandEntry(ctx.id), /recovered member line/);
  await banking.deleteVoucher(ctx.voucherId);
  assert.equal(await statusOf(ctx.lineIds[code(3)]), 'PENDING');
  assert.equal(await banking.deleteDemandEntry(ctx.id), true);
  assert.equal(await banking.getDemandEntry(ctx.id), null);
  assert.equal((await DemandLine.find({ demandListNo: LIST }).lean()).filter((line) => line.postedBranch === BRANCH).length, 0);
});

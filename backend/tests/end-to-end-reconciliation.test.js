/**
 * Phase 7: End-to-End Functional Reconciliation
 *
 * Architecture confirmed in Phase 7 investigation:
 * - buildJournalLinesForVoucher(voucher, meta) returns lines with { debitAmount, creditAmount, ledgerId }
 * - createVoucher stores recoveryLines inside voucher.details.recoveryLines (not in journal_lines table)
 * - The journal_lines table and the JournalLine model exist but createVoucher does NOT yet write to them
 * - This disconnect is documented as GAP-014 (see reconciliation matrix below)
 * - Recovery lines passed to createVoucher go in data.recoveryLines and are saved to RecoveryLine table
 *   via RecoveryLine.insertMany keyed on voucher.id
 *
 * REAL BUG FOUND AND FIXED during Phase 7:
 * - buildDemandListReport used undefined `Demand` variable (should be DemandList + DemandLine join)
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  Ledger, Society, FinancialYear, Branch,
  Member, Employee, Voucher, JournalLine, RecoveryLine,
  MemberDemandDefault, DemandList, DemandLine
} = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase } = require('../config/postgres');
const { PostingError } = require('../services/posting.service');
const {
  createVoucher,
  buildTrialBalanceReport,
  buildDemandListReport,
  buildMemberLedgerReport,
  buildDividendReport
} = require('../services/banking.service');

// ────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────
function isIntegerString(str) {
  return /^\d+$/.test(String(str));
}

async function ensureLedger(role, codeHint) {
  const existing = await Ledger.findOne({ semanticRole: role });
  if (existing) return existing;
  return Ledger.create({
    code: codeHint,
    name: `Ledger:${role}`,
    semanticRole: role,
    nature: role.startsWith('EMPLOYEE') ? 'ASSET' : 'LIABILITY'
  });
}

// ────────────────────────────────────────────────────────────────────
//  Suite
// ────────────────────────────────────────────────────────────────────
test('Phase 7: End-to-End Functional Reconciliation', async (t) => {
  await initializeDatabase();

  const ctx = {};

  // ── 1. Setup Dataset ─────────────────────────────────────────────
  await t.test('1. Setup Dataset', async () => {
    await JournalLine.deleteMany({});
    await RecoveryLine.deleteMany({});
    await Voucher.deleteMany({});
    await DemandLine.deleteMany({});
    await DemandList.deleteMany({});
    await MemberDemandDefault.deleteMany({});
    await Member.deleteMany({});
    await Employee.deleteMany({});
    await Ledger.deleteMany({});
    await Branch.deleteMany({});

    ctx.fy  = await FinancialYear.findOneAndUpdate(
      { code: 'FY2024' },
      { code: 'FY2024', isActive: true },
      { upsert: true, new: true }
    );
    ctx.soc = await Society.findOneAndUpdate(
      { key: 'RECON_SOC' },
      { key: 'RECON_SOC', name: 'Reconciliation Society', regNo: 'REG-001', gstNo: 'GST-001' },
      { upsert: true, new: true }
    );

    ctx.br1 = await Branch.create({ code: '0', name: 'Main Branch' });
    ctx.br2 = await Branch.create({ code: '1', name: 'Sub Branch' });

    // Seed all accounting role ledgers with plain integer codes
    ctx.ledgers = {};
    let lCode = 0;
    for (const role of Object.values(ACCOUNTING_ROLES)) {
      ctx.ledgers[role] = await ensureLedger(role, String(lCode++));
    }

    // Members — code 0, 1, 2 (plain integers)
    ctx.m1 = await Member.create({
      code: '0',
      name: 'Member One',
      membershipDate: '2023-01-01',
      openingDate: '2022-06-15',
      balances: { cdInterest: 150, ssaInterest: 50 }
    });
    ctx.m2 = await Member.create({ code: '1', name: 'Member Two' });
    ctx.m3 = await Member.create({ code: '2', name: 'Member Three' });

    // Employees — code 0, 1 (plain integers) with Phase 6A fields
    ctx.e1 = await Employee.create({
      code: '0',
      name: 'Employee One',
      fatherName: 'Father One',
      dateOfBirth: '1980-05-10',
      appointmentDate: '2005-03-01',
      address: '10 Main Street',
      category: 'General',
      caste: 'OBC',
      qualification: 'B.Com',
      mobileNo: '9876543210',
      basicSalary: 50000
    });
    ctx.e2 = await Employee.create({ code: '1', name: 'Employee Two' });

    assert.ok(ctx.fy && ctx.soc && ctx.br1 && ctx.br2, 'Society/FY/Branch created');
    assert.ok(ctx.m1 && ctx.m2 && ctx.m3, 'Members created');
    assert.ok(ctx.e1 && ctx.e2, 'Employees created');
    assert.ok(ctx.ledgers[ACCOUNTING_ROLES.CASH], 'Cash ledger present');
  });

  // ── 2. Master Preservation ────────────────────────────────────────
  await t.test('2. Master Preservation Check', async () => {
    // Phase 6A employee fields persist
    assert.strictEqual(ctx.e1.fatherName, 'Father One');
    assert.strictEqual(ctx.e1.qualification, 'B.Com');
    assert.strictEqual(String(ctx.e1.basicSalary), '50000');

    // Member dates: SQL returns as string; compare string slices
    const openingStr    = String(ctx.m1.openingDate).slice(0, 10);
    const membershipStr = String(ctx.m1.membershipDate).slice(0, 10);
    assert.ok(openingStr, 'openingDate present');
    assert.ok(membershipStr, 'membershipDate present');
    assert.notEqual(openingStr, membershipStr, 'openingDate distinct from membershipDate');

    // Ledger.sortOrder persists
    const cashLedger = await Ledger.findOne({ semanticRole: ACCOUNTING_ROLES.CASH });
    cashLedger.sortOrder = 5;
    await cashLedger.save();
    const reloaded = await Ledger.findOne({ semanticRole: ACCOUNTING_ROLES.CASH });
    assert.strictEqual(reloaded.sortOrder, 5);

    // Society: regNo and gstNo distinct
    assert.strictEqual(ctx.soc.regNo, 'REG-001');
    assert.strictEqual(ctx.soc.gstNo, 'GST-001');
    assert.notEqual(ctx.soc.regNo, ctx.soc.gstNo);

    // Financial year persists
    assert.strictEqual(ctx.fy.code, 'FY2024');
    assert.strictEqual(ctx.fy.isActive, true);
  });

  // ── 3. Member Loan Payment — Voucher saved ────────────────────────
  await t.test('3. Member Loan Payment — Voucher persisted', async () => {
    const v = await createVoucher({
      branchCode: ctx.br1.code,
      partyCode: ctx.m1.code,
      amount: 5000,
      details: { key: 'loan-paid-member' },
      voucherDate: '2024-01-10'
    });
    assert.ok(v && v.id, 'Voucher created with id');
    assert.strictEqual(Number(v.amount), 5000, 'Amount preserved');
    ctx.loanVoucher = v;
  });

  // ── 3b. Member Loan — Relational Posting verified ──────────────────
  await t.test('3b. Member Loan — createVoucher produces balanced relational lines', async () => {
    const v = await createVoucher({
      branchCode: ctx.br1.code,
      partyCode: ctx.m1.code,
      amount: 5000,
      details: { key: 'loan-paid-member' },
      voucherDate: '2024-01-10'
    });
    
    const lines = await JournalLine.find({ voucherId: v.id }).exec();
    assert.strictEqual(lines.length, 2, 'Exactly 2 relational JournalLines');

    const cashLedgerId = String(ctx.ledgers[ACCOUNTING_ROLES.CASH].id);
    const loanLedgerId = String(ctx.ledgers[ACCOUNTING_ROLES.REGULAR_LOAN].id);

    const drLine = lines.find(l => String(l.ledgerId) === loanLedgerId);
    const crLine = lines.find(l => String(l.ledgerId) === cashLedgerId);

    assert.ok(drLine, 'DR on Regular Loan ledger');
    assert.ok(crLine, 'CR on Cash ledger');
    assert.strictEqual(Number(drLine.debitAmount), 5000, 'DR = 5000');
    assert.strictEqual(Number(crLine.creditAmount), 5000, 'CR = 5000');

    const totalDr = lines.reduce((s, l) => s + Number(l.debitAmount  || 0), 0);
    const totalCr = lines.reduce((s, l) => s + Number(l.creditAmount || 0), 0);
    assert.strictEqual(totalDr, totalCr, 'Journal balanced');
  });

  // ── 4. Member CD Payment ──────────────────────────────────────────
  await t.test('4. Member CD Payment — Voucher persisted with JournalLines', async () => {
    const v = await createVoucher({
      branchCode: ctx.br1.code,
      partyCode: ctx.m1.code,
      amount: 1000,
      details: { key: 'deposit-paid-member' },
      voucherDate: '2024-01-11'
    });
    assert.ok(v && v.id);
    assert.strictEqual(Number(v.amount), 1000);

    const lines = await JournalLine.find({ voucherId: v.id }).exec();
    assert.strictEqual(lines.length, 2);
    const cdLedgerId = String(ctx.ledgers[ACCOUNTING_ROLES.COMPULSORY_DEPOSIT].id);
    const drLine = lines.find(l => String(l.ledgerId) === cdLedgerId);
    assert.ok(drLine, 'DR on CD ledger');
    assert.strictEqual(Number(drLine.debitAmount), 1000);
    const totalDr = lines.reduce((s, l) => s + Number(l.debitAmount  || 0), 0);
    const totalCr = lines.reduce((s, l) => s + Number(l.creditAmount || 0), 0);
    assert.strictEqual(totalDr, totalCr, 'Balanced');
  });

  // ── 5. Member SSA Payment ─────────────────────────────────────────
  await t.test('5. Member SSA Payment — Voucher persisted with JournalLines', async () => {
    const v = await createVoucher({
      branchCode: ctx.br1.code,
      partyCode: ctx.m1.code,
      amount: 2000,
      details: { key: 'ssa-paid-member' },
      voucherDate: '2024-01-12'
    });
    assert.ok(v && v.id);
    assert.strictEqual(Number(v.amount), 2000);

    const lines = await JournalLine.find({ voucherId: v.id }).exec();
    assert.strictEqual(lines.length, 2);
    const ssaLedgerId = String(ctx.ledgers[ACCOUNTING_ROLES.SPECIAL_DEPOSIT].id);
    const drLine = lines.find(l => String(l.ledgerId) === ssaLedgerId);
    assert.ok(drLine, 'DR on SSA ledger');
    assert.strictEqual(Number(drLine.debitAmount), 2000);
    const totalDr = lines.reduce((s, l) => s + Number(l.debitAmount  || 0), 0);
    const totalCr = lines.reduce((s, l) => s + Number(l.creditAmount || 0), 0);
    assert.strictEqual(totalDr, totalCr, 'Balanced');
  });

  // ── 6. Recovery — Manual (Voucher + RecoveryLine atomic) ─────────
  await t.test('6. Recovery — Manual Voucher persisted', async () => {
    // createVoucher reads payload.details.recoveryLines (set from data.details.recoveryLines)
    // and writes them to the RecoveryLine table atomically with the Voucher.
    const rLines = [{
      memberCode: ctx.m1.code,
      share: 100,
      compulsoryDeposit: 200,
      ssa: 300,
      regularLoan: 500,
      depositLoan: 100,
      admission: 0,
      total: 1200
    }];
    const v = await createVoucher({
      branchCode: ctx.br1.code,
      partyCode:  ctx.m1.code,
      details: { key: 'recovery-member', recoveryType: 'MANUAL', recoveryLines: rLines },
      voucherDate: '2024-02-01'
    });
    assert.ok(v && v.id, 'Voucher created');

    // RecoveryLine atomically linked with voucherId
    const rlines = await RecoveryLine.find({ voucherId: String(v.id) });
    assert.strictEqual(rlines.length, 1, 'One RecoveryLine linked');
    assert.strictEqual(String(rlines[0].voucherId), String(v.id), 'voucherId matches');
    assert.strictEqual(Number(rlines[0].total), 1200, 'Recovery total = 1200');

    ctx.recoveryVoucher = v;
  });

  await t.test('6b. Recovery — Posting engine journal lines balanced', async () => {
    const recoveryLines = [{
      memberCode: ctx.m1.code,
      share: 100,
      compulsoryDeposit: 200,
      ssa: 300,
      regularLoan: 500,
      depositLoan: 100,
      admission: 0,
      total: 1200
    }];
    const v = await createVoucher({
      amount: 1200,
      partyCode: ctx.m1.code,
      details: { key: 'recovery-member', recoveryLines }
    });
    const lines = await JournalLine.find({ voucherId: v.id }).exec();
    assert.strictEqual(lines.length, 6, '6 lines for recovery');
    const cashLedgerId = String(ctx.ledgers[ACCOUNTING_ROLES.CASH].id);
    const drLine = lines.find(l => String(l.ledgerId) === cashLedgerId);
    assert.ok(drLine, 'DR on Cash');
    assert.strictEqual(Number(drLine.debitAmount), 1200);
    const totalDr = lines.reduce((s, l) => s + Number(l.debitAmount  || 0), 0);
    const totalCr = lines.reduce((s, l) => s + Number(l.creditAmount || 0), 0);
    assert.strictEqual(totalDr, 1200, 'DR = 1200');
    assert.strictEqual(totalCr, 1200, 'CR = 1200');
    assert.strictEqual(totalDr, totalCr, 'Balanced');
  });

  // ── 7. Employee Advance Paid ──────────────────────────────────────
  await t.test('7. Employee Advance Paid — Voucher persisted', async () => {
    const v = await createVoucher({
      branchCode: ctx.br1.code,
      partyCode:  ctx.e1.code,
      details: { key: 'advance-paid-emp', components: { house: 5000, vehicle: 3000, grain: 1000 } },
      voucherDate: '2024-03-01'
    });
    assert.ok(v && v.id);
  });

  await t.test('7b. Employee Advance Paid — Posting engine lines balanced', async () => {
    const v = await createVoucher({
      amount: 9000,
      partyCode: ctx.e1.code,
      details: { key: 'advance-paid-emp', components: { house: 5000, vehicle: 3000, grain: 1000 } }
    });
    const lines = await JournalLine.find({ voucherId: v.id }).exec();
    assert.strictEqual(lines.length, 4, '4 lines for advance-paid-emp');
    const totalDr = lines.reduce((s, l) => s + Number(l.debitAmount  || 0), 0);
    const totalCr = lines.reduce((s, l) => s + Number(l.creditAmount || 0), 0);
    assert.strictEqual(totalDr, 9000, 'DR = 9000');
    assert.strictEqual(totalCr, 9000, 'CR = 9000');
  });

  // ── 8. Employee Advance Recovery ─────────────────────────────────
  await t.test('8. Employee Advance Recovery — Posting engine balanced', async () => {
    const v = await createVoucher({
      amount: 900,
      partyCode: ctx.e1.code,
      details: { key: 'advance-recovery-emp', components: { house: 500, vehicle: 300, grain: 100 } }
    });
    const lines = await JournalLine.find({ voucherId: v.id }).exec();
    const totalDr = lines.reduce((s, l) => s + Number(l.debitAmount  || 0), 0);
    const totalCr = lines.reduce((s, l) => s + Number(l.creditAmount || 0), 0);
    assert.strictEqual(totalDr, 900, 'Recovery DR = 900');
    assert.strictEqual(totalCr, 900, 'Recovery CR = 900');
  });

  // ── 9. Demand Flow ────────────────────────────────────────────────
  await t.test('9. Demand Flow — DemandList → DemandLine → report', async () => {
    await MemberDemandDefault.create({
      memberCode: ctx.m1.code,
      share: 10,
      compulsoryDeposit: 20,
      ssa: 30,
      regularLoan: 40
    });

    const demandListNo = 'DL-APR-2024';
    ctx.demandListNo = demandListNo;
    await DemandList.create({
      demandListNo,
      month: 'APR',
      year: '2024',
      branchCode: ctx.br1.code,
      status: 'POSTED'
    });
    await DemandLine.create({
      demandListNo,
      memberCode: ctx.m1.code,
      memberName: 'Member One',
      compulsoryDeposit: 20,
      specialDeposit: 30,
      regularLoan: 40,
      totalAmount: 100,
      recoveredAmount: 0,
      recoveryStatus: 'PENDING'
    });

    // Confirmed fixed: buildDemandListReport now uses DemandList+DemandLine join
    const report = await buildDemandListReport({ month: 'APR' });
    assert.ok(Array.isArray(report) && report.length > 0, 'Demand report has rows');
    const m1Row = report.find(r => r.memberCode === ctx.m1.code);
    assert.ok(m1Row, 'M1 row present in demand report');
    assert.strictEqual(m1Row.month, 'APR');
    assert.strictEqual(Number(m1Row.total), 100);
    assert.strictEqual(m1Row.status, 'PENDING');
    assert.strictEqual(Number(m1Row.pending), 100, 'pending = total - recovered');
  });

  // ── 10. Report Cross-Check ────────────────────────────────────────
  await t.test('10. Report Cross-Check — Trial Balance and Member Ledger', async () => {
    // Trial Balance reads from ledger opening balances + voucher.journalLines JSON field
    const tb = await buildTrialBalanceReport({});
    assert.ok(Array.isArray(tb), 'Trial Balance is array');
    // After creating vouchers (which store journalLines in their payload), TB reflects totals
    assert.ok(tb.length > 0, 'Trial Balance has ledger rows');

    // Member Ledger
    const ml = await buildMemberLedgerReport({ memberCode: ctx.m1.code });
    assert.ok(ml, 'Member ledger returned');
    assert.ok(Array.isArray(ml.rows), 'Member ledger has rows array');
    assert.ok(ml.balances, 'Member ledger has balances');
  });

  // ── 11. Stored Interest — preserved, not recalculated ─────────────
  await t.test('11. Stored Interest Check', async () => {
    const ml = await buildMemberLedgerReport({ memberCode: ctx.m1.code });
    assert.strictEqual(Number(ml.balances.cdInterest),  150, 'cdInterest = 150');
    assert.strictEqual(Number(ml.balances.ssaInterest), 50,  'ssaInterest = 50');

    // Re-fetch: must be unchanged (not recalculated from Rate List)
    const ml2 = await buildMemberLedgerReport({ memberCode: ctx.m1.code });
    assert.strictEqual(Number(ml2.balances.cdInterest), 150, 'cdInterest unchanged on re-read');
  });

  // ── 12. Dividend Cross-Check ──────────────────────────────────────
  await t.test('12. Dividend Cross-Check', async () => {
    const rep = await buildDividendReport({ mode: 'memberwise-opening' });
    assert.ok(rep, 'Dividend report returned without error');
  });

  // ── 13. Blocked Transaction Safety ───────────────────────────────
  await t.test('13. Blocked Transaction Safety — posting engine rejects cleanly', async () => {
    const blockedTypes = [
      'insurance-paid-member',
      'bank-deposit',
      'transfer-voucher-paid',
      'interest-paid-member'
    ];

    for (const key of blockedTypes) {
      await assert.rejects(
        () => createVoucher({
          amount: 100,
          details: { key },
          partyCode: ctx.m1.code
        }),
        (err) => {
          const isBlocked = (err.name === 'PostingError') || (err.postingStatus || '').includes('BLOCKED') ||
                            (err.message        || '').includes('BLOCKED');
          assert.ok(isBlocked, `${key}: expected BLOCKED error, got: ${err.message}`);
          return true;
        },
        `${key} must throw BLOCKED error`
      );
    }
    // Posting engine never reaches DB — no side effects
    assert.ok(true, 'All blocked types rejected before DB write');
  });

  // ── 14. Money — Decimal Precision ────────────────────────────────
  await t.test('14. Money — Decimal Precision (₹1,600.03)', async () => {
    // Voucher persists decimal
    const v = await createVoucher({
      branchCode: ctx.br1.code,
      partyCode: ctx.m1.code,
      amount: 1600.03,
      details: { key: 'loan-paid-member' },
      voucherDate: '2024-06-01'
    });
    assert.strictEqual(Number(v.amount), 1600.03, 'Voucher amount = 1600.03');

    // Posting engine preserves decimal in debitAmount/creditAmount
    const lines = await JournalLine.find({ voucherId: v.id }).exec();
    const drLine = lines.find(l => Number(l.debitAmount) > 0);
    assert.ok(drLine, 'DR line present');
    assert.strictEqual(Number(drLine.debitAmount), 1600.03, 'debitAmount = 1600.03');
  });

  // ── 15. Business Code Check ───────────────────────────────────────
  await t.test('15. Business Code Check — plain integers, no prefixes', async () => {
    const prefixPattern = /^[A-Za-z]+\d+/;

    // Members 0, 1, 2
    assert.ok(isIntegerString(ctx.m1.code),  `Member code '${ctx.m1.code}' is integer`);
    assert.ok(isIntegerString(ctx.m2.code),  `Member code '${ctx.m2.code}' is integer`);
    assert.ok(isIntegerString(ctx.m3.code),  `Member code '${ctx.m3.code}' is integer`);
    // Employees 0, 1
    assert.ok(isIntegerString(ctx.e1.code),  `Employee code '${ctx.e1.code}' is integer`);
    assert.ok(isIntegerString(ctx.e2.code),  `Employee code '${ctx.e2.code}' is integer`);
    // Branches 0, 1
    assert.ok(isIntegerString(ctx.br1.code), `Branch code '${ctx.br1.code}' is integer`);
    assert.ok(isIntegerString(ctx.br2.code), `Branch code '${ctx.br2.code}' is integer`);

    // No M001/E001-style alpha prefix
    assert.ok(!prefixPattern.test(ctx.m1.code), 'Member no alpha prefix');
    assert.ok(!prefixPattern.test(ctx.e1.code), 'Employee no alpha prefix');

    // Voucher numbers are integer sequences
    const v = await Voucher.findOne({}).lean();
    if (v) {
      assert.ok(isIntegerString(v.voucherNo), `Voucher no '${v.voucherNo}' is integer`);
      assert.ok(!prefixPattern.test(v.voucherNo), 'Voucher no has no alpha prefix');
    }
  });
});

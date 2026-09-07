const assert = require('node:assert/strict');
const test = require('node:test');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase } = require('../config/postgres');
const { Ledger, Voucher, JournalLine } = require('../models/banking.models');
const {
  buildBalanceSheetReport,
  buildProfitLossReport,
  buildDayBookReport,
  buildVoucherSummaryReport
} = require('../services/banking.service');

test('Phase 3 Batch 2 Reports Engine', async (t) => {
  await initializeDatabase();
  
  // Clean up
  await Ledger.deleteMany({});
  await Voucher.deleteMany({});
  await JournalLine.deleteMany({});

  // Setup Ledgers
  const cashLedger = await Ledger.create({ code: 'L-CASH', name: 'Cash Account', nature: 'ASSET', group: 'CURRENT ASSETS', semanticRole: ACCOUNTING_ROLES.CASH, openingBalance: 10000, balanceSide: 'DR' });
  const shareLedger = await Ledger.create({ code: 'L-SHARE', name: 'Share Capital', nature: 'LIABILITY', group: 'CAPITAL', semanticRole: 'SHARE', openingBalance: 20000, balanceSide: 'CR' });
  const interestIncomeLedger = await Ledger.create({ code: 'L-INTINC', name: 'Interest Income', nature: 'INCOME', group: 'INCOME', semanticRole: 'INTEREST_INCOME', openingBalance: 0, balanceSide: 'CR' });
  const expenseLedger = await Ledger.create({ code: 'L-EXP', name: 'General Expense', nature: 'EXPENSE', group: 'EXPENSES', semanticRole: 'GENERAL_EXPENSE', openingBalance: 0, balanceSide: 'DR' });

  // Add Vouchers
  const v1 = await Voucher.create({ voucherNo: 'V-001', date: '2023-03-01', transactionType: 'receipt', voucherCategory: 'Share', amount: 500, branchCode: 'HO' });
  await JournalLine.create({ voucherId: v1.id, ledgerId: cashLedger.id, ledgerCode: cashLedger.code, debitAmount: 500, creditAmount: 0 });
  await JournalLine.create({ voucherId: v1.id, ledgerId: shareLedger.id, ledgerCode: shareLedger.code, debitAmount: 0, creditAmount: 500 });

  const v2 = await Voucher.create({ voucherNo: 'V-002', date: '2023-03-05', transactionType: 'receipt', voucherCategory: 'Interest', amount: 200, branchCode: 'HO' });
  await JournalLine.create({ voucherId: v2.id, ledgerId: cashLedger.id, ledgerCode: cashLedger.code, debitAmount: 200, creditAmount: 0 });
  await JournalLine.create({ voucherId: v2.id, ledgerId: interestIncomeLedger.id, ledgerCode: interestIncomeLedger.code, debitAmount: 0, creditAmount: 200 });

  const v3 = await Voucher.create({ voucherNo: 'V-003', date: '2023-03-10', transactionType: 'payment', voucherCategory: 'Expense', amount: 300, branchCode: 'HO' });
  await JournalLine.create({ voucherId: v3.id, ledgerId: expenseLedger.id, ledgerCode: expenseLedger.code, debitAmount: 300, creditAmount: 0 });
  await JournalLine.create({ voucherId: v3.id, ledgerId: cashLedger.id, ledgerCode: cashLedger.code, debitAmount: 0, creditAmount: 300 });

  // Expected Balances on Mar 10:
  // Cash: 10000 + 500 + 200 - 300 = 10400 (DR) -> ASSET
  // Share: 20000 + 500 = 20500 (CR) -> LIABILITY
  // Interest Income: 0 + 200 = 200 (CR) -> INCOME
  // Expense: 0 + 300 = 300 (DR) -> EXPENSE

  await t.test('Balance Sheet Report', async () => {
    const bs = await buildBalanceSheetReport({ uptoDate: '2023-03-31' });
    
    assert.strictEqual(bs.assets.length, 1);
    assert.strictEqual(bs.liabilities.length, 1);
    
    assert.strictEqual(bs.assets[0].ledgerCode, 'L-CASH');
    assert.strictEqual(bs.assets[0].amount, 10400); // 10000 + 700 - 300
    
    assert.strictEqual(bs.liabilities[0].ledgerCode, 'L-SHARE');
    assert.strictEqual(bs.liabilities[0].amount, 20500); // 20000 + 500
    
    assert.strictEqual(bs.totalAssets, 10400);
    assert.strictEqual(bs.totalLiabilities, 20500);
  });

  await t.test('Profit & Loss Report', async () => {
    const pl = await buildProfitLossReport({ uptoDate: '2023-03-31' });
    
    assert.strictEqual(pl.income.length, 1);
    assert.strictEqual(pl.expense.length, 1);
    
    assert.strictEqual(pl.income[0].ledgerCode, 'L-INTINC');
    assert.strictEqual(pl.income[0].amount, 200);
    
    assert.strictEqual(pl.expense[0].ledgerCode, 'L-EXP');
    assert.strictEqual(pl.expense[0].amount, 300);
    
    assert.strictEqual(pl.totalIncome, 200);
    assert.strictEqual(pl.totalExpense, 300);
  });

  await t.test('Day Book Report', async () => {
    const db = await buildDayBookReport({ date: '2023-03-05' }); // only v2
    
    assert.strictEqual(db.length, 2, 'Should have 2 lines for 1 voucher');
    const cashLine = db.find(l => l.ledgerCode === 'L-CASH');
    const incLine = db.find(l => l.ledgerCode === 'L-INTINC');
    
    assert.ok(cashLine, 'Cash line should be resolved correctly');
    assert.ok(incLine, 'Income line should be resolved correctly');
    
    assert.strictEqual(cashLine.debit, 200);
    assert.strictEqual(incLine.credit, 200);
  });

  await t.test('Voucher Summary Report', async () => {
    const vs = await buildVoucherSummaryReport({});
    
    assert.strictEqual(vs.length, 3);
    const expSum = vs.find(v => v.voucherCategory === 'Expense');
    assert.strictEqual(expSum.amount, 300);
    
    const intSum = vs.find(v => v.voucherCategory === 'Interest');
    assert.strictEqual(intSum.amount, 200);
  });
});

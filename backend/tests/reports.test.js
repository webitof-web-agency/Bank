const assert = require('node:assert/strict');
const test = require('node:test');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase } = require('../config/postgres');
const {
  Ledger,
  Voucher,
  JournalLine
} = require('../models/banking.models');
const {
  buildTrialBalanceReport,
  buildAccountStatementReport,
  buildCashBookReport
} = require('../services/banking.service');

test('Phase 3 Batch 1 Reports Engine', async (t) => {
  await initializeDatabase();
  
  // Clean up
  await Ledger.deleteMany({});
  await Voucher.deleteMany({});
  await JournalLine.deleteMany({});

  // 1. Setup Base Ledgers
  const cashLedger = await Ledger.create({
    code: 'L-CASH',
    name: 'Cash Account',
    nature: 'ASSET',
    group: 'CURRENT ASSETS',
    semanticRole: ACCOUNTING_ROLES.CASH,
    openingBalance: 10000,
    balanceSide: 'DR'
  });

  const loanLedger = await Ledger.create({
    code: 'L-LOAN',
    name: 'Regular Loan',
    nature: 'ASSET',
    group: 'LOANS',
    semanticRole: 'REGULAR_LOAN',
    openingBalance: 50000,
    balanceSide: 'DR'
  });

  const shareLedger = await Ledger.create({
    code: 'L-SHARE',
    name: 'Share Capital',
    nature: 'LIABILITY',
    group: 'CAPITAL',
    semanticRole: 'SHARE',
    openingBalance: 20000,
    balanceSide: 'CR'
  });

  // 2. Insert test transactions
  // V1 (Before dateFrom - Jan 15) - Issue Loan 2000 via Cash
  const v1 = await Voucher.create({
    voucherNo: 'V-001',
    date: '2023-01-15',
    transactionType: 'payment',
    branchCode: 'HO'
  });
  await JournalLine.create({ voucherId: v1.id, ledgerId: loanLedger.id, ledgerCode: loanLedger.code, debitAmount: 2000, creditAmount: 0 });
  await JournalLine.create({ voucherId: v1.id, ledgerId: cashLedger.id, ledgerCode: cashLedger.code, debitAmount: 0, creditAmount: 2000 });

  // V2 (Inside period - Feb 10) - Receive Share 500 via Cash
  const v2 = await Voucher.create({
    voucherNo: 'V-002',
    date: '2023-02-10',
    transactionType: 'receipt',
    branchCode: 'HO'
  });
  await JournalLine.create({ voucherId: v2.id, ledgerId: cashLedger.id, ledgerCode: cashLedger.code, debitAmount: 500, creditAmount: 0 });
  await JournalLine.create({ voucherId: v2.id, ledgerId: shareLedger.id, ledgerCode: shareLedger.code, debitAmount: 0, creditAmount: 500 });

  // V3 (Inside period - Feb 20) - Loan Repayment 1000 via Cash
  const v3 = await Voucher.create({
    voucherNo: 'V-003',
    date: '2023-02-20',
    transactionType: 'receipt',
    branchCode: 'HO'
  });
  await JournalLine.create({ voucherId: v3.id, ledgerId: cashLedger.id, ledgerCode: cashLedger.code, debitAmount: 1000, creditAmount: 0 });
  await JournalLine.create({ voucherId: v3.id, ledgerId: loanLedger.id, ledgerCode: loanLedger.code, debitAmount: 0, creditAmount: 1000 });

  // V4 (After dateTo - Mar 10) - Cash Payment 100
  const v4 = await Voucher.create({
    voucherNo: 'V-004',
    date: '2023-03-10',
    transactionType: 'payment',
    branchCode: 'HO'
  });
  await JournalLine.create({ voucherId: v4.id, ledgerId: loanLedger.id, ledgerCode: loanLedger.code, debitAmount: 100, creditAmount: 0 });
  await JournalLine.create({ voucherId: v4.id, ledgerId: cashLedger.id, ledgerCode: cashLedger.code, debitAmount: 0, creditAmount: 100 });

  // Target period: Feb 01 to Feb 28
  const dateFrom = '2023-02-01';
  const dateTo = '2023-02-28';

  await t.test('Trial Balance Report Calculations', async () => {
    const tb = await buildTrialBalanceReport({ dateFrom, dateTo });
    
    const cashRow = tb.find(r => r.ledgerCode === 'L-CASH');
    assert.strictEqual(cashRow.opening, 8000, 'Cash opening balance should be 8000');
    assert.strictEqual(cashRow.openingSide, 'DR');
    assert.strictEqual(cashRow.debit, 1500, 'Cash debit during period should be 1500');
    assert.strictEqual(cashRow.credit, 0, 'Cash credit during period should be 0');
    assert.strictEqual(cashRow.closing, 9500, 'Cash closing should be 9500');
    assert.strictEqual(cashRow.closingSide, 'DR');

    const loanRow = tb.find(r => r.ledgerCode === 'L-LOAN');
    assert.strictEqual(loanRow.opening, 52000);
    assert.strictEqual(loanRow.debit, 0);
    assert.strictEqual(loanRow.credit, 1000);
    assert.strictEqual(loanRow.closing, 51000);

    const shareRow = tb.find(r => r.ledgerCode === 'L-SHARE');
    assert.strictEqual(shareRow.opening, 20000);
    assert.strictEqual(shareRow.openingSide, 'CR');
    assert.strictEqual(shareRow.debit, 0);
    assert.strictEqual(shareRow.credit, 500);
    assert.strictEqual(shareRow.closing, 20500);
    assert.strictEqual(shareRow.closingSide, 'CR');
  });

  await t.test('Ledger Account Statement (Cash Ledger)', async () => {
    const statement = await buildAccountStatementReport({ ledgerId: cashLedger.id, dateFrom, dateTo });
    
    assert.strictEqual(statement.length, 3);
    
    const opening = statement[0];
    assert.strictEqual(opening.voucherNo, 'OPENING');
    assert.strictEqual(opening.balance, 8000);
    assert.strictEqual(opening.balanceSide, 'DR');
    
    const v2Row = statement[1];
    assert.strictEqual(v2Row.voucherNo, 'V-002');
    assert.strictEqual(v2Row.debit, 500);
    assert.strictEqual(v2Row.credit, 0);
    assert.strictEqual(v2Row.balance, 8500);
    
    const v3Row = statement[2];
    assert.strictEqual(v3Row.voucherNo, 'V-003');
    assert.strictEqual(v3Row.debit, 1000);
    assert.strictEqual(v3Row.credit, 0);
    assert.strictEqual(v3Row.balance, 9500);
  });

  await t.test('Cash Book Report', async () => {
    const cb = await buildCashBookReport({ dateFrom, dateTo });
    
    assert.strictEqual(cb.length, 3);
    
    const opening = cb[0];
    assert.strictEqual(opening.voucherNo, 'OPENING');
    assert.strictEqual(opening.balance, 8000);
    
    const v2Row = cb[1];
    assert.strictEqual(v2Row.voucherNo, 'V-002');
    assert.strictEqual(v2Row.transactionType, 'Receipt');
    assert.strictEqual(v2Row.accountParty, 'Share Capital');
    assert.strictEqual(v2Row.debit, 500);
    assert.strictEqual(v2Row.credit, 0);
    assert.strictEqual(v2Row.balance, 8500);
    
    const v3Row = cb[2];
    assert.strictEqual(v3Row.voucherNo, 'V-003');
    assert.strictEqual(v3Row.transactionType, 'Receipt');
    assert.strictEqual(v3Row.accountParty, 'Regular Loan');
    assert.strictEqual(v3Row.debit, 1000);
    assert.strictEqual(v3Row.credit, 0);
    assert.strictEqual(v3Row.balance, 9500);
  });

});

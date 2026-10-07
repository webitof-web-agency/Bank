const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeDatabase } = require('../config/postgres');
const bankingService = require('../services/banking.service');
const { Ledger, Member, Voucher, RecoveryLine } = require('../models/banking.models');
const { updateSettings } = require('../services/settings.service');

test.after(async () => {
  const { closeDatabase } = require('../config/postgres');
  if (closeDatabase) await closeDatabase();
});

test('Batch 4: Payment & Receipt Statement and Dividend Report', async (t) => {
  await initializeDatabase();

  await Ledger.deleteMany({});
  
  await Ledger.create({
    code: 'L1', name: 'Liability 1', nature: 'LIABILITY', group: 'SOME GROUP', openingBalance: 100, balanceSide: 'CR'
  });
  await Ledger.create({
    code: 'I1', name: 'Income 1', nature: 'INCOME', group: 'INCOME GRP', openingBalance: 200, balanceSide: 'CR'
  });
  await Ledger.create({
    code: 'P1', name: 'Primary 1', nature: 'INCOME', group: 'PRIMARY', openingBalance: 100, balanceSide: 'DR'
  });
  
  await Ledger.create({
    code: 'A1', name: 'Asset 1', nature: 'ASSET', group: 'ASSET GRP', openingBalance: 50, balanceSide: 'DR'
  });
  await Ledger.create({
    code: 'E1', name: 'Expense 1', nature: 'EXPENSE', group: 'EXP GRP', openingBalance: 150, balanceSide: 'DR'
  });

  const report = await bankingService.buildPaymentReceiptStatementReport();
  
  assert.strictEqual(report.receipts.length, 2);
  // A1, E1, then the Primary ledger as "Profit & Loss A/c", always last.
  assert.strictEqual(report.payments.length, 3);
  assert.strictEqual(report.payments[2].ledgerName, 'Profit & Loss A/c');
  assert.strictEqual(report.payments[2].amount, 100);
  
  const receiptCodes = report.receipts.map(r => r.ledgerCode);
  assert.ok(receiptCodes.includes('L1'));
  assert.ok(receiptCodes.includes('I1'));
  
  
  const paymentCodes = report.payments.map(p => p.ledgerCode);
  assert.ok(paymentCodes.includes('A1'));
  assert.ok(paymentCodes.includes('E1'));
  
  // Sorted by name; the two sides agree once the P&L A/c is in.
  assert.deepStrictEqual(report.receipts.map(r => r.ledgerName), ['Income 1', 'Liability 1']);
  assert.strictEqual(report.receiptTotal, 300);
  assert.strictEqual(report.paymentTotal, 300);

  // Dividend tests
  await Member.deleteMany({});
  await Voucher.deleteMany({});
  await RecoveryLine.deleteMany({});
  
  
  await updateSettings({
    payload: {
      ratesConfig: {
        interestRates: {
          paid: { dividend: 10 }
        },
        // Flat rates only count while there is no dated history.
        interestRateHistory: []
      }
    }
  });

  await Member.create({
    code: 'M1', name: 'Member 1', branchCode: 'B1', pfNo: 'PF1', designation: 'CLERK', balances: { share: 1000 }
  });
  await Member.create({
    code: 'M2', name: 'Member 2', branchCode: 'B2', balances: { share: 500 }
  });
  // Nil share: legacy leaves the member off the dividend sheet.
  await Member.create({
    code: 'M3', name: 'Member 3', branchCode: 'B1', balances: { share: 0 }
  });

  // M1's share grows by 100 inside FY 2024-25: opening 900, closing 1000
  // (balances.share is the current snapshot; the walk runs back from it).
  const v = await Voucher.create({
    date: '2024-06-01', partyCode: 'M1', branchCode: 'B1', voucherNo: 'V1',
    details: { key: 'recovery' }
  });
  await RecoveryLine.create({
    voucherId: String(v._id || v.id), memberCode: 'M1', share: 100
  });
  const fy = { dateFrom: '2024-04-01', uptoDate: '2025-03-31' };

  // 1. Memberwise Opening
  const mo = await bankingService.buildDividendReport({ mode: 'memberwise-opening', ...fy });
  assert.strictEqual(mo.length, 2);
  const mo1 = mo.find(m => m.memberCode === 'M1');
  assert.strictEqual(mo1.share, 900);
  assert.strictEqual(mo1.dividendRate, 10);
  assert.strictEqual(mo1.dividendAmount, 90); // 10% of 900
  assert.strictEqual(mo1.pfNo, 'PF1');
  assert.strictEqual(mo1.grade, 'CLERK');

  // 2. Memberwise Closing
  const mc = await bankingService.buildDividendReport({ mode: 'memberwise-closing', ...fy });
  const mc1 = mc.find(m => m.memberCode === 'M1');
  assert.strictEqual(mc1.share, 1000);
  assert.strictEqual(mc1.dividendAmount, 100); // 10% of 1000

  // 3. Branchwise Opening
  const bo = await bankingService.buildDividendReport({ mode: 'branchwise-opening', ...fy });
  assert.strictEqual(bo.length, 2);
  const bo1 = bo.find(b => b.branch === 'B1');
  assert.strictEqual(bo1.memberCount, 1);
  assert.strictEqual(bo1.shareTotal, 900);
  assert.strictEqual(bo1.dividendTotal, 90);

  // 4. Summary Closing: the member rows; the print groups them by branch.
  const sc = await bankingService.buildDividendReport({ mode: 'summary-closing', ...fy });
  assert.strictEqual(sc.length, 2);
  assert.strictEqual(sc.reduce((t, r) => t + r.share, 0), 1500); // M1:1000 + M2:500
  assert.strictEqual(sc.reduce((t, r) => t + r.dividendAmount, 0), 150);

  // 5. A declared rate overrides the rate master.
  const ro = await bankingService.buildDividendReport({ mode: 'branchwise-closing', rate: '5', ...fy });
  assert.strictEqual(ro.find(b => b.branch === 'B1').dividendTotal, 50);
});

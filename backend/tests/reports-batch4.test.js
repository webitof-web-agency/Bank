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
    code: 'P1', name: 'Primary 1', nature: 'INCOME', group: 'PRIMARY', openingBalance: 300, balanceSide: 'CR'
  });
  
  await Ledger.create({
    code: 'A1', name: 'Asset 1', nature: 'ASSET', group: 'ASSET GRP', openingBalance: 50, balanceSide: 'DR'
  });
  await Ledger.create({
    code: 'E1', name: 'Expense 1', nature: 'EXPENSE', group: 'EXP GRP', openingBalance: 150, balanceSide: 'DR'
  });

  const report = await bankingService.buildPaymentReceiptStatementReport();
  
  assert.strictEqual(report.receipts.length, 2);
  assert.strictEqual(report.payments.length, 2);
  
  const receiptCodes = report.receipts.map(r => r.ledgerCode);
  assert.ok(receiptCodes.includes('L1'));
  assert.ok(receiptCodes.includes('I1'));
  
  
  const paymentCodes = report.payments.map(p => p.ledgerCode);
  assert.ok(paymentCodes.includes('A1'));
  assert.ok(paymentCodes.includes('E1'));
  
  assert.strictEqual(report.receiptTotal, 300);
  assert.strictEqual(report.paymentTotal, 200);

  // Dividend tests
  await Member.deleteMany({});
  await Voucher.deleteMany({});
  await RecoveryLine.deleteMany({});
  
  
  await updateSettings({
    payload: {
      ratesConfig: {
        interestRates: {
          paid: { dividend: 10 }
        }
      }
    }
  });

  await Member.create({
    code: 'M1', name: 'Member 1', branchCode: 'B1', balances: { share: 1000 }
  });
  await Member.create({
    code: 'M2', name: 'Member 2', branchCode: 'B2', balances: { share: 500 }
  });
  
  // Create vouchers to test closing balance logic
  // m1 paid a share of 200 (decrease share)
  const v = await Voucher.create({
    date: '2024-01-01', partyCode: 'M1', branchCode: 'B1', voucherNo: 'V1',
    details: { key: 'loan-paid-member', components: { share: 200 } }
  });
  // m1 recovered a share of 100 (increase share)
  await RecoveryLine.create({
    voucherId: String(v._id || v.id), memberCode: 'M1', share: 100
  });

  // 1. Memberwise Opening
  const mo = await bankingService.buildDividendReport({ mode: 'memberwise-opening' });
  assert.strictEqual(mo.length, 2);
  const mo1 = mo.find(m => m.memberCode === 'M1');
  assert.strictEqual(mo1.openingShare, 1000);
  assert.strictEqual(mo1.share, 1000);
  assert.strictEqual(mo1.dividendAmount, 100); // 10% of 1000

  // 2. Memberwise Closing
  const mc = await bankingService.buildDividendReport({ mode: 'memberwise-closing' });
  const mc1 = mc.find(m => m.memberCode === 'M1');
  assert.strictEqual(mc1.openingShare, 1000);
  assert.strictEqual(mc1.closingShare, 900); // 1000 - 200 + 100
  assert.strictEqual(mc1.share, 900);
  assert.strictEqual(mc1.dividendAmount, 90); // 10% of 900
  
  // 3. Branchwise Opening
  const bo = await bankingService.buildDividendReport({ mode: 'branchwise-opening' });
  assert.strictEqual(bo.length, 2);
  const bo1 = bo.find(b => b.branch === 'B1');
  assert.strictEqual(bo1.memberCount, 1);
  assert.strictEqual(bo1.shareTotal, 1000);
  assert.strictEqual(bo1.dividendTotal, 100);

  // 4. Summary Closing
  const sc = await bankingService.buildDividendReport({ mode: 'summary-closing' });
  assert.strictEqual(sc.memberCount, 2);
  assert.strictEqual(sc.shareTotal, 1400); // M1:900 + M2:500
  assert.strictEqual(sc.dividendTotal, 140); 
});

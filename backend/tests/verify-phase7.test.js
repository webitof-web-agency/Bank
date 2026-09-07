const test = require('node:test');
const assert = require('node:assert');
const { createVoucher, updateVoucher, deleteVoucher } = require('../services/banking.service');
const { Voucher, JournalLine, RecoveryLine, Ledger } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');

test('Phase 7 Final Verification Suite', async (t) => {
  await t.test('1. Verify Blocked Transactions through createVoucher', async (sub) => {
    const blockedTypes = ['insurance-paid-member', 'bank-deposit', 'transfer-paid-member', 'interest-paid-member'];
    
    for (const type of blockedTypes) {
      await sub.test(`Blocked: ${type}`, async () => {
        const initialVoucherCount = await Voucher.countDocuments();
        const initialJournalCount = await JournalLine.countDocuments();
        const initialRecoveryCount = await RecoveryLine.countDocuments();
        
        try {
          await createVoucher({
            transactionType: type,
            amount: 500,
            voucherDate: '2023-01-01',
            details: { key: type }
          });
          assert.fail(`Should have thrown PostingError for ${type}`);
        } catch (err) {
          assert(err.name === 'PostingError' || err.message.includes('BLOCKED_LEGACY_UNKNOWN'), `Expected PostingError, got ${err.name}: ${err.message}`);
        }
        
        assert.strictEqual(await Voucher.countDocuments(), initialVoucherCount, 'Voucher count should be unchanged');
        assert.strictEqual(await JournalLine.countDocuments(), initialJournalCount, 'JournalLine count should be unchanged');
        assert.strictEqual(await RecoveryLine.countDocuments(), initialRecoveryCount, 'RecoveryLine count should be unchanged');
      });
    }
  });

  await t.test('2. Verify Relational Journal Lines for successful flows', async (sub) => {
    const validFlows = [
      { type: 'loan-paid-member', data: { amount: 500, details: { key: 'loan-paid-member', loanAccount: 'L1', paymentMode: 'cash' } } },
      { type: 'deposit-paid-member', data: { amount: 500, details: { key: 'deposit-paid-member', depositAccount: 'D1', paymentMode: 'cash' } } },
      { type: 'ssa-paid-member', data: { amount: 500, details: { key: 'ssa-paid-member', ssaAccount: 'S1', paymentMode: 'cash' } } },
      { type: 'recovery-member', data: { amount: 300, details: { key: 'recovery-member', paymentMode: 'cash', recoveryLines: [{ compulsoryDeposit: 100, regularLoan: 200, memberCode: 'M1', total: 300 }] } } },
      { type: 'advance-paid-emp', data: { amount: 500, details: { key: 'advance-paid-emp', paymentMode: 'cash', components: { house: 500 } } } },
      { type: 'advance-recovery-emp', data: { amount: 500, details: { key: 'advance-recovery-emp', paymentMode: 'cash', components: { house: 500 } } } }
    ];

    for (const flow of validFlows) {
      await sub.test(`Flow: ${flow.type}`, async () => {
        const v = await createVoucher({
          transactionType: flow.type,
          voucherDate: '2023-01-01',
          ...flow.data
        });
        
        assert(v, 'Voucher should be created');
        const journalLines = await JournalLine.find({ voucherId: String(v._id || v.id) }).lean();
        assert(journalLines.length > 0, 'Should have relational JournalLines');
        
        const totalDr = journalLines.reduce((sum, l) => sum + Number(l.debitAmount || 0), 0);
        const totalCr = journalLines.reduce((sum, l) => sum + Number(l.creditAmount || 0), 0);
        
        assert(totalDr > 0, `Total Debit must be > 0 (got ${totalDr})`);
        assert(totalCr > 0, `Total Credit must be > 0 (got ${totalCr})`);
        assert.strictEqual(totalDr, totalCr, `Debit (${totalDr}) must equal Credit (${totalCr})`);

        if (flow.type === 'loan-paid-member') {
          const regularLoanLedger = await Ledger.findOne({ semanticRole: ACCOUNTING_ROLES.REGULAR_LOAN }).lean();
          const cashLedger = await Ledger.findOne({ semanticRole: ACCOUNTING_ROLES.CASH }).lean();

          const drLine = journalLines.find(l => l.ledgerId === String(regularLoanLedger._id || regularLoanLedger.id));
          const crLine = journalLines.find(l => l.ledgerId === String(cashLedger._id || cashLedger.id));

          assert(drLine, 'Regular Loan DR line exists');
          assert(crLine, 'Cash CR line exists');
          assert.strictEqual(Number(drLine.debitAmount), 500, 'Regular Loan debit = 500');
          assert.strictEqual(Number(crLine.creditAmount), 500, 'Cash credit = 500');
        }
      });
    }
  });

  await t.test('3. Verify UPDATEVOUCHER runtime test', async () => {
    // create loan-paid-member amount 500
    let v = await createVoucher({
      transactionType: 'loan-paid-member',
      amount: 500,
      voucherDate: '2023-01-01',
      details: { key: 'loan-paid-member', loanAccount: 'L1', paymentMode: 'cash' }
    });
    
    assert(v, 'Voucher should be created');
    let journalLines = await JournalLine.find({ voucherId: String(v._id || v.id) }).lean();
    assert(journalLines.length > 0, 'Should have initial relational JournalLines');

    // update same voucher to amount 700
    const updatedV = await updateVoucher(String(v._id || v.id), {
      transactionType: 'loan-paid-member',
      amount: 700,
      voucherDate: '2023-01-01',
      details: { key: 'loan-paid-member', loanAccount: 'L1', paymentMode: 'cash' }
    });
    assert.strictEqual(Number(updatedV.amount), 700, 'Voucher amount should be updated to 700');

    journalLines = await JournalLine.find({ voucherId: String(v._id || v.id) }).lean();
    const newTotalDr = journalLines.reduce((sum, l) => sum + Number(l.debitAmount || 0), 0);
    const newTotalCr = journalLines.reduce((sum, l) => sum + Number(l.creditAmount || 0), 0);
    assert.strictEqual(newTotalDr, 700, 'Regenerated JournalLines total DR = 700');
    assert.strictEqual(newTotalCr, 700, 'Regenerated JournalLines total CR = 700');

    // test rollback: attempt update to a BLOCKED transaction/rule
    try {
      await updateVoucher(String(v._id || v.id), {
        transactionType: 'insurance-paid-member',
        amount: 800,
        voucherDate: '2023-01-01',
        details: { key: 'insurance-paid-member', paymentMode: 'cash' }
      });
      assert.fail('Update to blocked transaction should have thrown PostingError');
    } catch (err) {
      assert(err.name === 'PostingError' || err.message.includes('BLOCKED_LEGACY_UNKNOWN'), `Expected PostingError, got ${err.name}: ${err.message}`);
    }

    // original Voucher remains unchanged
    const rolledBackV = await Voucher.findOne({ _id: String(v._id || v.id) }).lean();
    assert.strictEqual(Number(rolledBackV.amount), 700, 'Voucher amount should remain 700 after failed update');

    // original JournalLines remain unchanged
    const rolledBackJournalLines = await JournalLine.find({ voucherId: String(v._id || v.id) }).lean();
    const rolledBackTotalDr = rolledBackJournalLines.reduce((sum, l) => sum + Number(l.debitAmount || 0), 0);
    assert.strictEqual(rolledBackTotalDr, 700, 'JournalLines total DR should remain 700 after failed update');
  });

  await t.test('4. Verify DELETEVOUCHER runtime test', async () => {
    const v = await createVoucher({
      transactionType: 'recovery-member',
      amount: 300,
      voucherDate: '2023-01-01',
      details: { key: 'recovery-member', paymentMode: 'cash', recoveryLines: [{ compulsoryDeposit: 100, regularLoan: 200, memberCode: 'M1', total: 300 }] }
    });
    const vId = String(v._id || v.id);
    
    assert(await Voucher.countDocuments({ _id: vId }) === 1, 'Voucher exists before delete');
    assert(await RecoveryLine.countDocuments({ voucherId: vId }) > 0, 'RecoveryLine exists before delete');
    assert(await JournalLine.countDocuments({ voucherId: vId }) > 0, 'JournalLine exists before delete');

    await deleteVoucher(vId);

    assert(await Voucher.countDocuments({ _id: vId }) === 0, 'Voucher is deleted');
    assert(await RecoveryLine.countDocuments({ voucherId: vId }) === 0, 'RecoveryLines are deleted');
    assert(await JournalLine.countDocuments({ voucherId: vId }) === 0, 'JournalLines are deleted');
  });
});

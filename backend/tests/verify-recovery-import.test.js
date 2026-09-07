const test = require('node:test');
const assert = require('node:assert');
const { postBatch } = require('../services/recoveryImport.service');
const { Member, RecoveryImportBatch, RecoveryImportRow, Voucher, RecoveryLine, JournalLine, Ledger } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');

test('Recovery Import final-post integration test', async (t) => {
  await t.test('1. Verify final post -> Voucher -> RecoveryLine -> relational JournalLine', async () => {
    // Setup
    const member = await Member.create({
      code: 'M_REC_IMP_001',
      name: 'Test Recovery Member',
      status: 'ACTIVE'
    });

    const batch = await RecoveryImportBatch.create({
      importDate: new Date(),
      status: 'ACCEPTED',
      totalRows: 1,
      totalRecoveryAmount: 500
    });

    const row = await RecoveryImportRow.create({
      batchId: batch.id,
      memberId: member.id,
      memberCode: member.code,
      status: 'VALID',
      allocatedTotal: 500,
      allocatedRegularLoan: 500,
      allocatedCompulsoryDeposit: 0,
      allocatedSpecialDeposit: 0,
      allocatedShare: 0,
      allocatedLoanAgainstDeposit: 0
    });

    // Execute Final Post
    const postedBatch = await postBatch(batch.id);

    // Assert Batch Status
    assert.strictEqual(postedBatch.status, 'POSTED', 'Batch should be POSTED');

    // Assert Row Status
    const postedRow = await RecoveryImportRow.findById(row.id);
    assert.strictEqual(postedRow.status, 'POSTED', 'Row should be POSTED');
    assert.ok(postedRow.recoveryVoucherId, 'Row should have recoveryVoucherId linked');

    // Assert Voucher
    const voucherId = String(postedRow.recoveryVoucherId);
    const voucher = await Voucher.findById(voucherId);
    assert.ok(voucher, 'Voucher should be created');
    assert.strictEqual(Number(voucher.amount), 500, 'Voucher amount should be 500');
    assert.strictEqual(voucher.details.key, 'recovery-member', 'Should use common recovery-member path');

    // Assert RecoveryLine
    const recoveryLines = await RecoveryLine.find({ voucherId: voucherId });
    assert.strictEqual(recoveryLines.length, 1, 'RecoveryLine should be created');
    const recLine = recoveryLines[0];
    assert.strictEqual(String(recLine.voucherId), voucherId, 'RecoveryLine.voucherId = Voucher.id');
    assert.strictEqual(recLine.memberCode, 'M_REC_IMP_001', 'RecoveryLine memberCode matches');
    assert.strictEqual(Number(recLine.total), 500, 'RecoveryLine total matches');
    
    // Assert JournalLine
    const journalLines = await JournalLine.find({ voucherId: voucherId });
    assert.ok(journalLines.length > 0, 'Relational JournalLines should be created');
    
    let totalDr = 0;
    let totalCr = 0;
    for (const jl of journalLines) {
      assert.strictEqual(String(jl.voucherId), voucherId, 'JournalLine.voucherId = Voucher.id');
      totalDr += Number(jl.debitAmount || 0);
      totalCr += Number(jl.creditAmount || 0);
    }
    
    assert.ok(totalDr > 0, 'DR > 0');
    assert.ok(totalCr > 0, 'CR > 0');
    assert.strictEqual(totalDr, totalCr, 'DR = CR');
    assert.strictEqual(totalDr, 500, 'DR amount matches voucher amount');
  });
});

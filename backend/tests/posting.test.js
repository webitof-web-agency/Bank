const assert = require('node:assert/strict');
const test = require('node:test');
const { buildJournalLinesForVoucher, PostingError } = require('../services/posting.service');
const { createVoucher, updateVoucher } = require('../services/banking.service');
const { Voucher, JournalLine, RecoveryLine, Ledger } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase, withTransaction, getCachedRows } = require('../config/postgres');
const crypto = require('crypto');

async function seedLedgers() {
  await initializeDatabase();
  const roles = [
    ACCOUNTING_ROLES.CASH,
    ACCOUNTING_ROLES.SHARE,
    ACCOUNTING_ROLES.COMPULSORY_DEPOSIT,
    ACCOUNTING_ROLES.SPECIAL_DEPOSIT,
    ACCOUNTING_ROLES.REGULAR_LOAN,
    ACCOUNTING_ROLES.LOAN_AGAINST_DEPOSIT,
    ACCOUNTING_ROLES.ADMISSION,
    ACCOUNTING_ROLES.EMPLOYEE_HOUSING_LOAN,
    ACCOUNTING_ROLES.EMPLOYEE_VEHICLE_LOAN,
    ACCOUNTING_ROLES.EMPLOYEE_GRAIN_ADVANCE,
    ACCOUNTING_ROLES.EMPLOYEE_ADVANCE
  ];

  for (const role of roles) {
    const exists = await Ledger.findOne({ semanticRole: role });
    if (!exists) {
      await Ledger.create({
        code: `TEST-${role}`,
        name: `Test ${role}`,
        semanticRole: role
      });
    }
  }
}

test('Employee components - advance-paid-emp resolves to separate roles', async () => {
  await seedLedgers();
  const voucher = {
    voucherNo: 'V-EMP-001',
    amount: 17000,
    partyCode: 'E-001',
    details: {
      key: 'advance-paid-emp',
      components: {
        house: 10000,
        vehicle: 5000,
        grain: 2000
      }
    }
  };

  const lines = await buildJournalLinesForVoucher(voucher);
  assert.equal(lines.length, 4);

  const houseLine = lines.find(l => l.debitAmount === 10000);
  const vehicleLine = lines.find(l => l.debitAmount === 5000);
  const grainLine = lines.find(l => l.debitAmount === 2000);
  const crLine = lines.find(l => l.creditAmount === 17000);

  assert.ok(houseLine);
  assert.ok(vehicleLine);
  assert.ok(grainLine);
  assert.ok(crLine);

  const houseLedger = await Ledger.findById(houseLine.ledgerId);
  const vehicleLedger = await Ledger.findById(vehicleLine.ledgerId);
  const grainLedger = await Ledger.findById(grainLine.ledgerId);

  assert.equal(houseLedger.semanticRole, ACCOUNTING_ROLES.EMPLOYEE_HOUSING_LOAN);
  assert.equal(vehicleLedger.semanticRole, ACCOUNTING_ROLES.EMPLOYEE_VEHICLE_LOAN);
  assert.equal(grainLedger.semanticRole, ACCOUNTING_ROLES.EMPLOYEE_GRAIN_ADVANCE);
});

test('Create rollback - failure leaves no trace', async () => {
  await seedLedgers();
  const testVoucherNo = `FAIL-${crypto.randomUUID()}`;
  
  const voucherData = {
    voucherNo: testVoucherNo,
    amount: 1000,
    partyCode: 'M-001',
    details: {
      key: 'loan-paid-member'
    }
  };

  let threw = false;
  const originalInsertMany = JournalLine.insertMany;
  
  try {
    JournalLine.insertMany = async () => { throw new Error('Forced failure during journal save'); };
    await createVoucher(voucherData);
  } catch (err) {
    threw = true;
    assert.equal(err.message, 'Forced failure during journal save');
  } finally {
    JournalLine.insertMany = originalInsertMany;
  }

  assert.ok(threw, 'Should throw Forced failure');

  // Verify rollback
  const checkVoucher = await Voucher.findOne({ voucherNo: testVoucherNo });
  assert.equal(checkVoucher, null, 'Voucher should not exist');

  const cache = getCachedRows('vouchers');
  const cachedVoucher = cache.find(v => v.voucherNo === testVoucherNo);
  assert.equal(cachedVoucher, undefined, 'Voucher should not be in cache');
});

test('Update rollback - failure leaves original data intact', async () => {
  await seedLedgers();
  const testVoucherNo = `UPD-${crypto.randomUUID()}`;
  
  // Create valid initial voucher
  const voucherData = {
    voucherNo: testVoucherNo,
    amount: 1000,
    partyCode: 'M-001',
    details: {
      key: 'loan-paid-member'
    }
  };

  const created = await createVoucher(voucherData);
  const originalLines = await JournalLine.find({ voucherId: created.id }).exec();
  assert.equal(originalLines.length, 2);

  let threw = false;
  const originalDeleteMany = JournalLine.deleteMany;
  
  try {
    JournalLine.deleteMany = async () => { throw new Error('Forced failure during update'); };
    await updateVoucher(created.id, { amount: 2000 });
  } catch (err) {
    threw = true;
    assert.equal(err.message, 'Forced failure during update');
  } finally {
    JournalLine.deleteMany = originalDeleteMany;
  }

  assert.ok(threw, 'Should throw Forced failure');

  // Verify untouched
  const current = await Voucher.findById(created.id);
  assert.equal(Number(current.amount), 1000, 'Voucher amount should be rolled back to 1000');

  const currentLines = await JournalLine.find({ voucherId: created.id }).exec();
  assert.equal(currentLines.length, 2);
  assert.equal(currentLines[0].debitAmount, originalLines[0].debitAmount);
});

test('Recovery rollback - atomic failure across multiple tables', async () => {
  await seedLedgers();
  const testVoucherNo = `REC-${crypto.randomUUID()}`;
  
  const voucherData = {
    voucherNo: testVoucherNo,
    details: {
      key: 'recovery-member',
      recoveryLines: [
      { memberCode: 'M-001', share: 100, compulsoryDeposit: 500, regularLoan: 2000, total: 2600 }
      ]
    }
  };

  let threw = false;
  const originalInsertMany = JournalLine.insertMany;
  
  try {
    JournalLine.insertMany = async () => { throw new Error('Forced failure in recovery posting'); };
    await createVoucher(voucherData);
  } catch (err) {
    threw = true;
    assert.equal(err.message, 'Forced failure in recovery posting');
  } finally {
    JournalLine.insertMany = originalInsertMany;
  }

  assert.ok(threw);

  const checkVoucher = await Voucher.findOne({ voucherNo: testVoucherNo });
  assert.equal(checkVoucher, null);

  const checkRecovery = await RecoveryLine.find({ voucherNo: testVoucherNo }).exec();
  assert.equal(checkRecovery.length, 0);
});

test('Cache test - tx operations bypass cache until commit', async () => {
  await seedLedgers();
  const testVoucherNo = `CACHE-${crypto.randomUUID()}`;

  let threw = false;
  try {
    await withTransaction(async (tx) => {
      await Voucher.create({ voucherNo: testVoucherNo, amount: 500 }, { tx });
      const cacheInside = getCachedRows('vouchers').find(v => v.voucherNo === testVoucherNo);
      assert.equal(cacheInside, undefined, 'Cache should not see uncommitted tx row');
      throw new Error('Rollback');
    });
  } catch (err) {
    threw = true;
  }
  assert.ok(threw);

  const cacheAfterRollback = getCachedRows('vouchers').find(v => v.voucherNo === testVoucherNo);
  assert.equal(cacheAfterRollback, undefined);
});

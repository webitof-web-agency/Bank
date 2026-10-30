const assert = require('node:assert/strict');
const test = require('node:test');
const { buildJournalLinesForVoucher, PostingError } = require('../services/posting.service');
const { createVoucher, updateVoucher } = require('../services/banking.service');
const { Voucher, JournalLine, RecoveryLine, Ledger, Member } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase, withTransaction, getCachedRows, restoreMainRow } = require('../config/postgres');
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
    // Every voucher needs its date; member vouchers also a mode.
    date: '2026-10-07',
    mode: 'Cash',
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
    // Every voucher needs its date; member vouchers also a mode.
    date: '2026-10-07',
    mode: 'Cash',
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
  // Recovery lines must name an existing member.
  if (!(await Member.findOne({ code: 'M-001' }))) await Member.create({ code: 'M-001', name: 'Test Member' });
  const testVoucherNo = `REC-${crypto.randomUUID()}`;
  
  const voucherData = {
    voucherNo: testVoucherNo,
    // Every voucher needs its date; member vouchers also a mode.
    date: '2026-10-07',
    mode: 'Cash',
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

// Payment / Receipt Voucher (legacy TransType 18 / 19): the ledger Dr / Cr,
// Cash-in-Hand the other side in cash; a cheque is one-sided in legacy, so its
// other side is the Transfer Adjustment account.
// Its own ledger is created for this run and removed afterwards; a shared
// Cash / Transfer Adjustment ledger another suite soft-deleted is brought back
// for the run and deleted again after it.
const generalRun = { created: null, restored: [] };

async function generalVoucherLedgers() {
  const db = await initializeDatabase();
  if (!generalRun.created) {
    for (const role of [ACCOUNTING_ROLES.CASH, ACCOUNTING_ROLES.TRANSFER_ADJUSTMENT, ACCOUNTING_ROLES.BANK_SAVING, ACCOUNTING_ROLES.BANK_CC, ACCOUNTING_ROLES.REGULAR_LOAN]) {
      if (await Ledger.findOne({ semanticRole: role })) continue;
      const deleted = (await db.query(`SELECT id FROM ledgers WHERE "semanticRole" = $1 AND "deletedAt" IS NOT NULL ORDER BY "deletedAt" DESC LIMIT 1`, [role])).rows[0];
      if (deleted && await restoreMainRow('ledgers', deleted.id)) generalRun.restored.push(deleted.id);
    }
    generalRun.created = await Ledger.create({ code: `TEST-PV-${crypto.randomUUID().slice(0, 8)}`, name: 'Test Contingent A/c' });
  }
  return {
    cash: await Ledger.findOne({ semanticRole: ACCOUNTING_ROLES.CASH }),
    adjustment: await Ledger.findOne({ semanticRole: ACCOUNTING_ROLES.TRANSFER_ADJUSTMENT }),
    expense: generalRun.created
  };
}

test.after(async () => {
  if (!generalRun.created) return;
  const db = await initializeDatabase();
  await db.query('DELETE FROM ledgers WHERE id = $1', [String(generalRun.created.id || generalRun.created._id)]);
  for (const id of generalRun.restored) await Ledger.findByIdAndDelete(id);
});

const sides = (lines) => lines.map((l) => [l.ledgerId, l.debitAmount, l.creditAmount]);

test('Payment Voucher - ledger Dr; Cash-In-Hand Cr in cash, Transfer Adjustment Cr by cheque', async () => {
  const { cash, adjustment, expense } = await generalVoucherLedgers();
  const voucher = { voucherNo: 'PV-1', amount: 280, partyCode: expense.code, details: { key: 'payment-voucher' } };
  assert.deepEqual(sides(await buildJournalLinesForVoucher({ ...voucher, mode: 'Cash-In-Hand' })), [[String(expense.id), 280, 0], [String(cash.id), 0, 280]]);
  assert.deepEqual(sides(await buildJournalLinesForVoucher({ ...voucher, mode: 'Cheque' })), [[String(expense.id), 280, 0], [String(adjustment.id), 0, 280]]);
});

test('Receipt Voucher - ledger Cr; Cash-In-Hand Dr in cash, Transfer Adjustment Dr by cheque', async () => {
  const { cash, adjustment, expense } = await generalVoucherLedgers();
  const voucher = { voucherNo: 'RV-1', amount: 500, partyCode: expense.code, details: { key: 'receipt-voucher' } };
  assert.deepEqual(sides(await buildJournalLinesForVoucher({ ...voucher, mode: 'Cash-In-Hand' })), [[String(expense.id), 0, 500], [String(cash.id), 500, 0]]);
  assert.deepEqual(sides(await buildJournalLinesForVoucher({ ...voucher, mode: 'Cheque' })), [[String(expense.id), 0, 500], [String(adjustment.id), 500, 0]]);
});

test('Payment / Receipt Voucher - refuse no ledger, no amount, or the pay mode ledger itself', async () => {
  const { cash, expense } = await generalVoucherLedgers();
  const base = { voucherNo: 'PV-2', amount: 100, mode: 'Cash-In-Hand', details: { key: 'payment-voucher' } };
  await assert.rejects(buildJournalLinesForVoucher(base), /ledger/);
  await assert.rejects(buildJournalLinesForVoucher({ ...base, partyCode: expense.code, amount: 0 }), /amount/);
  await assert.rejects(buildJournalLinesForVoucher({ ...base, partyCode: cash.code }), /pay mode account/);
});

// Bank vouchers (legacy TransType 6-11): the bank ledger in the voucher's
// legacy direction; Cash-in-Hand only for a cash deposit / self-use cheque,
// otherwise the Transfer Adjustment account (legacy posted them one-sided).
test('Bank vouchers post as legacy VwLedgerTransaction does', async () => {
  const { cash, adjustment } = await generalVoucherLedgers();
  const saving = String((await Ledger.findOne({ semanticRole: ACCOUNTING_ROLES.BANK_SAVING })).id);
  const cc = String((await Ledger.findOne({ semanticRole: ACCOUNTING_ROLES.BANK_CC })).id);
  const ta = String(adjustment.id);
  const cashId = String(cash.id);
  const post = async (details) => sides(await buildJournalLinesForVoucher({ voucherNo: 'BK', amount: 500, details }));
  assert.deepEqual(await post({ key: 'loan-recv-cash' }), [[cc, 0, 500], [ta, 500, 0]]);
  assert.deepEqual(await post({ key: 'loan-recv-saving' }), [[saving, 500, 0], [ta, 0, 500]]);
  assert.deepEqual(await post({ key: 'deposit-in-bank', depositIn: 'BANK_SAVING', depositBy: 'CASH' }), [[saving, 500, 0], [cashId, 0, 500]]);
  assert.deepEqual(await post({ key: 'deposit-in-bank', depositIn: 'BANK_CC', depositBy: 'DD/CHEQUE' }), [[cc, 500, 0], [ta, 0, 500]]);
  assert.deepEqual(await post({ key: 'cheque-issue-saving' }), [[saving, 0, 500], [ta, 500, 0]]);
  assert.deepEqual(await post({ key: 'cheque-issue-saving', selfUse: true }), [[saving, 0, 500], [cashId, 500, 0]]);
  assert.deepEqual(await post({ key: 'transfer-saving' }), [[saving, 0, 500], [ta, 500, 0]]);
  assert.deepEqual(await post({ key: 'transfer-cashcredit' }), [[cc, 500, 0], [ta, 0, 500]]);
});

test('A member voucher paid by cheque leaves its bank side to the Cheque Issue', async () => {
  const { cash, adjustment } = await generalVoucherLedgers();
  const loanPaid = (mode) => buildJournalLinesForVoucher({ voucherNo: 'LP', amount: 700, partyCode: 'M-1', mode, details: { key: 'loan-paid-member' } });
  assert.equal((await loanPaid('CASH')).find((l) => l.creditAmount === 700).ledgerId, String(cash.id));
  assert.equal((await loanPaid('CHEQUE')).find((l) => l.creditAmount === 700).ledgerId, String(adjustment.id));
  // With its Cheque Issue the Transfer Adjustment account nets to zero.
  const issue = await buildJournalLinesForVoucher({ voucherNo: 'CI', amount: 700, details: { key: 'cheque-issue-saving' } });
  const net = [...(await loanPaid('CHEQUE')), ...issue]
    .filter((l) => l.ledgerId === String(adjustment.id))
    .reduce((sum, l) => sum + l.debitAmount - l.creditAmount, 0);
  assert.equal(net, 0);
});

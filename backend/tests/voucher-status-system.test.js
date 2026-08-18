const assert = require('node:assert/strict');
const test = require('node:test');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');
const { PERMISSIONS } = require('../config/rbac');
const automation = require('../services/automation.service');
const banking = require('../services/banking.service');

test('voucher persistence has no status field', () => {
  assert.equal(Object.hasOwn(TABLE_SCHEMAS.vouchers.fields, 'status'), false);
  assert.equal(Object.hasOwn(TABLE_SCHEMAS.vouchers.fields, 'reversalOf'), false);
  assert.equal(Object.hasOwn(TABLE_SCHEMAS.vouchers.fields, 'reversedByUserId'), false);
});

test('voucher status workflow permissions and automation are removed', () => {
  assert.equal(PERMISSIONS.some((permission) => permission.code === 'transactions.reverse'), false);
  assert.equal(Object.hasOwn(automation, 'runDraftVoucherReminder'), false);
});

test('bank vouchers discard settlement account details in backend normalization', () => {
  const normalized = banking.normalizeResourcePayload('vouchers', {
    details: {
      key: 'loan-recv-cash',
      settlementAccount: 'L002',
      fixedSettlement: 'L002',
      fromAccount: 'L002',
      toAccount: 'L013',
      fixedFrom: 'L002',
      fixedTo: 'L013'
    }
  });

  assert.equal(Object.hasOwn(normalized.details, 'settlementAccount'), false);
  assert.equal(Object.hasOwn(normalized.details, 'fixedSettlement'), false);
  assert.equal(Object.hasOwn(normalized.details, 'fromAccount'), false);
  assert.equal(Object.hasOwn(normalized.details, 'toAccount'), false);
  assert.equal(Object.hasOwn(normalized.details, 'fixedFrom'), false);
  assert.equal(Object.hasOwn(normalized.details, 'fixedTo'), false);

  const memberVoucher = banking.normalizeResourcePayload('vouchers', {
    details: { key: 'loan-paid-member', settlementAccount: 'L002', fromAccount: 'L001' }
  });
  assert.equal(memberVoucher.details.settlementAccount, 'L002');
  assert.equal(memberVoucher.details.fromAccount, 'L001');
});

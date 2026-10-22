// Archived legacy vouchers (legacy_historical_vouchers) list with their
// amount split, as the app's own vouchers do: a "Loan Paid to Member" shows
// its Regular Loan and LAD parts instead of 0 / 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const banking = require('../services/banking.service');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const id = crypto.randomUUID();
const transferId = crypto.randomUUID();
let db;

test.before(async () => {
  db = await initializeDatabase();
  await db.query(
    `INSERT INTO legacy_historical_vouchers ("id", "sourceDatabase", "sourceTable", "sourceKey", "voucherNo", "date", "voucherCategory", "amount", "payload", "createdAt", "updatedAt")
     VALUES ($1, 'JilaSahkariDB2627', 'EntTrans', $2, '99001', NOW(), '1', 30000, $3, NOW(), NOW())`,
    [id, `test-${id}`, JSON.stringify({ raw: { TransNo: 99001, TransType: 1, VoucherDate: '2026-07-31T00:00:00.000Z', RLoanAmt: 20000, DLoanAmt: 10000, TotalAmt: 30000, ParticularAccID: -1 } })]
  );
  // Legacy pays compulsory deposit back with a Transfer Voucher Paid (type 14).
  await db.query(
    `INSERT INTO legacy_historical_vouchers ("id", "sourceDatabase", "sourceTable", "sourceKey", "voucherNo", "date", "voucherCategory", "amount", "payload", "createdAt", "updatedAt")
     VALUES ($1, 'JilaSahkariDB2627', 'EntTrans', $2, '99002', NOW(), '14', 6000, $3, NOW(), NOW())`,
    [transferId, `test-${transferId}`, JSON.stringify({ raw: { TransNo: 99002, TransType: 14, VoucherDate: '2026-08-01T00:00:00.000Z', CDAmt: 5000, ShareAmt: 1000, TotalAmt: 6000, ParticularAccID: -1 } })]
  );
});

test.after(async () => {
  await db.query('DELETE FROM legacy_historical_vouchers WHERE id = ANY($1)', [[id, transferId]]);
  if (closeDatabase) await closeDatabase();
});

test('an archived loan payment lists its Regular Loan and LAD amounts', async () => {
  const rows = await banking.buildVoucherRows({ dateFrom: '2026-04-01', dateTo: '2027-03-31' });
  const row = rows.find((r) => r.id === `legacy:${id}`);
  assert.ok(row, 'the archived voucher is listed');
  assert.equal(row.details.components.loanAmt, 20000);
  assert.equal(row.details.components.lad, 10000);
});

test('a legacy CD refund (Transfer Voucher Paid with CD) also lists under CD Paid, without a second voucher', async () => {
  const rows = await banking.buildVoucherRows({ dateFrom: '2026-04-01', dateTo: '2027-03-31' });
  const own = (r) => String(r.id).startsWith(`legacy:${transferId}`);
  assert.equal(rows.filter(own).length, 1, 'one voucher in the full list (totals count it once)');

  const cd = banking.filterVouchersBySection(rows, 'member', 'deposit-paid-member').filter(own);
  assert.equal(cd.length, 1);
  assert.equal(cd[0].amount, 5000, 'the CD part, not the whole transfer');
  assert.equal(cd[0].details.key, 'deposit-paid-member');

  const transfer = banking.filterVouchersBySection(rows, 'transfer-voucher', 'transfer-voucher-paid').filter(own);
  assert.equal(transfer.length, 1);
  assert.equal(transfer[0].amount, 6000);
});

test('the CD Paid view opens its transfer voucher', async () => {
  const opened = await banking.getHistoricalVoucherById(`${transferId}:cd`);
  assert.equal(opened.id, `legacy:${transferId}`);
  assert.equal(opened.amount, 6000);
});

// The Member Ledger shows legacy interest settlement vouchers (TransType 20
// Interest Paid / 21 Interest Received) the way the old software prints
// them: on their own row, in the head's Intrst column, signed. A loan repaid
// with its interest received (legacy member 1373, voucher 116: Rs 317) closes
// with its interest settled, not still owing it.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'member-ledger-interest-test';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const banking = require('../services/banking.service');
const { Branch, Member } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const RUN = `I${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const ACC = 800000 + Math.floor(Math.random() * 90000);
const admin = { isSuperAdmin: true };
let db;
let member;

async function archived(category, raw) {
  await db.query(
    `INSERT INTO legacy_historical_vouchers ("id", "sourceDatabase", "sourceTable", "sourceKey", "voucherNo", "date", "voucherCategory", "amount", "payload", "createdAt", "updatedAt")
     VALUES ($1, 'JilaSahkariDB2627', 'EntTrans', $2, $3, NOW(), $4, $5, $6, NOW(), NOW())`,
    [crypto.randomUUID(), `${RUN}-${raw.TransNo}`, String(raw.TransNo), category, raw.TotalAmt, JSON.stringify({ raw })]
  );
}

test.before(async () => {
  db = await initializeDatabase();
  await Branch.create({ code: `${RUN}B`, label: 'INTEREST TEST' });
  member = await banking.createResource('members', { name: `Interest ${RUN}`, branchCode: `${RUN}B`, mobileNo: '9876500002', password: 'secret12' }, { actorUser: admin });
  const doc = await Member.findById(member.id);
  doc.payload = { ...(doc.payload || {}), raw: { AccID: ACC } };
  // The cutover snapshot: the loan is repaid.
  doc.balances = { share: 0, compulsoryDeposit: 0, specialDeposit: 0, loan: 0, loanAgainstDeposit: 0 };
  await doc.save();
  await archived('1', { TransNo: 99201, TransType: 1, VoucherType: 'P', VoucherDate: '2026-04-10T00:00:00.000Z', ParticularAccID: ACC, RLoanAmt: 55892, TotalAmt: 55892 });
  await archived('5', { TransNo: 99202, TransType: 5, VoucherType: 'R', VoucherDate: '2026-04-24T00:00:00.000Z', ParticularAccID: 0, RLoanAmt: 55892, TotalAmt: 55892 });
  await db.query(
    `INSERT INTO legacy_historical_recovery ("id", "sourceDatabase", "sourceTable", "sourceKey", "memberCode", "totalAmount", "payload", "createdAt", "updatedAt")
     VALUES ($1, 'JilaSahkariDB2627', 'EntTransData', $2, $3, 55892, $4, NOW(), NOW())`,
    [crypto.randomUUID(), `${RUN}-line`, member.code, JSON.stringify({ raw: { TransNo: '99202', AccID: ACC, RLoan: 55892, TotalAmount: 55892 } })]
  );
  // Interest Received From Member on the loan.
  await archived('21', { TransNo: 99203, TransType: 21, VoucherType: 'R', Paymode: 'Cash', VoucherDate: '2026-04-24T00:00:00.000Z', ParticularAccID: ACC, RLoanAmt: 317, TotalAmt: 317 });
});

test.after(async () => {
  await db.query('DELETE FROM legacy_historical_vouchers WHERE "sourceKey" LIKE $1', [`${RUN}-%`]);
  await db.query('DELETE FROM legacy_historical_recovery WHERE "sourceKey" LIKE $1', [`${RUN}-%`]);
  if (closeDatabase) await closeDatabase();
});

test('an interest received voucher shows on its own row and settles the interest', async () => {
  const report = await banking.buildMemberLedgerReport({ memberCode: member.code, dateFrom: '2026-04-01', dateTo: '2026-10-22', user: admin });
  const settled = report.rows.find((row) => row.voucherNo === '99203');
  assert.ok(settled, 'the interest voucher has its row');
  assert.equal(settled.loan.interest, -317, 'printed as (317) in the loan Intrst column');
  assert.equal(settled.loan.balance, 0, 'it does not move the loan itself');

  const accrued = report.rows.filter((row) => row !== settled).reduce((sum, row) => sum + row.loan.interest, 0);
  const total = report.rows.reduce((sum, row) => sum + row.loan.interest, 0);
  assert.ok(accrued > 0, 'the loan accrued interest while it ran');
  assert.equal(Math.round((total - (accrued - 317)) * 100), 0, 'the total is the accrual less what was received');
});

// Legacy (BankingSoft GetMemberLedger, ported in fyClosing/legacyInterest.js)
// works loan interest on the signed balance: an overpaid loan (in credit)
// earns the member interest back, printed negative. Legacy member 876 repaid
// the loan, then a recovery put Rs 8,000 more on it: Rs -43 for 22 days.
test('an overpaid loan (in credit) earns negative loan interest, as in legacy', async () => {
  const code = `${RUN}O`;
  const acc = ACC + 1;
  const m = await banking.createResource('members', { name: `Overpaid ${RUN}`, branchCode: `${RUN}B`, mobileNo: '9876500003', password: 'secret12' }, { actorUser: admin });
  const doc = await Member.findById(m.id);
  doc.payload = { ...(doc.payload || {}), raw: { AccID: acc } };
  doc.balances = { share: 0, compulsoryDeposit: 0, specialDeposit: 0, loan: 8000, loanAgainstDeposit: 0 };
  await doc.save();
  // Repaid in full on 29-May, then Rs 8,000 more recovered on 30-Sep.
  await archived('1', { TransNo: 99211, TransType: 1, VoucherType: 'P', VoucherDate: '2026-04-10T00:00:00.000Z', ParticularAccID: acc, RLoanAmt: 10000, TotalAmt: 10000 });
  for (const [no, date, amount] of [[99212, '2026-05-29', 10000], [99213, '2026-09-30', 8000]]) {
    await archived('5', { TransNo: no, TransType: 5, VoucherType: 'R', VoucherDate: `${date}T00:00:00.000Z`, ParticularAccID: 0, RLoanAmt: amount, TotalAmt: amount });
    await db.query(
      `INSERT INTO legacy_historical_recovery ("id", "sourceDatabase", "sourceTable", "sourceKey", "memberCode", "totalAmount", "payload", "createdAt", "updatedAt")
       VALUES ($1, 'JilaSahkariDB2627', 'EntTransData', $2, $3, $4, $5, NOW(), NOW())`,
      [crypto.randomUUID(), `${RUN}-line-${no}`, m.code, amount, JSON.stringify({ raw: { TransNo: String(no), AccID: acc, RLoan: amount, TotalAmount: amount } })]
    );
  }
  const report = await banking.buildMemberLedgerReport({ memberCode: m.code, dateFrom: '2026-04-01', dateTo: '2026-10-22', user: admin });
  const overpaid = report.rows.find((row) => row.voucherNo === '99213');
  assert.equal(overpaid.loan.balance, 8000, 'the loan is Rs 8,000 in credit');
  assert.ok(overpaid.loan.interest < 0, `interest on the credit is the member's (got ${overpaid.loan.interest})`);
  assert.ok(report.rows.find((row) => row.voucherNo === '99212').loan.interest > 0, 'the loan accrued while it was owed');
  assert.ok(code);
});

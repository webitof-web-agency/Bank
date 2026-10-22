// Archived legacy vouchers of an open FY can be edited and deleted. The
// cutover snapshot (members.balances, employees' loans, ledgers.openingBalance)
// is the balance after every archived voucher, and reports walk back from it,
// so a change moves the snapshot by exactly the voucher's change: balances
// before the voucher stay put, the closing one follows the edit. A closed FY
// (every legacy FY before 2026-27, or one closed in the app) stays read-only.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'archived-voucher-edit-test';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const banking = require('../services/banking.service');
const archived = require('../services/archivedVoucher.service');
const { Branch, Ledger, Member } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const RUN = `V${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const BRANCH = `${RUN}B`;
// Unique per run: earlier runs' members stay in the test database.
const MEMBER_ACC = 900000 + Math.floor(Math.random() * 90000);
const LEDGER_ACC = { 2: 990002, 5: 990005, 6: 990006, 8: 990008 }; // Cash, a bank, CD, Regular Loan
const meta = { actorUser: { isSuperAdmin: true }, actorUserId: null };
const ids = { loan: crypto.randomUUID(), recovery: crypto.randomUUID(), closed: crypto.randomUUID(), loan2: crypto.randomUUID(), chequeLoan: crypto.randomUUID(), chequeIssue: crypto.randomUUID(), transfer: crypto.randomUUID() };
const lineId = crypto.randomUUID();
const ledgerBackup = new Map();
let db;
let member;

async function insertArchived(id, db2, category, raw) {
  await db.query(
    `INSERT INTO legacy_historical_vouchers ("id", "sourceDatabase", "sourceTable", "sourceKey", "voucherNo", "date", "voucherCategory", "amount", "payload", "createdAt", "updatedAt")
     VALUES ($1, $2, 'EntTrans', $3, $4, NOW(), $5, $6, $7, NOW(), NOW())`,
    [id, db2, `${RUN}-${id}`, String(raw.TransNo), category, raw.TotalAmt, JSON.stringify({ raw })]
  );
}

async function memberBalances() {
  return (await db.query('SELECT balances FROM members WHERE code = $1', [member.code])).rows[0].balances;
}
// Ledger snapshot, signed credit-positive, rupees.
async function ledgerSigned(code) {
  const row = (await db.query('SELECT "openingBalance", "balanceSide" FROM ledgers WHERE code = $1 AND "deletedAt" IS NULL', [code])).rows[0];
  const amount = Number(row.openingBalance);
  return row.balanceSide === 'DR' ? -amount : amount;
}
async function rawOf(id) {
  return (await db.query('SELECT amount, payload FROM legacy_historical_vouchers WHERE id = $1', [id])).rows[0];
}
// A member's loan balance just before the given archived voucher, from the
// same timeline the reports use.
async function loanBefore(voucherNo) {
  const fresh = await Member.findOne({ code: member.code }).lean();
  const { rows } = (await banking.buildMemberBalanceTimelines([fresh])).get(member.code);
  const row = rows.find((r) => r.voucherNo === voucherNo);
  return row.loan.signed - (row.loan.credit - row.loan.debit);
}

test.before(async () => {
  db = await initializeDatabase();
  await Branch.create({ code: BRANCH, label: 'ARCHIVE EDIT TEST' });
  member = await banking.createResource('members', { name: `Archive ${RUN}`, branchCode: BRANCH, mobileNo: '9876500001', password: 'secret12' }, { actorUser: { isSuperAdmin: true } });
  const doc = await Member.findById(member.id);
  doc.payload = { ...(doc.payload || {}), raw: { AccID: MEMBER_ACC } };
  doc.balances = { share: 10000, compulsoryDeposit: 50000, specialDeposit: 0, loan: -100000, loanAgainstDeposit: 0 };
  await doc.save();
  for (const [code, accId] of Object.entries(LEDGER_ACC)) {
    // Other test files soft-delete these ledgers: use them anyway, and put
    // their deleted state back afterwards.
    const ledger = await Ledger.findOne({ code }).withDeleted();
    ledgerBackup.set(code, { payload: ledger.payload, openingBalance: ledger.openingBalance, balanceSide: ledger.balanceSide, deletedAt: ledger.deletedAt || null });
    ledger.payload = { ...(ledger.payload || {}), raw: { ...((ledger.payload || {}).raw || {}), AccID: accId } };
    ledger.openingBalance = 100000;
    ledger.balanceSide = code === '6' ? 'CR' : 'DR';
    ledger.deletedAt = null;
    await ledger.save();
  }
  await insertArchived(ids.loan, 'JilaSahkariDB2627', '1', { TransNo: 99101, TransType: 1, VoucherType: 'P', VoucherDate: '2026-07-31T00:00:00.000Z', ParticularAccID: MEMBER_ACC, PayModeAccID: LEDGER_ACC[2], Paymode: 'Cash', RLoanAmt: 20000, DLoanAmt: 0, TotalAmt: 20000, Narration: 'loan' });
  await insertArchived(ids.recovery, 'JilaSahkariDB2627', '5', { TransNo: 99102, TransType: 5, VoucherType: 'R', VoucherDate: '2026-08-31T00:00:00.000Z', ParticularAccID: 0, PayModeAccID: LEDGER_ACC[2], Paymode: 'Cash', ShareAmt: 0, CDAmt: 1000, SSAamt: 0, RLoanAmt: 0, DLoanAmt: 0, TotalAmt: 1000, Narration: 'recovery' });
  await db.query(
    `INSERT INTO legacy_historical_recovery ("id", "sourceDatabase", "sourceTable", "sourceKey", "memberCode", "totalAmount", "payload", "createdAt", "updatedAt")
     VALUES ($1, 'JilaSahkariDB2627', 'EntTransData', $2, $3, 1000, $4, NOW(), NOW())`,
    [lineId, `${RUN}-line`, member.code, JSON.stringify({ raw: { TransNo: '99102', AccID: MEMBER_ACC, MemberCode: member.code, Share: 0, CD: 1000, SSA: 0, RLoan: 0, DLoan: 0, TotalAmount: 1000 } })]
  );
  await insertArchived(ids.closed, 'JilaSahkariDB2526', '1', { TransNo: 99103, TransType: 1, VoucherType: 'P', VoucherDate: '2025-08-01T00:00:00.000Z', ParticularAccID: MEMBER_ACC, PayModeAccID: LEDGER_ACC[2], RLoanAmt: 5000, TotalAmt: 5000 });
  await insertArchived(ids.loan2, 'JilaSahkariDB2627', '1', { TransNo: 99104, TransType: 1, VoucherType: 'P', VoucherDate: '2026-09-15T00:00:00.000Z', ParticularAccID: MEMBER_ACC, PayModeAccID: LEDGER_ACC[2], RLoanAmt: 7000, TotalAmt: 7000 });
  // Paid by cheque: no pay-mode leg; its bank side is the Cheque Issue
  // voucher with the same cheque no. and amount (as legacy 793 / 794).
  await insertArchived(ids.chequeLoan, 'JilaSahkariDB2627', '1', { TransNo: 99105, TransType: 1, VoucherType: 'P', Paymode: 'Cheque', VoucherDate: '2026-09-20T00:00:00.000Z', ParticularAccID: MEMBER_ACC, PayModeAccID: 0, ChequeNo: `${RUN}C1`, RLoanAmt: 10000, TotalAmt: 10000 });
  await insertArchived(ids.chequeIssue, 'JilaSahkariDB2627', '9', { TransNo: 99106, TransType: 9, VoucherType: 'R', Paymode: 'Cheque', VoucherDate: '2026-09-20T00:00:00.000Z', ParticularAccID: LEDGER_ACC[5], LedgerAccID: LEDGER_ACC[5], PayModeAccID: 0, ChequeNo: `${RUN}C1`, TotalAmt: 10000 });
  // A transfer: no cheque, its other side can't be found.
  await insertArchived(ids.transfer, 'JilaSahkariDB2627', '15', { TransNo: 99107, TransType: 15, VoucherType: 'R', Paymode: 'Transfer', VoucherDate: '2026-09-25T00:00:00.000Z', ParticularAccID: MEMBER_ACC, PayModeAccID: 0, CDAmt: 3000, TotalAmt: 3000 });
});

test.after(async () => {
  await db.query('DELETE FROM legacy_historical_vouchers WHERE "sourceKey" LIKE $1', [`${RUN}-%`]);
  await db.query('DELETE FROM legacy_historical_recovery WHERE "sourceKey" LIKE $1', [`${RUN}-%`]);
  await db.query('DELETE FROM legacy_deleted_vouchers WHERE "sourceKey" LIKE $1', [`${RUN}-%`]);
  await db.query('DELETE FROM legacy_deleted_recovery_lines WHERE "sourceKey" LIKE $1', [`${RUN}-%`]);
  for (const [code, backup] of ledgerBackup) {
    const ledger = await Ledger.findOne({ code }).withDeleted();
    Object.assign(ledger, backup);
    await ledger.save();
  }
  if (closeDatabase) await closeDatabase();
});

test('the list marks archived vouchers of an open FY as changeable, closed ones not', async () => {
  const open = (await banking.buildVoucherRows({ dateFrom: '2026-04-01', dateTo: '2027-03-31' })).find((r) => r.id === `legacy:${ids.loan}`);
  const closed = (await banking.buildVoucherRows({ dateFrom: '2025-04-01', dateTo: '2026-03-31' })).find((r) => r.id === `legacy:${ids.closed}`);
  assert.equal(open.details.archiveEditable, true);
  assert.equal(closed.details.archiveEditable, false);
});

test('editing a loan payment moves the member and ledger snapshots by the change only', async () => {
  const before = { loan: (await memberBalances()).loan, cash: await ledgerSigned('2'), rl: await ledgerSigned('8') };
  const openingBefore = await loanBefore('99101');

  await archived.updateArchivedVoucher(`legacy:${ids.loan}`, { amounts: { RLoanAmt: 25000 }, narration: 'loan edited' }, meta);

  assert.equal((await memberBalances()).loan, before.loan - 5000, 'member owes 5,000 more');
  assert.equal(await ledgerSigned('8'), before.rl - 5000, 'Regular Loan ledger debited 5,000 more');
  assert.equal(await ledgerSigned('2'), before.cash + 5000, 'cash paid out 5,000 more');
  const row = await rawOf(ids.loan);
  assert.equal(Number(row.amount), 25000);
  assert.equal(row.payload.raw.RLoanAmt, 25000);
  assert.equal(row.payload.raw.TotalAmt, 25000);
  assert.equal(row.payload.raw.Narration, 'loan edited');
  assert.equal(await loanBefore('99101'), openingBefore, 'the balance before the voucher is unchanged');
});

test('editing a recovery line moves that member and recomputes the voucher totals', async () => {
  const before = { cd: (await memberBalances()).compulsoryDeposit, cdLedger: await ledgerSigned('6'), cash: await ledgerSigned('2') };
  await archived.updateArchivedVoucher(`legacy:${ids.recovery}`, { lines: [{ id: lineId, CD: 1500 }] }, meta);

  assert.equal((await memberBalances()).compulsoryDeposit, before.cd + 500);
  assert.equal(await ledgerSigned('6'), before.cdLedger + 500, 'CD ledger credited 500 more');
  assert.equal(await ledgerSigned('2'), before.cash - 500, 'cash received 500 more');
  const row = await rawOf(ids.recovery);
  assert.equal(row.payload.raw.CDAmt, 1500);
  assert.equal(row.payload.raw.TotalAmt, 1500);
  const line = (await db.query('SELECT "totalAmount", payload FROM legacy_historical_recovery WHERE id = $1', [lineId])).rows[0];
  assert.equal(line.payload.raw.CD, 1500);
  assert.equal(Number(line.totalAmount), 1500);
});

test('deleting takes the voucher\'s effect out of the snapshots and logs the original', async () => {
  const before = { loan: (await memberBalances()).loan, cash: await ledgerSigned('2'), rl: await ledgerSigned('8') };
  await archived.deleteArchivedVoucher(`legacy:${ids.loan}`, meta);

  assert.equal((await memberBalances()).loan, before.loan + 25000);
  assert.equal(await ledgerSigned('8'), before.rl + 25000);
  assert.equal(await ledgerSigned('2'), before.cash - 25000);
  assert.equal(await rawOf(ids.loan), undefined, 'gone from the archive');
  const logged = (await db.query('SELECT amount, payload FROM legacy_deleted_vouchers WHERE "sourceKey" = $1', [`${RUN}-${ids.loan}`])).rows[0];
  assert.ok(logged, 'kept in the deleted-voucher log');
  assert.equal(Number(logged.amount), 25000);
});

test('deleting a recovery voucher removes its lines and their effect', async () => {
  const before = (await memberBalances()).compulsoryDeposit;
  await archived.deleteArchivedVoucher(`legacy:${ids.recovery}`, meta);
  assert.equal((await memberBalances()).compulsoryDeposit, before - 1500);
  assert.equal((await db.query('SELECT 1 FROM legacy_historical_recovery WHERE id = $1', [lineId])).rowCount, 0);
});

test('a closed FY\'s voucher, or a date moved into one, is refused and nothing changes', async () => {
  const before = { balances: await memberBalances(), cash: await ledgerSigned('2') };
  await assert.rejects(archived.updateArchivedVoucher(`legacy:${ids.closed}`, { amounts: { RLoanAmt: 6000 } }, meta), (error) => error.statusCode === 409);
  await assert.rejects(archived.deleteArchivedVoucher(`legacy:${ids.closed}`, meta), (error) => error.statusCode === 409);
  await assert.rejects(archived.updateArchivedVoucher(`legacy:${ids.loan2}`, { voucherDate: '2026-03-31' }, meta), (error) => error.statusCode === 409);
  assert.deepEqual(await memberBalances(), before.balances);
  assert.equal(await ledgerSigned('2'), before.cash);
  assert.equal((await rawOf(ids.closed)).payload.raw.RLoanAmt, 5000);
});

// Sum of every ledger snapshot: 0 change = the Trial Balance still agrees.
async function ledgerNet() {
  let net = 0;
  for (const code of Object.keys(LEDGER_ACC)) net += await ledgerSigned(code);
  return Math.round(net * 100) / 100;
}

test('a cheque payment and its Cheque Issue change together, keeping the books balanced', async () => {
  const before = { loan: (await memberBalances()).loan, net: await ledgerNet() };
  const result = await archived.updateArchivedVoucher(`legacy:${ids.chequeLoan}`, { amounts: { RLoanAmt: 12000 }, voucherDate: '2026-09-21' }, meta);

  assert.equal((await memberBalances()).loan, before.loan - 2000);
  assert.equal(await ledgerNet(), before.net, 'Trial Balance unchanged');
  const issue = await rawOf(ids.chequeIssue);
  assert.equal(issue.payload.raw.TotalAmt, 12000, 'the Cheque Issue follows the amount');
  assert.equal(String(issue.payload.raw.VoucherDate).slice(0, 10), '2026-09-21', 'and the date');
  assert.equal(result.partner.voucherNo, '99106');
});

test('deleting a cheque payment deletes its Cheque Issue too', async () => {
  const before = { loan: (await memberBalances()).loan, net: await ledgerNet() };
  await archived.deleteArchivedVoucher(`legacy:${ids.chequeLoan}`, meta);
  assert.equal((await memberBalances()).loan, before.loan + 12000);
  assert.equal(await ledgerNet(), before.net);
  assert.equal(await rawOf(ids.chequeIssue), undefined);
});

test('a voucher whose other side can\'t be found asks before putting the books out', async () => {
  const before = { cd: (await memberBalances()).compulsoryDeposit, net: await ledgerNet() };
  await assert.rejects(
    archived.updateArchivedVoucher(`legacy:${ids.transfer}`, { amounts: { CDAmt: 3500 } }, meta),
    (error) => error.statusCode === 409 && error.code === 'TB_IMBALANCE' && /500/.test(error.message)
  );
  assert.equal((await memberBalances()).compulsoryDeposit, before.cd, 'nothing changed');
  // Dates and narration never put the books out.
  await archived.updateArchivedVoucher(`legacy:${ids.transfer}`, { narration: 'moved', voucherDate: '2026-09-26' }, meta);

  await archived.updateArchivedVoucher(`legacy:${ids.transfer}`, { amounts: { CDAmt: 3500 }, acceptImbalance: true }, meta);
  assert.equal((await memberBalances()).compulsoryDeposit, before.cd + 500);
  assert.equal(Math.abs((await ledgerNet()) - before.net), 500, 'out by exactly the change');
});

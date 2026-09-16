const assert = require('node:assert/strict');
const test = require('node:test');
const { initializeDatabase, restoreMainRow } = require('../config/postgres');
const { Employee, Ledger, JournalLine } = require('../models/banking.models');
const User = require('../models/user.model');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const {
  createResource,
  updateResource,
  deleteResource,
  restoreResource,
  getLookups,
  createVoucher
} = require('../services/banking.service');

// A soft-deleted row's unique fields stay permanently reserved by design, so
// every run needs fresh identifiers rather than fixed ones.
const RUN_ID = Date.now();

test('Employee/User split: create/update/delete/restore via RESOURCE_DEFS.employees', async (t) => {
  await initializeDatabase();

  let created;
  const username = `split.test.${RUN_ID}`;

  await t.test('create makes both a User (login) and a linked Employee (HR) row', async () => {
    created = await createResource('employees', {
      fullName: 'Split Test Employee',
      username,
      email: `${username}@bank.local`,
      password: 'Split@12345',
      designation: 'Clerk',
      branchCode: 'HO',
      payload: {
        fatherName: 'Test Father',
        category: 'General',
        basicSalary: 25000
      }
    }, { actorUser: { id: 'split-test-actor' } });

    assert.ok(created, 'createResource must return a record');
    assert.ok(created.employeeCode, 'response must carry the linked employeeCode');

    const userRow = await User.findById(created.id).lean();
    assert.ok(userRow, 'a User row must exist');
    assert.strictEqual(userRow.employeeCode, created.employeeCode);

    const employeeRow = await Employee.findOne({ code: created.employeeCode }).lean();
    assert.ok(employeeRow, 'a linked Employee row must exist');
    assert.strictEqual(employeeRow.fatherName, 'Test Father');
    assert.strictEqual(Number(employeeRow.basicSalary), 25000);
  });

  await t.test('response merges HR fields at the top level for the frontend', async () => {
    assert.strictEqual(created.fatherName, 'Test Father');
    assert.strictEqual(created.category, 'General');
  });

  await t.test('update lands HR fields on Employee, login fields on User', async () => {
    const updated = await updateResource('employees', created.id, {
      designation: 'Senior Clerk',
      payload: { category: 'OBC', basicSalary: 30000 }
    }, { actorUser: { id: 'split-test-actor' } });

    assert.ok(updated);
    assert.strictEqual(updated.designation, 'Senior Clerk');
    assert.strictEqual(updated.category, 'OBC');

    const userRow = await User.findById(created.id).lean();
    assert.strictEqual(userRow.designation, 'Senior Clerk');

    const employeeRow = await Employee.findOne({ code: created.employeeCode }).lean();
    assert.strictEqual(employeeRow.category, 'OBC');
    assert.strictEqual(Number(employeeRow.basicSalary), 30000);
  });

  await t.test('delete soft-deletes both the User and its linked Employee', async () => {
    const ok = await deleteResource('employees', created.id, { actorUser: { id: 'split-test-actor' } });
    assert.strictEqual(ok, true);

    assert.strictEqual(await User.findById(created.id).lean(), null);
    assert.strictEqual(await Employee.findOne({ code: created.employeeCode }).lean(), null);

    const userWithDeleted = await User.findById(created.id).withDeleted().lean();
    assert.ok(userWithDeleted?.deletedAt);
    const employeeWithDeleted = await Employee.findOne({ code: created.employeeCode }).withDeleted().lean();
    assert.ok(employeeWithDeleted?.deletedAt);
  });

  await t.test('restore brings both back together', async () => {
    const ok = await restoreResource('employees', created.id, { actorUser: { id: 'split-test-actor' } });
    assert.strictEqual(ok, true);

    const userRow = await User.findById(created.id).lean();
    assert.ok(userRow, 'User row must reappear');
    assert.strictEqual(userRow.deletedAt, null);

    const employeeRow = await Employee.findOne({ code: created.employeeCode }).lean();
    assert.ok(employeeRow, 'linked Employee row must reappear too');
    assert.strictEqual(employeeRow.deletedAt, null);
  });

  await t.test('cleanup', async () => {
    await deleteResource('employees', created.id, { actorUser: { id: 'split-test-actor' } });
  });
});

test('Employee/User split: lookups and voucher posting resolve real Employee codes', async (t) => {
  await initializeDatabase();

  const username = `split.lookup.${RUN_ID}`;
  const employee = await createResource('employees', {
    fullName: 'Lookup Test Employee',
    username,
    email: `${username}@bank.local`,
    password: 'Split@12345',
    branchCode: 'HO'
  }, { actorUser: { id: 'split-test-actor' } });

  await t.test('getLookups().employees returns the real Employee code, not the login id', async () => {
    const lookups = await getLookups({});
    const match = lookups.employees.find((row) => row.code === employee.employeeCode);
    assert.ok(match, 'the newly created employee must appear in getLookups().employees by its real employees.code');
  });

  await t.test('an advance-paid-emp voucher posts a journal_lines.employeeId that resolves back to the real Employee', async () => {
    // A ledger role can already exist but soft-deleted (another test's
    // rollback/cleanup ran first, in this shared DB) — reuse-if-found must
    // restore it, or resolveLedgerId (which only sees non-deleted rows)
    // fails with "Missing ledger mapping" even though a row "exists".
    const ensureLedgerRole = async (role, fallbackData) => {
      const existing = await Ledger.findOne({ semanticRole: role }).withDeleted().lean();
      if (existing) {
        if (existing.deletedAt) await restoreMainRow('ledgers', existing.id);
        return existing;
      }
      return Ledger.create(fallbackData);
    };
    await ensureLedgerRole(ACCOUNTING_ROLES.CASH, { code: `SPLIT-CASH-${RUN_ID}`, name: 'Cash', semanticRole: ACCOUNTING_ROLES.CASH, openingBalance: 10000, balanceSide: 'DR' });
    await ensureLedgerRole(ACCOUNTING_ROLES.EMPLOYEE_HOUSING_LOAN, { code: `SPLIT-EHL-${RUN_ID}`, name: 'Employee Housing Loan', semanticRole: ACCOUNTING_ROLES.EMPLOYEE_HOUSING_LOAN, openingBalance: 0, balanceSide: 'DR' });

    const voucher = await createVoucher({
      voucherNo: `SPLIT-V-${RUN_ID}`,
      date: '2026-09-08',
      amount: 5000,
      partyType: 'EMPLOYEE',
      partyCode: employee.employeeCode,
      branchCode: 'HO',
      details: { key: 'advance-paid-emp', components: { house: 5000 } }
    }, {});

    const lines = await JournalLine.find({ voucherId: voucher.id }).lean();
    const employeeLine = lines.find((line) => line.employeeId);
    assert.ok(employeeLine, 'a journal line carrying employeeId must exist');
    assert.strictEqual(employeeLine.employeeId, employee.employeeCode);

    const employeeRow = await Employee.findOne({ code: employeeLine.employeeId }).lean();
    assert.ok(employeeRow, 'the posted employeeId must resolve back to a real Employee row');
  });

  await t.test('cleanup', async () => {
    await deleteResource('employees', employee.id, { actorUser: { id: 'split-test-actor' } });
  });
});

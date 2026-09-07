const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeDatabase, closeDatabase } = require('../config/postgres');
const { Member, Employee, NoInterestMember } = require('../models/banking.models');
const {
  buildAccountStatementReport,
  buildMemberLedgerReport,
  buildEmployeeLedgerReport,
  listResource
} = require('../services/banking.service');

test('Phase 4: Legacy-Aligned Interest System', async (t) => {
  await t.test('setup', async () => {
    await initializeDatabase();
    await Member.deleteMany({});
    await Employee.deleteMany({});
    await NoInterestMember.deleteMany({});
  });

  await t.test('Member stored interest is returned unchanged', async () => {
    const member = await Member.create({
      code: 'M-INT-01',
      name: 'Interest Member',
      branchCode: 'HO',
      balances: {
        share: 1000,
        cdInterest: 150.50,
        ssaInterest: 200.75,
        regularLoanInterest: 50.00,
        ladInterest: 25.25
      }
    });

    const report = await buildMemberLedgerReport({ memberCode: 'M-INT-01' });
    assert.ok(report);
    assert.equal(report.balances.cdInterest, 150.50);
    assert.equal(report.balances.ssaInterest, 200.75);
    assert.equal(report.balances.regularLoanInterest, 50.00);
    assert.equal(report.balances.ladInterest, 25.25);

    const statement = await buildAccountStatementReport({ type: 'member', memberId: 'M-INT-01' });
    const getStmtClosing = (head) => statement.statement.find(s => s.head === head)?.closing;
    const getStmtInterest = (head) => statement.statement.find(s => s.head === head)?.interest;
    
    assert.equal(getStmtInterest('Compulsory Deposit'), 150.50);
    assert.equal(getStmtInterest('Special Deposit'), 200.75);
    assert.equal(getStmtInterest('Regular Loan'), 50.00);
    assert.equal(getStmtInterest('Loan Against Deposit'), 25.25);
  });

  await t.test('Employee stored interest is returned unchanged', async () => {
    const employee = await Employee.create({
      code: 'E-INT-01',
      name: 'Interest Employee',
      branchCode: 'HO',
      homeLoanBalance: 500000,
      homeLoanInterest: 12500.50,
      vehicleLoanBalance: 100000,
      vehicleLoanInterest: 3400.00
    });

    const report = await buildEmployeeLedgerReport({ employeeCode: 'E-INT-01' });
    assert.ok(report);
    assert.equal(report.balances.housingLoanInterest, 12500.50);
    assert.equal(report.balances.vehicleLoanInterest, 3400.00);

    const statement = await buildAccountStatementReport({ type: 'employee', employeeId: 'E-INT-01' });
    const getStmtClosing = (head) => statement.statement.find(s => s.head === head)?.closing;
    const getStmtInterest = (head) => statement.statement.find(s => s.head === head)?.interest;
    
    assert.equal(getStmtInterest('Housing Loan'), 12500.50);
    assert.equal(getStmtInterest('Vehicle Loan'), 3400.00);
  });

  await t.test('No Interest Member is identifiable in system', async () => {
    await NoInterestMember.create({
      code: 'NIM-01',
      memberCode: 'M-INT-01',
      branchCode: 'HO',
      fromDate: '2025-01-01',
      toDate: '2025-12-31',
      status: 'Active',
      reason: 'Special request',
      narration: 'Legacy narration',
      setOnDate: '2025-01-01'
    });

    const result = await listResource('noInterestMembers', 'M-INT-01');
    assert.equal(result.length, 1);
    assert.equal(result[0].memberCode, 'M-INT-01');
    assert.equal(result[0].status, 'Active');
  });

  await t.test('Changing Rate List does NOT recalculate stored interest', async () => {
    // Current Rate List isn't actively queried for stored interest, but we ensure
    // that calling the service report doesn't accidentally mutate the stored amount.
    const { updateGlobalRatesConfig } = require('../services/banking.service');
    
    // Mutate the rate
    await updateGlobalRatesConfig({
      interestRates: { receive: { loan: 99 } }
    });

    const report = await buildMemberLedgerReport({ memberCode: 'M-INT-01' });
    assert.equal(report.balances.regularLoanInterest, 50.00); // Unchanged from 50.00
  });

  await t.test('teardown', async () => {
    await closeDatabase();
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeDatabase } = require('../config/postgres');
const {
  Member,
  Employee,
  Voucher,
  JournalLine,
  Ledger,
  DemandList,
  DemandLine,
  RecoveryLine
} = require('../models/banking.models');
const {
  buildMemberLedgerReport,
  buildEmployeeLedgerReport,
  buildAccountStatementReport,
  buildDemandListReport
} = require('../services/banking.service');

test('Phase 3 Batch 3 Reports Engine', async (t) => {
  await initializeDatabase();
  
  // Clear DB
  await Member.deleteMany({});
  await Employee.deleteMany({});
  await Voucher.deleteMany({});
  await JournalLine.deleteMany({});
  await Ledger.deleteMany({});
  await DemandList.deleteMany({});
  await DemandLine.deleteMany({});
  await RecoveryLine.deleteMany({});

  // Setup Member
  await Member.create({
    code: 'M001',
    name: 'Test Member',
    depositBalance: 1000, loanOutstanding: 10000, balances: JSON.stringify({ compulsoryDeposit: 1000, loanOutstanding: 10000 })
  });

  // Member Vouchers
  await Voucher.create({
    voucherNo: 'V-M001',
    date: '2023-01-01',
    partyCode: 'M001',
    partyType: 'Member',
    transactionType: 'Payment',
    amount: 1500,
    details: {
      key: 'loan-paid-member',
      components: {
        loanAmt: 1000,
        cd: 500
      }
    }
  });

  // Recovery Voucher with Relational RecoveryLines
  const vRec = await Voucher.create({
    voucherNo: 'V-REC',
    date: '2023-01-02',
    amount: 500,
    details: {
      key: 'recovery'
      // recoveryLines array removed from payload to ensure it uses relational source
    }
  });

  await RecoveryLine.create({
    voucherNo: 'V-REC',
    voucherId: String(vRec._id || vRec.id),
    memberCode: 'M001',
    compulsoryDeposit: 100,
    regularLoan: 400
  });

  await RecoveryLine.create({
    voucherNo: 'V-REC',
    voucherId: String(vRec._id || vRec.id),
    memberCode: 'M002', // Another member to verify isolation
    compulsoryDeposit: 50,
    regularLoan: 150
  });

  // Setup Employee
  await Employee.create({
    code: 'E001',
    name: 'Test Employee',
    homeLoanBalance: 10000,
    vehicleLoanBalance: 5000,
    grainAdvanceBalance: 2000
  });

  // Employee Vouchers
  await Voucher.create({
    voucherNo: 'V-E001',
    date: '2023-01-01',
    partyCode: 'E001',
    partyType: 'Employee',
    details: {
      key: 'advance-paid-emp',
      components: {
        house: 1000,
        vehicle: 0,
        grain: 0
      }
    }
  });
  await Voucher.create({
    voucherNo: 'V-E002',
    date: '2023-01-02',
    partyCode: 'E001',
    partyType: 'Employee',
    details: {
      key: 'advance-recovery-emp',
      components: {
        house: 500,
        vehicle: 200,
        grain: 100
      }
    }
  });

  // Setup Demand
  const list = await DemandList.create({
    demandListNo: 'D-JAN-2023',
    branchCode: 'BR1',
    month: 'JAN',
    year: '2023',
    date: '2023-01-01',
    status: 'Pending'
  });
  
  await DemandLine.create({
    demandListNo: 'D-JAN-2023',
    memberCode: 'M001',
    compulsoryDeposit: 100,
    regularLoan: 500,
    totalAmount: 600
  });

  await t.test('Member Ledger Report', async () => {
    const report = await buildMemberLedgerReport({ memberCode: 'M001' });
    console.log("MEMBER REPORT BALANCES:", report.balances); assert(report, 'Report should be generated');
    
    // INTENTIONAL MODERNIZATION: 
    // Legacy system stored negative components for advances and positive for recoveries.
    // We intentionally display them as absolute positive outstanding balances.
    // Disbursement increases balance (DR), Recovery decreases balance (CR).
    assert.strictEqual(report.balances.compulsoryDeposit, 1100, 'CD Balance should be 1000 (opening) + 100 (recovery CR)');
    assert.strictEqual(report.balances.loanOutstanding, 10600, 'Loan Balance should be 10000 (opening) + 1000 (disbursement DR) - 400 (recovery CR)');
  });

  await t.test('Employee Ledger Report', async () => {
    const report = await buildEmployeeLedgerReport({ employeeCode: 'E001' });
    console.log("MEMBER REPORT BALANCES:", report.balances); assert(report, 'Report should be generated');
    
    // INTENTIONAL MODERNIZATION:
    // Advance Paid = DR, Advance Recovery = CR.
    assert.strictEqual(report.balances.housingLoan, 10500, 'Housing Loan: 10000 + 1000 (DR) - 500 (CR)');
    assert.strictEqual(report.balances.vehicleLoan, 4800, 'Vehicle Loan: 5000 - 200 (CR)');
    assert.strictEqual(report.balances.grainAdvance, 1900, 'Grain Advance: 2000 - 100 (CR)');
  });

  await t.test('Account Statement - Member', async () => {
    const report = await buildAccountStatementReport({ type: 'member', memberId: 'M001' });
    assert(report.statement, 'Statement should exist');
    const cd = report.statement.find(s => s.head === 'Compulsory Deposit');
    assert.strictEqual(cd.opening, 1000);
    assert.strictEqual(cd.credit, 100);
    assert.strictEqual(cd.debit, 0);
    assert.strictEqual(cd.closing, 1100);
  });

  await t.test('Account Statement - Employee', async () => {
    const report = await buildAccountStatementReport({ type: 'employee', employeeId: 'E001' });
    assert(report.statement, 'Statement should exist');
    const house = report.statement.find(s => s.head === 'Housing Loan');
    assert.strictEqual(house.opening, 10000);
    assert.strictEqual(house.debit, 1000);
    assert.strictEqual(house.credit, 500);
    assert.strictEqual(house.closing, 10500);
  });

  await t.test('Demand List Report', async () => {
    const report = await buildDemandListReport({ month: 'JAN' });
    assert.strictEqual(report.length, 1);
    assert.strictEqual(report[0].cd, 100);
    assert.strictEqual(report[0].regularLoan, 500);
    assert.strictEqual(report[0].total, 600);
  });
});

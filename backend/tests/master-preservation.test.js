const { describe, it } = require('node:test');
const assert = require('node:assert');
const { 
  Employee, 
  Member, 
  Ledger, 
  Society, 
  FinancialYear 
} = require('../models/banking.models');

describe('Phase 6A: Master Data Preservation', async () => {

  it('preserves Employee missing fields', async () => {
    const code = `EMP-TEST-${Date.now()}`;
    const employee = await Employee.create({
      code,
      name: 'Test Employee',
      fatherName: 'Test Father',
      dateOfBirth: '1990-01-01',
      appointmentDate: '2020-01-01',
      address: '123 Test St',
      category: 'General',
      caste: 'Testing',
      qualification: 'BTech',
      mobileNo: '9999999999',
      basicSalary: 50000.00
    });

    assert.strictEqual(employee.fatherName, 'Test Father');
    assert.strictEqual(employee.category, 'General');
    assert.strictEqual(Number(employee.basicSalary), 50000);

    const fetched = await Employee.findOne({ code });
    assert.strictEqual(fetched.fatherName, 'Test Father');
    assert.strictEqual(fetched.caste, 'Testing');
    
    await Employee.deleteMany({ code });
  });

  it('preserves Member distinct openingDate', async () => {
    const code = `MEM-TEST-${Date.now()}`;
    const member = await Member.create({
      code,
      name: 'Test Member',
      membershipDate: '2023-01-01',
      openingDate: '2022-01-01',
      appointmentDate: '2020-01-01'
    });

    assert.strictEqual(member.membershipDate.split('T')[0], '2023-01-01');
    assert.strictEqual(member.openingDate.split('T')[0], '2022-01-01');
    assert.strictEqual(member.appointmentDate.split('T')[0], '2020-01-01');

    const fetched = await Member.findOne({ code });
    assert.strictEqual(fetched.membershipDate.split('T')[0], '2023-01-01');
    assert.strictEqual(fetched.openingDate.split('T')[0], '2022-01-01');

    await Member.deleteMany({ code });
  });

  it('preserves Ledger sortOrder', async () => {
    const code = `L-TEST-${Date.now()}`;
    const ledger = await Ledger.create({
      code,
      name: 'Test Ledger',
      semanticRole: 'test_role',
      sortOrder: 15
    });

    assert.strictEqual(ledger.sortOrder, 15);
    
    const fetched = await Ledger.findOne({ code });
    assert.strictEqual(fetched.sortOrder, 15);

    await Ledger.deleteMany({ code });
  });

  it('preserves Society regNo vs gstNo', async () => {
    const key = `SOC-TEST-${Date.now()}`;
    const society = await Society.create({
      key,
      name: 'Test Society',
      regNo: 'REG-123',
      gstNo: 'GST-123'
    });

    assert.strictEqual(society.regNo, 'REG-123');
    assert.strictEqual(society.gstNo, 'GST-123');

    const fetched = await Society.findOne({ key });
    assert.strictEqual(fetched.regNo, 'REG-123');
    assert.strictEqual(fetched.gstNo, 'GST-123');

    await Society.deleteMany({ key });
  });

  it('preserves FinancialYear code and isActive only', async () => {
    const code = `FY-TEST-${Date.now()}`;
    const fy = await FinancialYear.create({
      code,
      isActive: true
    });

    assert.strictEqual(fy.code, code);
    assert.strictEqual(fy.isActive, true);
    assert.strictEqual(fy.startDate, undefined);
    assert.strictEqual(fy.endDate, undefined);

    const fetched = await FinancialYear.findOne({ code });
    assert.strictEqual(fetched.code, code);
    assert.strictEqual(fetched.isActive, true);

    await FinancialYear.deleteMany({ code });
  });

});

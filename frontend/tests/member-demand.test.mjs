// Member form, Monthly Demand Data: separate from the balances, no Share,
// total derived in paise, amounts >= 0 with at most 2 decimals.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMBER_DEMAND_FIELDS, buildDemandDefaultsPayload, demandAmountError, demandDefaultsErrors, demandDefaultsFromRecord, demandDefaultsTotal, emptyDemandDefaults
} from '../src/pages/master/members/memberDemand.js';

test('the monthly demand heads are CD, SSA, Regular Loan, LAD, Insurance, Other — no Share', () => {
  assert.deepEqual(MEMBER_DEMAND_FIELDS.map(([key]) => key), ['compulsoryDeposit', 'specialDeposit', 'regularLoan', 'loanAgainstDeposit', 'insurancePremium', 'other']);
  assert.equal(Object.hasOwn(emptyDemandDefaults(), 'share'), false);
});

test('the total is the sum of the components, in paise', () => {
  assert.equal(demandDefaultsTotal({ compulsoryDeposit: '2000', specialDeposit: 0.1, regularLoan: 8000, other: 0.2 }), 10000.3);
  assert.equal(demandDefaultsTotal({ share: 5000 }), 0);
  assert.equal(demandDefaultsTotal({}), 0);
});

test('loads from the record\'s demandDefaults only, never from its balances', () => {
  const record = { loanOutstanding: 202499, balances: { compulsoryDeposit: 370812.8 }, demandDefaults: { regularLoan: 8000, compulsoryDeposit: 2000, total: 10000 } };
  const values = demandDefaultsFromRecord(record);
  assert.equal(values.regularLoan, 8000);
  assert.equal(values.compulsoryDeposit, 2000);
  assert.equal(values.specialDeposit, '');
  assert.equal(Object.hasOwn(values, 'total'), false);
  assert.deepEqual(demandDefaultsFromRecord({ loanOutstanding: 202499 }), emptyDemandDefaults());
});

test('payload: numbers, blank = 0, no total and no share', () => {
  const payload = buildDemandDefaultsPayload({ compulsoryDeposit: '2000', regularLoan: '', other: '12.5', share: 100 });
  assert.deepEqual(payload, { compulsoryDeposit: 2000, specialDeposit: 0, regularLoan: 0, loanAgainstDeposit: 0, insurancePremium: 0, other: 12.5 });
});

test('validation: >= 0, at most 2 decimals, components may be zero', () => {
  assert.equal(demandAmountError(''), '');
  assert.equal(demandAmountError('0'), '');
  assert.equal(demandAmountError('12.34'), '');
  assert.notEqual(demandAmountError('-1'), '');
  assert.notEqual(demandAmountError('1.234'), '');
  assert.deepEqual(demandDefaultsErrors({ regularLoan: '-5', other: '1.001', compulsoryDeposit: '10' }), ['Regular Loan', 'Other']);
  assert.deepEqual(demandDefaultsErrors(emptyDemandDefaults()), []);
});

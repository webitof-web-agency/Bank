// Demand Entry grid: totals derived from the heads (no Share, no editable
// total), Load Members keeps existing lines, recovered lines are locked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMAND_HEADS, buildDemandEntryPayload, demandLineTotal, demandTotals, emptyDemandDraft, mergeLoadedMembers, removeDemandLine, updateDemandLine
} from '../src/pages/transactions/other/demand-entry/demandEntryDraft.js';

test('the demand heads are CD, SSA, Regular Loan, LAD, Insurance, Other — no Share', () => {
  assert.deepEqual(DEMAND_HEADS.map(([key]) => key), ['compulsoryDeposit', 'specialDeposit', 'regularLoan', 'loanAgainstDeposit', 'insurancePremium', 'other']);
});

test('line and list totals are derived in paise', () => {
  const lines = [
    { memberCode: '1', compulsoryDeposit: 1000.1, specialDeposit: 0.2, other: 50 },
    { memberCode: '2', regularLoan: 2000, insurancePremium: 100 }
  ];
  assert.equal(demandLineTotal(lines[0]), 1050.3);
  assert.equal(demandTotals(lines).total, 3150.3);
  assert.equal(demandTotals(lines).heads.regularLoan, 2000);
});

test('Load Members adds only missing members with their usual demand', () => {
  const existing = [{ memberCode: '1', compulsoryDeposit: 500, recoveryStatus: 'RECOVERED' }];
  const { lines, added } = mergeLoadedMembers(existing, [
    { memberCode: '1', compulsoryDeposit: 2000 },
    { memberCode: '2', compulsoryDeposit: 2000, regularLoan: 10000 }
  ]);
  assert.equal(added, 1);
  assert.equal(lines[0].compulsoryDeposit, 500);
  assert.equal(demandLineTotal(lines[1]), 12000);
  assert.equal(lines[1].recoveryStatus, 'PENDING');
});

test('recovered lines cannot be edited or removed in the grid', () => {
  const lines = [{ memberCode: '1', compulsoryDeposit: 500, recoveryStatus: 'RECOVERED' }, { memberCode: '2', compulsoryDeposit: 100 }];
  assert.equal(updateDemandLine(lines, 0, 'compulsoryDeposit', 9)[0].compulsoryDeposit, 500);
  assert.equal(updateDemandLine(lines, 1, 'compulsoryDeposit', 9)[1].compulsoryDeposit, 9);
  assert.equal(removeDemandLine(lines, 0).length, 2);
  assert.equal(removeDemandLine(lines, 1).length, 1);
});

test('the payload sends heads only — never a total or Share', () => {
  const fy = { label: '2026-27', start: '2026-04-01', end: '2027-03-31' };
  const draft = { ...emptyDemandDraft(fy, [{ demandListNo: '2557' }]), branchCode: '1', lines: [{ memberCode: '1', compulsoryDeposit: '1000', totalAmount: 5, share: 9 }] };
  assert.equal(draft.demandListNo, '2558');
  const payload = buildDemandEntryPayload(draft, fy);
  assert.equal(payload.fyCode, '2026-27');
  assert.deepEqual(Object.keys(payload.lines[0]).sort(), ['compulsoryDeposit', 'insurancePremium', 'loanAgainstDeposit', 'memberCode', 'other', 'regularLoan', 'specialDeposit']);
  assert.equal(payload.lines[0].compulsoryDeposit, 1000);
});

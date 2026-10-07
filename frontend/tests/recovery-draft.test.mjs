// The Recovery From Member draft: Demand / Excel / Manual rows feed one
// editable grid; editing, removing and totals never touch the demand rows
// and never call the server (that happens only on Save).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDemandLines, addImportRows, draftTotals, lineTotal, manualLine, removeLine, updateLineHeads
} from '../src/pages/transactions/member/recoveryDraft.js';

const demand = {
  demandLineId: 'D101', demandListNo: '2554', memberCode: '1473', memberName: 'A', branchName: 'HO', designation: 'CLERK',
  compulsoryDeposit: 1000, specialDeposit: 500, regularLoan: 2000, loanAgainstDeposit: 0, insurancePremium: 0, other: 0, totalAmount: 3500
};

test('3-4: a demand line is copied into the draft with its exact id and amounts', () => {
  const { lines, added } = addDemandLines([], [demand]);
  assert.equal(added, 1);
  assert.equal(lines[0].source, 'DEMAND');
  assert.equal(lines[0].demandLineId, 'D101');
  assert.deepEqual([lines[0].heads.cd, lines[0].heads.ssa, lines[0].heads.loan], [1000, 500, 2000]);
  assert.equal(lineTotal(lines[0]), 3500);
});

test('the same demand line is not added twice; "Other" is flagged, not moved', () => {
  const first = addDemandLines([], [demand]).lines;
  const again = addDemandLines(first, [demand, { ...demand, demandLineId: 'D102', other: 250 }]);
  assert.equal(again.added, 1);
  assert.equal(again.skipped, 1);
  assert.equal(again.lines[1].needsReview, true);
  assert.equal(lineTotal(again.lines[1]), 3500);
});

test('5-10: editing a draft row changes only the draft; the demand row and the totals follow', () => {
  const demandCopy = structuredClone(demand);
  const lines = addDemandLines([], [demandCopy]).lines;
  const edited = updateLineHeads(lines, 0, { loan: 1500 });
  assert.equal(lineTotal(edited[0]), 3000);
  assert.equal(edited[0].demandLineId, 'D101');
  assert.equal(draftTotals(edited).total, 3000);
  assert.equal(draftTotals(edited).heads.loan, 1500);
  // The demand row is untouched.
  assert.deepEqual(demandCopy, demand);
  assert.equal(lineTotal(lines[0]), 3500);
});

test('11: removing a draft row recalculates totals', () => {
  const lines = addDemandLines([], [demand, { ...demand, demandLineId: 'D102', memberCode: '1474' }]).lines;
  const left = removeLine(lines, 0);
  assert.equal(left.length, 1);
  assert.equal(left[0].demandLineId, 'D102');
  assert.equal(draftTotals(left).total, 3500);
});

test('12, 14: a manual row adds to the totals and carries no demand link', () => {
  const lines = addDemandLines([], [demand]).lines;
  const withManual = [...lines, manualLine({ code: '1473', name: 'A' }, { cd: 1000 })];
  assert.equal(withManual[1].source, 'MANUAL');
  assert.equal(withManual[1].demandLineId, null);
  assert.equal(draftTotals(withManual).total, 4500);
});

test('13, 15: Excel rows join the same draft; unmatched rows are reported, short/extra flagged', () => {
  const members = [{ id: 'm1', code: '1473', name: 'A' }, { id: 'm2', code: '1474', name: 'B' }];
  const rows = [
    { id: 'r1', memberId: 'm1', status: 'VALID', importedTotalAmount: 1500, allocatedCompulsoryDeposit: 1000, allocatedRegularLoan: 500 },
    { id: 'r2', memberId: 'm2', status: 'SHORT', importedTotalAmount: 800, errorMessage: 'Demand Total > Imported Total', allocatedCompulsoryDeposit: 800 },
    { id: 'r3', memberId: null, status: 'MEMBER NOT FOUND', pfNo: '999', sourceRowNo: 4, errorMessage: 'No member found with PF No: 999' }
  ];
  const result = addImportRows([], rows, members, 'B1');
  assert.equal(result.added, 2);
  assert.equal(result.flagged, 1);
  assert.equal(result.rejected.length, 1);
  assert.ok(result.lines.every((line) => line.source === 'EXCEL' && !line.demandLineId));
  assert.equal(draftTotals(result.lines).total, 2300);
});

test('totals are exact in paise', () => {
  const lines = [manualLine({ code: '1' }, { cd: 0.1 }), manualLine({ code: '2' }, { cd: 0.2 })];
  assert.equal(draftTotals(lines).total, 0.3);
});

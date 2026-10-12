// The Recovery From Member draft: Demand / Excel / Manual rows feed one
// editable grid; editing, removing and totals never touch the demand rows
// and never call the server (that happens only on Save).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDemandLines, applyExcelHeads, draftTotals, isUnresolved, lineTotal, manualLine, mergeImportRows, removeLine,
  setLineConfirmed, unresolvedCount, updateLineHeads
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

const members = [{ id: 'm1', code: '1473', name: 'A' }, { id: 'm2', code: '1474', name: 'B' }, { id: 'm3', code: '1475', name: 'C' }];

test('Excel rows are compared with the loaded demand: match, amount differs, missing both ways, no member', () => {
  const demandLines = addDemandLines([], [demand, { ...demand, demandLineId: 'D102', memberCode: '1474' }]).lines;
  assert.equal(unresolvedCount(demandLines), 0, 'no warnings before an Excel is imported');
  const rows = [
    { id: 'r1', memberId: 'm1', status: 'VALID', importedTotalAmount: 3500, allocatedCompulsoryDeposit: 1000, allocatedSpecialDeposit: 500, allocatedRegularLoan: 2000 },
    { id: 'r3', memberId: 'm3', status: 'VALID', importedTotalAmount: 700, allocatedCompulsoryDeposit: 700 },
    { id: 'r4', memberId: null, status: 'MEMBER NOT FOUND', pfNo: '999', sourceRowNo: 5, errorMessage: 'No member found with PF No: 999' }
  ];
  const result = mergeImportRows(demandLines, rows, members, 'B1');
  assert.deepEqual([result.matched, result.added, result.unmatched], [1, 1, 1]);
  const [m1473, m1474, m1475, noMember] = result.lines;
  assert.deepEqual(m1473.warnings, [], 'Excel equals demand');
  assert.equal(m1473.demandLineId, 'D101');
  assert.deepEqual(m1474.warnings, ['In demand, not in the Excel']);
  assert.deepEqual(m1475.warnings, ['In the Excel, not in the demand']);
  assert.equal(noMember.unmatched, true);
  assert.equal(unresolvedCount(result.lines), 3);
});

test('an amount difference is fixed by Use Excel or Edit, or confirmed; an unmatched row must be removed', () => {
  const demandLines = addDemandLines([], [demand]).lines;
  const rows = [{ id: 'r1', memberId: 'm1', status: 'SHORT', importedTotalAmount: 3000, allocatedCompulsoryDeposit: 1000, allocatedSpecialDeposit: 500, allocatedRegularLoan: 1500 }];
  const { lines } = mergeImportRows(demandLines, rows, members, 'B1');
  assert.match(lines[0].warnings[0], /Excel ₹3,000 ≠ Demand ₹3,500/);
  assert.equal(isUnresolved(lines[0]), true);

  const usedExcel = applyExcelHeads(lines, 0);
  assert.equal(lineTotal(usedExcel[0]), 3000);
  assert.deepEqual(usedExcel[0].warnings, []);

  const edited = updateLineHeads(lines, 0, { loan: 1500 });
  assert.deepEqual(edited[0].warnings, []);

  const confirmed = setLineConfirmed(lines, 0, true);
  assert.equal(isUnresolved(confirmed[0]), false);
  assert.equal(unresolvedCount(confirmed), 0);
  // Editing again clears the confirmation.
  assert.equal(updateLineHeads(confirmed, 0, { loan: 1000 })[0].confirmed, false);

  const withUnknown = mergeImportRows([], [{ id: 'x', memberId: null, pfNo: '1', sourceRowNo: 2 }], members, 'B1').lines;
  assert.equal(isUnresolved(setLineConfirmed(withUnknown, 0, true)[0]), true, 'confirm does not clear an unmatched row');
  assert.equal(unresolvedCount(removeLine(withUnknown, 0)), 0);
});

test('Excel rows of branches whose demand is not loaded are skipped, not flagged', () => {
  const demandLines = addDemandLines([], [{ ...demand, branchCode: '59' }]).lines;
  const branchMembers = [{ id: 'm1', code: '1473', branchCode: '59' }, { id: 'm8', code: '1800', branchCode: '12' }];
  const rows = [
    { id: 'r1', memberId: 'm1', importedTotalAmount: 3500, allocatedCompulsoryDeposit: 1000, allocatedSpecialDeposit: 500, allocatedRegularLoan: 2000 },
    { id: 'r8', memberId: 'm8', importedTotalAmount: 999, allocatedCompulsoryDeposit: 999 }
  ];
  const result = mergeImportRows(demandLines, rows, branchMembers, 'B1');
  assert.deepEqual([result.matched, result.added, result.otherBranch], [1, 0, 1]);
  assert.equal(result.lines.length, 1);
  assert.equal(unresolvedCount(result.lines), 0);
});

test('Excel name / branch differences are warnings', () => {
  const demandLines = addDemandLines([], [demand]).lines;
  const rows = [{ id: 'r1', memberId: 'm1', importedTotalAmount: 3500, allocatedCompulsoryDeposit: 1000, allocatedSpecialDeposit: 500, allocatedRegularLoan: 2000,
    sourceEmployeeName: 'AA', sourceBranch: 'X', warnings: 'SOURCE NAME DIFFERENCE\nSOURCE BRANCH DIFFERENCE' }];
  const [line] = mergeImportRows(demandLines, rows, members, 'B1').lines;
  assert.equal(line.warnings.length, 2);
  assert.match(line.warnings.join(' '), /name "AA".*branch "X"/);
});

test('totals are exact in paise', () => {
  const lines = [manualLine({ code: '1' }, { cd: 0.1 }), manualLine({ code: '2' }, { cd: 0.2 })];
  assert.equal(draftTotals(lines).total, 0.3);
});

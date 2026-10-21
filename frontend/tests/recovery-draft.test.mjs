// The Recovery From Member draft: Demand / Excel / Manual rows feed one
// editable grid; editing, removing and totals never touch the demand rows
// and never call the server (that happens only on Save).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDemandLines, addExcelLines, applyExcelHeads, fitHeadsToAmount, balanceErrors, draftTotals, isUnresolved, lineDifference, lineErrors, lineStatus, lineTotal, manualLine, mergeImportRows, reconcile,
  removeLine, unresolvedCount, updateLineHeads, withOutstanding, withWarnings
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
  const again = addDemandLines(first, [demand, { ...demand, demandLineId: 'D102', memberCode: '1474', other: 250 }]);
  assert.equal(again.added, 1);
  assert.equal(again.skipped, 1);
  assert.equal(again.lines[1].needsReview, true);
  assert.equal(lineTotal(again.lines[1]), 3500);
  // One line per member: another demand line of a member already in the draft is skipped.
  assert.equal(addDemandLines(first, [{ ...demand, demandLineId: 'D103' }]).added, 0);
});

test('Load Demand from Monthly Demand Data: a member with no demand line gets a line that remembers its month', () => {
  const fromMember = { ...demand, demandLineId: '', candidateKey: 'member:1480:2026-7', source: 'MEMBER_DEMAND', memberCode: '1480', month: 7, year: '2026' };
  const { lines, added } = addDemandLines([], [demand, fromMember]);
  assert.equal(added, 2);
  assert.deepEqual([lines[1].demandSource, lines[1].demandMonth, lines[1].demandYear, lines[1].demandLineId], ['MEMBER_DEMAND', 7, '2026', '']);
  assert.match(lines[1].warnings.join(' '), /Monthly Demand Data \(07\/2026\)/);
});

test('a loan cut is red when the loan is fully repaid or the cut passes the outstanding', () => {
  const base = withWarnings([manualLine({ code: '1473' }, { cd: 1000, loan: 2000, lad: 500 }, '3500')]);
  const ok = withOutstanding(base, { 1473: { regularLoan: 2000, loanAgainstDeposit: 800 } });
  assert.equal(lineStatus(ok[0], ok), 'VALID', 'a cut equal to the outstanding is fine');
  const over = withOutstanding(base, { 1473: { regularLoan: 1500, loanAgainstDeposit: 0 } });
  assert.equal(lineStatus(over[0], over), 'OVER_BALANCE');
  assert.deepEqual(lineErrors(over[0], over), [
    'Regular Loan cut ₹2,000 is more than the ₹1,500 outstanding: edit the cut.',
    'Loan Against Deposit is fully repaid (balance 0): nothing should be cut. Edit the cut.'
  ]);
  assert.equal(reconcile(over).canSave, false);
  const fixed = updateLineHeads(over, 0, { cd: 2000, loan: 1500, lad: 0 });
  assert.equal(lineStatus(fixed[0], fixed), 'VALID', 'editing the cut to the outstanding clears it');
  assert.deepEqual(balanceErrors(base[0]), [], 'no check until the outstanding is known');
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

const members = [{ id: 'm1', code: '1473', name: 'A', membershipDate: '1990-09-16' }, { id: 'm2', code: '1474', name: 'B', membershipDate: '1991-07-21' }, { id: 'm3', code: '1475', name: 'C', membershipDate: '1997-12-09' }];

test('Excel rows against the loaded demand: match, missing both ways, no member', () => {
  const demandLines = addDemandLines([], [demand, { ...demand, demandLineId: 'D102', memberCode: '1474' }]).lines;
  const rows = [
    { id: 'r1', memberId: 'm1', status: 'VALID', importedTotalAmount: 3500, allocatedCompulsoryDeposit: 1000, allocatedSpecialDeposit: 500, allocatedRegularLoan: 2000 },
    { id: 'r3', memberId: 'm3', status: 'VALID', importedTotalAmount: 700, allocatedCompulsoryDeposit: 700 },
    { id: 'r4', memberId: null, status: 'MEMBER NOT FOUND', pfNo: '999', sourceRowNo: 5, importedTotalAmount: 900, errorMessage: 'No member found with PF No: 999' }
  ];
  const result = mergeImportRows(demandLines, rows, members, 'B1');
  assert.deepEqual([result.matched, result.added, result.unmatched], [1, 1, 1]);
  const [m1473, m1474, m1475, noMember] = result.lines;
  assert.equal(lineStatus(m1473, result.lines), 'VALID', 'Excel equals demand');
  assert.equal(m1473.demandLineId, 'D101');
  assert.equal(lineStatus(m1474, result.lines), 'NOT_IN_EXCEL');
  assert.equal(lineStatus(m1475, result.lines), 'VALID', 'Excel-only line split from the monthly demand');
  assert.match(m1475.warnings.join(' '), /not in the loaded demand/);
  assert.equal(lineStatus(noMember, result.lines), 'NO_MEMBER');
  assert.equal(unresolvedCount(result.lines), 2);
});

test('Excel import takes only rows with an amount, for members with a membership date; the rest are excluded with a reason', () => {
  const people = [...members, { id: 'm4', code: '1476', name: 'D', membershipDate: null }];
  const rows = [
    { id: 'r1', memberId: 'm1', importedTotalAmount: 700, allocatedCompulsoryDeposit: 700, sourceRowNo: 4, pfNo: '11' },
    { id: 'r2', memberId: 'm2', importedTotalAmount: 0, sourceRowNo: 5, pfNo: '12' },
    { id: 'r3', memberId: 'm4', importedTotalAmount: 500, sourceRowNo: 6, pfNo: '13' },
    { id: 'r4', memberId: null, importedTotalAmount: 0, sourceRowNo: 7, pfNo: '999' }
  ];
  const result = mergeImportRows([], rows, people, 'B1');
  assert.deepEqual(result.lines.map((line) => line.member), ['1473']);
  assert.deepEqual([result.added, result.unmatched, result.zeroAmount, result.noMembershipDate], [1, 0, 2, 1]);
  assert.deepEqual(result.excluded.map((row) => [row.importRowId, row.reason]), [
    ['r2', 'Amount is 0 in the Excel'],
    ['r3', 'Member 1476 has no membership date'],
    ['r4', 'Amount is 0 in the Excel']
  ]);
});

test('spec 54: Excel 12,000 vs demand CD 2,000 + Loan 8,000 is under by 2,000; Loan 10,000 makes it valid', () => {
  const lines = addDemandLines([], [{ ...demand, compulsoryDeposit: 2000, specialDeposit: 0, regularLoan: 8000 }]).lines;
  const merged = mergeImportRows(lines, [{ id: 'r1', memberId: 'm1', importedTotalAmount: 12000 }], members, 'B1').lines;
  assert.equal(lineTotal(merged[0]), 10000);
  assert.equal(lineDifference(merged[0]), 2000);
  assert.equal(lineStatus(merged[0], merged), 'UNDER');
  assert.equal(reconcile(merged).canSave, false);

  const fixed = updateLineHeads(merged, 0, { loan: 10000 });
  assert.equal(fixed[0].excel.amount, 12000, 'the Excel amount never changes on edit');
  assert.equal(lineStatus(fixed[0], fixed), 'VALID');
  assert.equal(reconcile(fixed).canSave, true);

  const over = updateLineHeads(merged, 0, { loan: 10000.01 });
  assert.equal(lineStatus(over[0], over), 'OVER');
  assert.equal(reconcile(over).difference, -0.01);
  assert.equal(reconcile(over).canSave, false, 'even 1 paisa blocks Save');
});

test('each head edit moves the allocated total; stats and recovery total follow; Excel total stays', () => {
  const merged = mergeImportRows(addDemandLines([], [demand]).lines, [{ id: 'r1', memberId: 'm1', importedTotalAmount: 5000 }], members, 'B1').lines;
  const before = reconcile(merged);
  for (const key of ['loan', 'lad', 'share', 'cd', 'ssa']) {
    const edited = updateLineHeads(merged, 0, { [key]: Number(merged[0].heads[key] || 0) + 100 });
    const after = reconcile(edited);
    assert.equal(after.recoveryTotal, before.recoveryTotal + 100, key);
    assert.equal(after.statsTotal, after.recoveryTotal, key);
    assert.equal(after.excelTotal, 5000, key);
  }
});

test('no confirm override: a stray confirmed flag changes nothing', () => {
  const merged = mergeImportRows(addDemandLines([], [demand]).lines, [{ id: 'r1', memberId: 'm1', importedTotalAmount: 3000 }], members, 'B1').lines;
  const forged = withWarnings([{ ...merged[0], confirmed: true, status: 'VALID', difference: 0 }]);
  assert.equal(isUnresolved(forged[0], forged), true);
  assert.equal(Object.hasOwn(forged[0], 'confirmed'), false);
  assert.equal(reconcile(forged).canSave, false);
});

test('Use Excel split / Edit fix an amount difference; Premium and Suspense block', () => {
  const merged = mergeImportRows(addDemandLines([], [demand]).lines, [{ id: 'r1', memberId: 'm1', importedTotalAmount: 3000, allocatedCompulsoryDeposit: 1000, allocatedSpecialDeposit: 500, allocatedRegularLoan: 1500 }], members, 'B1').lines;
  assert.equal(lineStatus(merged[0], merged), 'OVER');
  const usedExcel = applyExcelHeads(merged, 0);
  assert.equal(lineStatus(usedExcel[0], usedExcel), 'VALID');
  const premium = updateLineHeads(usedExcel, 0, { loan: 1000, ins: 500 });
  assert.equal(lineStatus(premium[0], premium), 'UNSUPPORTED');
});

test('removing an Excel row excludes it explicitly (with its amount and reason); a manual row just goes', () => {
  const merged = mergeImportRows([], [
    { id: 'r1', memberId: 'm1', importedTotalAmount: 700, allocatedCompulsoryDeposit: 700, sourceRowNo: 7, pfNo: '11' },
    { id: 'x', memberId: null, pfNo: '1', sourceRowNo: 2, importedTotalAmount: 300 }
  ], members, 'B1').lines;
  const afterUnknown = removeLine(merged, 1, [], 'No member for this PF');
  assert.deepEqual(afterUnknown.excluded.map((row) => [row.importRowId, row.amount, row.reason]), [['x', 300, 'No member for this PF']]);
  assert.equal(unresolvedCount(afterUnknown), 0);
  const manual = [manualLine({ code: '1474' }, { cd: 50 }, 50)];
  assert.deepEqual(removeLine(manual, 0, []).excluded, []);
});

test('rows of branches whose demand is not loaded are excluded on record, not silently skipped', () => {
  const demandLines = addDemandLines([], [{ ...demand, branchCode: '59' }]).lines;
  const branchMembers = [{ id: 'm1', code: '1473', branchCode: '59', membershipDate: '1990-09-16' }, { id: 'm8', code: '1800', branchCode: '12', membershipDate: '1984-09-16' }];
  const rows = [
    { id: 'r1', memberId: 'm1', importedTotalAmount: 3500, allocatedCompulsoryDeposit: 1000, allocatedSpecialDeposit: 500, allocatedRegularLoan: 2000 },
    { id: 'r8', memberId: 'm8', importedTotalAmount: 999, allocatedCompulsoryDeposit: 999 }
  ];
  const result = mergeImportRows(demandLines, rows, branchMembers, 'B1');
  assert.deepEqual([result.matched, result.added, result.otherBranch], [1, 0, 1]);
  assert.equal(result.lines.length, 1);
  assert.deepEqual(result.excluded.map((row) => [row.importRowId, row.amount]), [['r8', 999]]);
  assert.equal(reconcile(result.lines).canSave, true);
});

test('a manual line needs an expected amount and must equal it', () => {
  const noExpected = withWarnings([manualLine({ code: '1474' }, { cd: 500 })]);
  assert.equal(lineStatus(noExpected[0], noExpected), 'NO_EXPECTED');
  const ok = withWarnings([manualLine({ code: '1474' }, { cd: 500 }, '500')]);
  assert.equal(lineStatus(ok[0], ok), 'VALID');
  assert.equal(reconcile(ok).canSave, true);
});

test('Excel name / branch differences are notes, not errors', () => {
  const demandLines = addDemandLines([], [demand]).lines;
  const rows = [{ id: 'r1', memberId: 'm1', importedTotalAmount: 3500, sourceEmployeeName: 'AA', sourceBranch: 'X', warnings: 'SOURCE NAME DIFFERENCE\nSOURCE BRANCH DIFFERENCE' }];
  const lines = mergeImportRows(demandLines, rows, members, 'B1').lines;
  assert.equal(lines[0].warnings.length, 2);
  assert.match(lines[0].warnings.join(' '), /name "AA".*branch "X"/);
  assert.equal(lineStatus(lines[0], lines), 'VALID');
});

test('totals are exact in paise', () => {
  const lines = [manualLine({ code: '1' }, { cd: 0.1 }), manualLine({ code: '2' }, { cd: 0.2 })];
  assert.equal(draftTotals(lines).total, 0.3);
});

test('Load Demand: the demand total is each line\'s expected amount, so the line is valid as loaded', () => {
  const { lines } = addDemandLines([], [demand], { withExpected: true });
  assert.equal(lines[0].expectedAmount, '3500');
  assert.equal(lineStatus(lines[0], lines), 'VALID');
});

test('fit: Excel equal to the demand keeps the demand split', () => {
  const fit = fitHeadsToAmount(3500, { cd: 1000, ssa: 500, loan: 2000 }, { regularLoan: 50000, loanAgainstDeposit: 0 });
  assert.deepEqual([fit.heads.cd, fit.heads.ssa, fit.heads.loan, fit.heads.lad], [1000, 500, 2000, '']);
  assert.equal(fit.note, '');
});

test('fit: Excel short of the demand comes off LAD first, then Regular Loan', () => {
  const fit = fitHeadsToAmount(2000, { cd: 1000, ssa: 500, loan: 1000, lad: 500 }, { regularLoan: 50000, loanAgainstDeposit: 5000 });
  assert.deepEqual([fit.heads.cd, fit.heads.ssa, fit.heads.loan, fit.heads.lad], [1000, 500, 500, '']);
  assert.match(fit.note, /Excel ₹2,000 vs demand ₹3,000/);
});

test('fit: Excel over the demand fills the loans up to the balance left, the rest goes to CD', () => {
  const fit = fitHeadsToAmount(5000, { cd: 1000, loan: 2000, lad: 0 }, { regularLoan: 2500, loanAgainstDeposit: 1000 });
  assert.deepEqual([fit.heads.cd, fit.heads.loan, fit.heads.lad], [1500, 2500, 1000]);
});

test('fit: a loan cut past the outstanding is capped and the Excel amount still fits', () => {
  const fit = fitHeadsToAmount(3000, { cd: 1000, loan: 2000 }, { regularLoan: 0, loanAgainstDeposit: 0 });
  assert.deepEqual([fit.heads.cd, fit.heads.loan], [3000, '']);
  assert.match(fit.note, /cut to the 0 outstanding/);
});

test('fit: Premium in the demand is not part of the split', () => {
  const fit = fitHeadsToAmount(1200, { cd: 1000, ins: 200 }, null);
  assert.deepEqual([fit.heads.cd, fit.heads.ins], [1200, '']);
  assert.match(fit.note, /Premium/);
});

test('Load Excel: each row is split over the member\'s demand of the month and fitted to its Excel amount', () => {
  const candidates = [
    { ...demand, branchCode: 'HO' },
    { ...demand, demandLineId: '', candidateKey: 'member:1474:2026-10', source: 'MEMBER_DEMAND', month: 10, year: '2026', memberCode: '1474', compulsoryDeposit: 800, specialDeposit: 0, regularLoan: 0, totalAmount: 800 }
  ];
  const excel = {
    batch: { id: 'B9' },
    rows: [
      { id: 'r1', memberId: 'm1', importedTotalAmount: 3000 },
      { id: 'r2', memberId: 'm2', importedTotalAmount: 1000 },
      { id: 'r3', memberId: 'm3', importedTotalAmount: 600, configuredCompulsoryDeposit: 500 },
      { id: 'r4', memberId: null, pfNo: '999', importedTotalAmount: 100 }
    ]
  };
  const outstanding = { 1473: { regularLoan: 10000, loanAgainstDeposit: 0 }, 1474: { regularLoan: 0, loanAgainstDeposit: 0 } };
  const result = addExcelLines([], excel, { candidates, members, outstanding });
  const [a, b, c, none] = result.lines;
  assert.equal(a.demandLineId, 'D101');
  assert.deepEqual([a.heads.cd, a.heads.ssa, a.heads.loan], [1000, 500, 1500]);
  assert.equal(b.demandSource, 'MEMBER_DEMAND');
  assert.equal(b.heads.cd, 1000);
  assert.equal(c.source, 'EXCEL');
  assert.equal(c.heads.cd, 600);
  assert.equal(none.unmatched, true);
  for (const line of [a, b, c]) assert.equal(lineStatus(line, result.lines), 'VALID');
  assert.equal(result.adjusted, 3);
  assert.equal(result.demandMatched, 2);
});

test('Load Excel with a branch chosen: rows of other branches are excluded on record', () => {
  const people = [{ id: 'm1', code: '1473', branchCode: 'HO', membershipDate: '1990-09-16' }, { id: 'm2', code: '1474', branchCode: 'BR2', membershipDate: '1991-07-21' }];
  const excel = { batch: { id: 'B9' }, rows: [{ id: 'r1', memberId: 'm1', importedTotalAmount: 500 }, { id: 'r2', memberId: 'm2', importedTotalAmount: 500 }] };
  const result = addExcelLines([], excel, { members: people, branchCode: 'HO' });
  assert.equal(result.lines.length, 1);
  assert.equal(result.otherBranch, 1);
  assert.equal(result.excluded[0].importRowId, 'r2');
});

test('Load Demand then Load Excel: a ticked demand member missing from the Excel stays red', () => {
  const excel = { batch: { id: 'B9' }, rows: [{ id: 'r1', memberId: 'm1', importedTotalAmount: 3500 }] };
  const result = addExcelLines([], excel, { candidates: [demand, { ...demand, demandLineId: 'D102', memberCode: '1474' }], members });
  const [a, b] = result.lines;
  assert.equal(lineStatus(a, result.lines), 'VALID');
  assert.equal(lineStatus(b, result.lines), 'NOT_IN_EXCEL');
});

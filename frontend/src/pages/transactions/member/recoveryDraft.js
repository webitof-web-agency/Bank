// Recovery From Member — the editable draft behind the entry screen.
//
// Every source (Add From Demand List, Excel import, Add Record) produces the
// same draft line, kept in voucher.details.recoveryLines until Save:
//   { member, memberName, branchName, designation,
//     source: 'DEMAND' | 'EXCEL' | 'MANUAL',
//     demandLineId, demandListNo,          // exact demand provenance
//     importBatchId, importRowId,          // Excel provenance
//     excel: { amount, name, branch, ... } // the matching Excel row, if any
//     expectedAmount,                      // control amount of a line with no Excel row
//     unmatched,                           // Excel row with no member
//     heads: { share, cd, ssa, loan, lad, ins, admfee, suspense } }
//
// The rule (as the legacy screen's red rows): the bank Excel gives each
// member's ACTUAL total deducted — the expected amount. The demand gives the
// starting split. A line is VALID only when its heads add up exactly to the
// expected amount; there is no "confirm" override. Save needs every line
// VALID, so the recovery total equals the Excel total to the paisa.
// An Excel row is never dropped silently: removing one moves it to the
// excluded list (details.recoveryExcluded) with a reason, and the server
// checks every row of the batch is either in the recovery or excluded.
// Nothing here talks to the server; Save recomputes everything there.

export const RECOVERY_HEADS = [
  ['share', 'Share'],
  ['cd', 'Cmp. Dep.'],
  ['ssa', 'SSA'],
  ['loan', 'Reg. Loan'],
  ['lad', 'LAD'],
  ['ins', 'Premium'],
  ['admfee', 'Admission'],
  ['suspense', 'Suspense']
];

const HEAD_KEYS = RECOVERY_HEADS.map(([key]) => key);

// Rupees <-> paise, so totals never drift on floating point.
export function toPaise(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

export function fromPaise(paise) {
  return Math.round(paise) / 100;
}

export function emptyHeads() {
  return Object.fromEntries(HEAD_KEYS.map((key) => [key, '']));
}

// Older saved vouchers used cd/compulsoryDeposit, ins/insurance and one
// "other" bucket for admission + suspense; read them all.
export function normalizeHeads(heads = {}) {
  return {
    share: heads.share ?? '',
    cd: heads.cd ?? heads.compulsoryDeposit ?? '',
    ssa: heads.ssa ?? '',
    loan: heads.loan ?? '',
    lad: heads.lad ?? '',
    ins: heads.ins ?? heads.insurance ?? '',
    admfee: heads.admfee ?? '',
    suspense: heads.suspense ?? ''
  };
}

export function lineTotalPaise(line = {}) {
  const heads = normalizeHeads(line.heads);
  return HEAD_KEYS.reduce((sum, key) => sum + toPaise(heads[key]), 0);
}

export function lineTotal(line = {}) {
  return fromPaise(lineTotalPaise(line));
}

// Column totals and grand total of the draft, in rupees.
export function draftTotals(lines = []) {
  const paise = Object.fromEntries(HEAD_KEYS.map((key) => [key, 0]));
  for (const line of lines) {
    const heads = normalizeHeads(line.heads);
    for (const key of HEAD_KEYS) paise[key] += toPaise(heads[key]);
  }
  const grand = HEAD_KEYS.reduce((sum, key) => sum + paise[key], 0);
  return { heads: Object.fromEntries(HEAD_KEYS.map((key) => [key, fromPaise(paise[key])])), total: fromPaise(grand) };
}

export function normalizeDraftLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({ ...(line || {}), heads: normalizeHeads(line?.heads) }));
}

const amountOrBlank = (value) => (Number(value) ? Number(value) : '');

// A demand line copied into the draft. The demand row itself is not changed;
// "Other" has no recovery head, so it is noted on the line, never moved.
export function lineFromDemand(candidate = {}) {
  const other = Number(candidate.other || 0);
  return {
    member: String(candidate.memberCode || '').toUpperCase(),
    memberName: candidate.memberName || '',
    branchCode: String(candidate.branchCode || '').toUpperCase(),
    branchName: candidate.branchName || '',
    designation: candidate.designation || '',
    source: 'DEMAND',
    demandLineId: candidate.demandLineId,
    demandListNo: candidate.demandListNo || '',
    needsReview: other > 0,
    reviewNote: other > 0 ? `Demand "Other" ${other} has no recovery head and was not copied.` : '',
    heads: {
      ...emptyHeads(),
      cd: amountOrBlank(candidate.compulsoryDeposit),
      ssa: amountOrBlank(candidate.specialDeposit),
      loan: amountOrBlank(candidate.regularLoan),
      lad: amountOrBlank(candidate.loanAgainstDeposit),
      ins: amountOrBlank(candidate.insurancePremium)
    }
  };
}

// Adds demand lines not already in the draft (same demand line id).
export function addDemandLines(lines = [], candidates = []) {
  const present = new Set(lines.map((line) => line.demandLineId).filter(Boolean));
  const added = candidates.filter((candidate) => candidate.demandLineId && !present.has(candidate.demandLineId)).map(lineFromDemand);
  return { lines: withWarnings([...lines, ...added]), added: added.length, skipped: candidates.length - added.length };
}

const formatRupees = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value || 0));

// The Excel row as kept on a draft line.
function excelOf(row = {}, batchId = '') {
  const notes = String(row.warnings || '');
  return {
    amount: Number(row.importedTotalAmount || 0),
    rowNo: row.sourceRowNo || null,
    pfNo: row.pfNo || '',
    name: row.sourceEmployeeName || '',
    branch: row.sourceBranch || '',
    nameDiffers: notes.includes('SOURCE NAME DIFFERENCE'),
    branchDiffers: notes.includes('SOURCE BRANCH DIFFERENCE'),
    batchId: batchId || row.batchId || '',
    rowId: row.id || '',
    // The import's split of the Excel amount over the member's demand heads.
    heads: {
      share: amountOrBlank(row.allocatedShare),
      cd: amountOrBlank(row.allocatedCompulsoryDeposit),
      ssa: amountOrBlank(row.allocatedSpecialDeposit),
      loan: amountOrBlank(row.allocatedRegularLoan),
      lad: amountOrBlank(row.allocatedLoanAgainstDeposit)
    }
  };
}

// "Use Excel": the line takes the Excel split, which matches the Excel total
// when the import could split it exactly.
export function applyExcelHeads(lines = [], index) {
  const line = lines[index];
  if (!line?.excel?.heads) return lines;
  return updateLineHeads(lines, index, { ...emptyHeads(), ...line.excel.heads });
}

// Excel rows from the recovery import (PF-matched by the import, and split
// over the member's demand heads). A row joins the member's line already in
// the draft (normally its demand line) for comparison; a member with no line
// gets a new Excel line; a PF that matches no member becomes an "unmatched"
// line that has to be removed before Save. The bank's Excel covers every
// branch: once demand is loaded, rows of members from branches whose demand
// was not loaded are left out (counted in otherBranch).
export function mergeImportRows(lines = [], rows = [], members = [], batchId = '', excluded = []) {
  const memberById = new Map(members.map((member) => [String(member.id || member._id), member]));
  const next = lines.map((line) => ({ ...line }));
  const demandBranches = new Set(lines.filter((line) => line.source === 'DEMAND' && line.branchCode).map((line) => line.branchCode));
  let matched = 0;
  let added = 0;
  let unmatched = 0;
  let otherBranch = 0;
  const nextExcluded = [...excluded];
  for (const row of rows) {
    // The import's validation result (VALID, SHORT, MEMBER NOT FOUND...).
    const { status: validation = '' } = row;
    const member = memberById.get(String(row.memberId || ''));
    const excel = excelOf(row, batchId);
    if (!member) {
      unmatched += 1;
      next.push({
        member: '',
        memberName: excel.name,
        source: 'EXCEL',
        unmatched: true,
        unmatchedReason: row.errorMessage || validation || 'No member found',
        importBatchId: excel.batchId,
        importRowId: excel.rowId,
        excel,
        heads: emptyHeads()
      });
      continue;
    }
    const code = String(member.code || '').toUpperCase();
    const target = next.find((line) => line.member === code && !line.excel && !line.unmatched);
    const memberBranch = String(member.branchCode || '').toUpperCase();
    if (!target && demandBranches.size && memberBranch && !demandBranches.has(memberBranch)) {
      // Recovered in another branch's voucher: excluded here, on record.
      otherBranch += 1;
      nextExcluded.push(excludedEntry(excel, `Branch ${memberBranch}: its demand is not loaded in this recovery`));
      continue;
    }
    if (target) {
      target.excel = excel;
      target.importBatchId = excel.batchId;
      target.importRowId = excel.rowId;
      target.confirmed = false;
      matched += 1;
      continue;
    }
    added += 1;
    next.push({
      member: code,
      memberName: member.name || '',
      branchName: member.branchName || member.branchCode || '',
      designation: member.designation || '',
      source: 'EXCEL',
      importBatchId: excel.batchId,
      importRowId: excel.rowId,
      excel,
      heads: { ...emptyHeads(), ...excel.heads }
    });
  }
  return { lines: withWarnings(next), excluded: nextExcluded, matched, added, unmatched, otherBranch };
}

function excludedEntry(excel = {}, reason = '') {
  return { importRowId: excel.rowId || '', importBatchId: excel.batchId || '', pfNo: excel.pfNo || '', rowNo: excel.rowNo ?? null, name: excel.name || '', amount: Number(excel.amount || 0), reason };
}

// The line's expected amount in paise: the Excel row's total, else the
// operator's control amount; null when there is none yet.
export function expectedPaise(line = {}) {
  if (line.excel) return toPaise(line.excel.amount);
  const text = line.expectedAmount == null ? '' : String(line.expectedAmount).trim();
  return text === '' ? null : toPaise(text);
}

const UNSUPPORTED_HEADS = [['ins', 'Premium'], ['suspense', 'Suspense']];

export const STATUS_LABELS = {
  VALID: 'Valid',
  UNDER: 'Under-allocated',
  OVER: 'Over-allocated',
  UNSUPPORTED: 'Unsupported head',
  NO_EXPECTED: 'No expected amount',
  NOT_IN_EXCEL: 'Not in the Excel',
  NO_MEMBER: 'No member'
};

// VALID only when the heads add up exactly to the expected amount.
export function lineStatus(line = {}, lines = []) {
  if (line.unmatched) return 'NO_MEMBER';
  const excelImported = lines.some((entry) => entry.excel);
  if (excelImported && line.source === 'DEMAND' && !line.excel) return 'NOT_IN_EXCEL';
  const expected = expectedPaise(line);
  if (expected == null || expected <= 0) return 'NO_EXPECTED';
  const heads = normalizeHeads(line.heads);
  if (UNSUPPORTED_HEADS.some(([key]) => toPaise(heads[key]) > 0)) return 'UNSUPPORTED';
  const difference = expected - lineTotalPaise(line);
  if (difference > 0) return 'UNDER';
  if (difference < 0) return 'OVER';
  return 'VALID';
}

// expected - allocated, in rupees (0 when there is no expected amount).
export function lineDifference(line = {}) {
  const expected = expectedPaise(line);
  return expected == null ? 0 : fromPaise(expected - lineTotalPaise(line));
}

// What blocks the line, in words (empty when VALID).
export function lineErrors(line = {}, lines = []) {
  const status = lineStatus(line, lines);
  if (status === 'VALID') return [];
  if (status === 'NO_MEMBER') return [`Excel row ${line.excel?.rowNo ?? ''}: PF ${line.excel?.pfNo || '—'} — ${line.unmatchedReason || 'no member found'}. Exclude this row.`];
  if (status === 'NOT_IN_EXCEL') return ['In the demand but not in the Excel: the bank deducted nothing. Remove this line.'];
  if (status === 'NO_EXPECTED') return ['Enter the expected amount (the amount actually received) — Edit.'];
  if (status === 'UNSUPPORTED') return ['Premium / Suspense have no confirmed posting rule yet: move the amount to another head.'];
  const difference = lineDifference(line);
  return [`Expected ₹${formatRupees(fromPaise(expectedPaise(line)))}, allocated ₹${formatRupees(lineTotal(line))}: ${difference > 0 ? 'under' : 'over'} by ₹${formatRupees(Math.abs(difference))}.`];
}

// Information only (never blocks Save).
export function lineNotes(line = {}, lines = []) {
  const demandLoaded = lines.some((entry) => entry.source === 'DEMAND');
  const notes = [];
  if (line.excel?.nameDiffers) notes.push(`Excel name "${line.excel.name}" differs from the member`);
  if (line.excel?.branchDiffers) notes.push(`Excel branch "${line.excel.branch}" differs from the member`);
  if (demandLoaded && line.source === 'EXCEL') notes.push('In the Excel, not in the loaded demand (split from the member\'s monthly demand)');
  if (line.needsReview && line.reviewNote) notes.push(line.reviewNote);
  return notes;
}

// The draft with each line's status, difference and notes worked out.
export function withWarnings(lines = []) {
  return lines.map((line) => {
    const { confirmed, ...rest } = line || {};
    return { ...rest, status: lineStatus(rest, lines), difference: lineDifference(rest), warnings: lineNotes(rest, lines) };
  });
}

export function isUnresolved(line = {}, lines = [line]) {
  return lineStatus(line, lines) !== 'VALID';
}

export function unresolvedCount(lines = []) {
  return lines.filter((line) => isUnresolved(line, lines)).length;
}

// The batch check behind Save: Excel (expected) total, recovery total (sum
// of each line's heads), the column statistics total, and the row counts.
export function reconcile(lines = []) {
  let expected = 0;
  let allocated = 0;
  let validRows = 0;
  let errorRows = 0;
  for (const line of lines) {
    expected += expectedPaise(line) || 0;
    allocated += lineTotalPaise(line);
    if (isUnresolved(line, lines)) errorRows += 1; else validRows += 1;
  }
  const stats = draftTotals(lines);
  const statsPaise = toPaise(stats.total);
  return {
    excelTotal: fromPaise(expected),
    recoveryTotal: fromPaise(allocated),
    statsTotal: stats.total,
    heads: stats.heads,
    difference: fromPaise(expected - allocated),
    validRows,
    errorRows,
    canSave: lines.length > 0 && errorRows === 0 && expected === allocated && allocated === statsPaise
  };
}

// Add Record: a manual line has no demand link; expectedAmount is the amount
// actually received for the member.
export function manualLine(member = {}, heads = {}, expectedAmount = '') {
  return {
    member: String(member.code || '').toUpperCase(),
    memberName: member.name || '',
    branchName: member.branchName || member.branchCode || '',
    designation: member.designation || '',
    source: 'MANUAL',
    demandLineId: null,
    expectedAmount,
    heads: { ...emptyHeads(), ...heads }
  };
}

// Edit a line's amounts (Update): provenance stays and the Excel amount never
// changes; a line with no Excel row may also set its expected amount.
export function updateLineHeads(lines = [], index, heads = {}, expectedAmount) {
  return withWarnings(lines.map((line, i) => {
    if (i !== index) return line;
    const next = { ...line, heads: { ...normalizeHeads(line.heads), ...heads }, needsReview: false, reviewNote: '' };
    if (expectedAmount !== undefined && !line.excel) next.expectedAmount = expectedAmount;
    return next;
  }));
}

// Remove a line. A line holding an Excel row moves that row to the excluded
// list (with the reason), so the Excel control total stays accounted for.
export function removeLine(lines = [], index, excluded = [], reason = '') {
  const line = lines[index];
  const nextExcluded = line?.excel?.rowId
    ? [...excluded, excludedEntry(line.excel, reason || (line.unmatched ? 'No member for this PF' : 'Excluded by the operator'))]
    : excluded;
  const next = withWarnings(lines.filter((_, i) => i !== index));
  return Object.assign(next, { excluded: nextExcluded });
}

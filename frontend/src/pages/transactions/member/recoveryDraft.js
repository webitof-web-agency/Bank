// Recovery From Member — the editable draft behind the entry screen.
//
// Every source (Add From Demand List, Excel import, Add Record) produces the
// same draft line, kept in voucher.details.recoveryLines until Save:
//   { member, memberName, branchName, designation,
//     source: 'DEMAND' | 'EXCEL' | 'MANUAL',
//     demandLineId, demandListNo,          // exact demand provenance
//     importBatchId, importRowId,          // Excel provenance
//     needsReview, reviewNote,             // flagged for the operator
//     excel: { amount, name, branch, ... } // the matching Excel row, if any
//     unmatched,                           // Excel row with no member
//     confirmed,                           // operator accepted the warnings
//     warnings: [...],                     // see lineWarnings(); kept for Save
//     heads: { share, cd, ssa, loan, lad, ins, admfee, suspense } }
//
// The flow: load the demand, then import the Excel. Each Excel row is matched
// to the member's demand line and compared; every difference is a warning,
// and Save is refused until each warning is fixed (amounts edited, row
// removed) or confirmed on its row.
// Nothing here talks to the server: loading, editing and removing lines only
// changes this draft. The server converts the lines, posts the voucher and
// marks the exact linked demand lines recovered, all in one Save.

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
export function mergeImportRows(lines = [], rows = [], members = [], batchId = '') {
  const memberById = new Map(members.map((member) => [String(member.id || member._id), member]));
  const next = lines.map((line) => ({ ...line }));
  const demandBranches = new Set(lines.filter((line) => line.source === 'DEMAND' && line.branchCode).map((line) => line.branchCode));
  let matched = 0;
  let added = 0;
  let unmatched = 0;
  let otherBranch = 0;
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
      otherBranch += 1;
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
  return { lines: withWarnings(next), matched, added, unmatched, otherBranch };
}

// Everything to resolve on one line, given the whole draft (whether a demand
// was loaded and an Excel imported decides the "not in ..." checks).
export function lineWarnings(line = {}, lines = []) {
  if (line.unmatched) {
    return [`Excel row ${line.excel?.rowNo ?? ''}: PF ${line.excel?.pfNo || '—'} — ${line.unmatchedReason || 'no member found'}. Remove this row.`];
  }
  const demandLoaded = lines.some((entry) => entry.source === 'DEMAND');
  const excelImported = lines.some((entry) => entry.excel);
  const warnings = [];
  if (line.excel) {
    const excelPaise = toPaise(line.excel.amount);
    const linePaise = lineTotalPaise(line);
    if (excelPaise !== linePaise) {
      const label = line.source === 'DEMAND' ? 'Demand' : 'Recovery';
      warnings.push(`Excel ₹${formatRupees(line.excel.amount)} ≠ ${label} ₹${formatRupees(fromPaise(linePaise))}`);
    }
    if (line.excel.nameDiffers) warnings.push(`Excel name "${line.excel.name}" differs from the member`);
    if (line.excel.branchDiffers) warnings.push(`Excel branch "${line.excel.branch}" differs from the member`);
  }
  if (excelImported && line.source === 'DEMAND' && !line.excel) warnings.push('In demand, not in the Excel');
  if (demandLoaded && line.source === 'EXCEL') warnings.push('In the Excel, not in the demand');
  if (line.needsReview && line.reviewNote) warnings.push(line.reviewNote);
  return warnings;
}

// The draft with each line's warnings stored on it (Save sends them, and the
// server refuses unresolved ones too).
export function withWarnings(lines = []) {
  return lines.map((line) => ({ ...line, warnings: lineWarnings(line, lines) }));
}

// A line still blocking Save: warnings not confirmed, or an unmatched row.
export function isUnresolved(line = {}) {
  const warnings = Array.isArray(line.warnings) ? line.warnings : [];
  return Boolean(line.unmatched) || (warnings.length > 0 && !line.confirmed);
}

export function unresolvedCount(lines = []) {
  return withWarnings(lines).filter(isUnresolved).length;
}

export function setLineConfirmed(lines = [], index, confirmed) {
  return withWarnings(lines.map((line, i) => (i === index ? { ...line, confirmed: Boolean(confirmed) } : line)));
}

// Add Record: a manual line has no demand link, whatever demand the member has.
export function manualLine(member = {}, heads = {}) {
  return {
    member: String(member.code || '').toUpperCase(),
    memberName: member.name || '',
    branchName: member.branchName || member.branchCode || '',
    designation: member.designation || '',
    source: 'MANUAL',
    demandLineId: null,
    heads: { ...emptyHeads(), ...heads }
  };
}

// Edit a line's amounts (Update): provenance stays, the review flag and any
// earlier confirmation clear, and the warnings are worked out again.
export function updateLineHeads(lines = [], index, heads = {}) {
  return withWarnings(lines.map((line, i) => (i === index
    ? { ...line, heads: { ...normalizeHeads(line.heads), ...heads }, needsReview: false, reviewNote: '', confirmed: false }
    : line)));
}

export function removeLine(lines = [], index) {
  return withWarnings(lines.filter((_, i) => i !== index));
}

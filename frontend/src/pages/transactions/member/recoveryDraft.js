// Recovery From Member — the editable draft behind the entry screen.
//
// Every source (Add From Demand List, Excel import, Add Record) produces the
// same draft line, kept in voucher.details.recoveryLines until Save:
//   { member, memberName, branchName, designation,
//     source: 'DEMAND' | 'EXCEL' | 'MANUAL',
//     demandLineId, demandListNo,          // exact demand provenance
//     importBatchId, importRowId,          // Excel provenance
//     needsReview, reviewNote,             // flagged for the operator
//     heads: { share, cd, ssa, loan, lad, ins, admfee, suspense } }
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
  return { lines: [...lines, ...added], added: added.length, skipped: candidates.length - added.length };
}

// Excel rows from the recovery import (already PF-matched and split over the
// member's configured demand heads by the import). A row that matched a
// member is added; one whose total did not split exactly (SHORT / EXTRA) is
// added flagged for review; one with no member is reported, not added.
export function addImportRows(lines = [], rows = [], members = [], batchId = '') {
  const memberById = new Map(members.map((member) => [String(member.id || member._id), member]));
  const added = [];
  const rejected = [];
  for (const row of rows) {
    // The import's validation result (VALID, SHORT, EXTRA, MEMBER NOT FOUND...).
    const { status: validation = '' } = row;
    const member = memberById.get(String(row.memberId || ''));
    if (!member) {
      rejected.push({ row: row.sourceRowNo, pfNo: row.pfNo, reason: row.errorMessage || validation || 'Member not found' });
      continue;
    }
    const valid = String(validation).toUpperCase() === 'VALID';
    added.push({
      member: String(member.code || '').toUpperCase(),
      memberName: member.name || '',
      branchName: member.branchName || member.branchCode || '',
      designation: member.designation || '',
      source: 'EXCEL',
      importBatchId: batchId || row.batchId || '',
      importRowId: row.id || '',
      needsReview: !valid,
      reviewNote: valid ? '' : `Excel ${row.importedTotalAmount}: ${row.errorMessage || validation}. Correct the amounts.`,
      heads: {
        ...emptyHeads(),
        share: amountOrBlank(row.allocatedShare),
        cd: amountOrBlank(row.allocatedCompulsoryDeposit),
        ssa: amountOrBlank(row.allocatedSpecialDeposit),
        loan: amountOrBlank(row.allocatedRegularLoan),
        lad: amountOrBlank(row.allocatedLoanAgainstDeposit)
      }
    });
  }
  return { lines: [...lines, ...added], added: added.length, flagged: added.filter((line) => line.needsReview).length, rejected };
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

// Edit a line's amounts (Update): provenance stays, the review flag clears.
export function updateLineHeads(lines = [], index, heads = {}) {
  return lines.map((line, i) => (i === index
    ? { ...line, heads: { ...normalizeHeads(line.heads), ...heads }, needsReview: false, reviewNote: '' }
    : line));
}

export function removeLine(lines = [], index) {
  return lines.filter((_, i) => i !== index);
}

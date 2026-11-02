// Recovery From Member — the editable draft behind the entry screen.
//
// Every source (Load Demand, Load Excel, Add Record) produces the same draft
// line, kept in voucher.details.recoveryLines until Save:
//   { member, memberName, branchName, designation,
//     source: 'DEMAND' | 'EXCEL' | 'MANUAL',
//     demandLineId, demandListNo,          // exact demand provenance
//     demandSource: 'MEMBER_DEMAND',       // from the member's Monthly Demand Data
//     demandMonth, demandYear,             //   (no demand line), for that month
//     outstanding: { regularLoan, loanAgainstDeposit } // owed before this recovery
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
// A line from the member's Monthly Demand Data (no demand line) remembers its
// month, so the saved recovery marks that month recovered for the member.
export function lineFromDemand(candidate = {}) {
  const other = Number(candidate.other || 0);
  const fromMember = candidate.source === 'MEMBER_DEMAND';
  return {
    ...(fromMember ? { demandSource: 'MEMBER_DEMAND', demandMonth: Number(candidate.month) || null, demandYear: String(candidate.year || '') } : {}),
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

// The demand dialog's key for a candidate: its demand line, else the
// member + month of their Monthly Demand Data.
export function candidateKey(candidate = {}) {
  return candidate.demandLineId || candidate.candidateKey || '';
}

// Adds demand lines not already in the draft: not the same demand line, and
// not a member who already has a line (one line per member).
// withExpected (Load Demand, no Excel): the demand total is the line's
// expected amount — the demand stands in for the bank's figure.
export function addDemandLines(lines = [], candidates = [], { withExpected = false } = {}) {
  const present = new Set(lines.map((line) => line.demandLineId).filter(Boolean));
  const members = new Set(lines.map((line) => line.member).filter(Boolean));
  const added = [];
  for (const candidate of candidates) {
    const code = String(candidate.memberCode || '').toUpperCase();
    if (!candidateKey(candidate) || (candidate.demandLineId && present.has(candidate.demandLineId)) || members.has(code)) continue;
    members.add(code);
    const line = lineFromDemand(candidate);
    if (withExpected) line.expectedAmount = String(lineTotal(line));
    added.push(line);
  }
  return { lines: withWarnings([...lines, ...added]), added: added.length, skipped: candidates.length - added.length };
}

// One formatter for every note (building one per call made 600 lines slow).
const RUPEES = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const formatRupees = (value) => RUPEES.format(Number(value || 0));

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
    },
    // The member's configured demand the import split from.
    demandHeads: {
      share: amountOrBlank(row.configuredShare),
      cd: amountOrBlank(row.configuredCompulsoryDeposit),
      ssa: amountOrBlank(row.configuredSpecialDeposit),
      loan: amountOrBlank(row.configuredRegularLoan),
      lad: amountOrBlank(row.configuredLoanAgainstDeposit)
    }
  };
}

const HEAD_NAMES = Object.fromEntries(RECOVERY_HEADS);

// Load Excel: the bank's amount for one member, split over their demand.
// The amount fills the demand head by head — CD, then SSA, then Regular
// Loan, then LAD (then Share) — each up to its demand; a loan head never
// passes what is still owed (outstanding, when known).
//   - Excel short of the demand: the later heads get less (or nothing). The
//     line is valid: a short deduction is normal.
//   - Excel over the demand: the demand is filled and the rest is `extra`,
//     left unallocated: the line is red ("More than demand") until the
//     operator puts it into a head (Edit).
// Premium and Suspense have no posting rule, and Admission is not a monthly
// demand: none of them is part of the split.
// Returns { heads, demandTotal, extra, note } — note says what was changed.
export const FILL_ORDER = ['cd', 'ssa', 'loan', 'lad', 'share'];

export function fitHeadsToAmount(amount, demand = {}, outstanding = null) {
  const target = toPaise(amount);
  const base = normalizeHeads(demand);
  const want = Object.fromEntries(FILL_ORDER.map((key) => [key, Math.max(0, toPaise(base[key]))]));
  const demandTotal = FILL_ORDER.reduce((sum, key) => sum + want[key], 0);
  const dropped = ['ins', 'admfee', 'suspense'].filter((key) => toPaise(base[key]) > 0);
  const owed = {
    loan: outstanding ? Math.max(0, toPaise(outstanding.regularLoan)) : null,
    lad: outstanding ? Math.max(0, toPaise(outstanding.loanAgainstDeposit)) : null
  };
  const notes = [];
  for (const key of ['loan', 'lad']) {
    if (owed[key] != null && want[key] > owed[key]) {
      notes.push(`${HEAD_NAMES[key]} ${formatRupees(fromPaise(want[key]))} cut to the ${formatRupees(fromPaise(owed[key]))} outstanding`);
      want[key] = owed[key];
    }
  }
  const paise = {};
  let left = target;
  for (const key of FILL_ORDER) {
    paise[key] = Math.min(want[key], Math.max(0, left));
    left -= paise[key];
  }
  const extra = Math.max(0, left);
  if (target !== demandTotal) notes.unshift(`Excel ₹${formatRupees(fromPaise(target))} vs demand ₹${formatRupees(fromPaise(demandTotal))}`);
  if (target < demandTotal) notes.push('filled CD → SSA → Reg. Loan → LAD');
  if (extra > 0) notes.push(`₹${formatRupees(fromPaise(extra))} more than the demand left to allocate`);
  if (dropped.length) notes.push(`${dropped.map((key) => HEAD_NAMES[key]).join(' / ')} in the demand left out of the split`);
  return {
    heads: { ...emptyHeads(), ...Object.fromEntries(FILL_ORDER.map((key) => [key, paise[key] ? fromPaise(paise[key]) : ''])) },
    demandTotal: fromPaise(demandTotal),
    extra: fromPaise(extra),
    note: notes.length ? `Adjusted to the Excel: ${notes.join('; ')}.` : ''
  };
}

// Load Demand, then Load Excel: the ticked demand lines (`candidates` — a
// pending demand line, else the member's Monthly Demand Data) go into the
// draft, and each Excel row joins its member's line with the heads fitted
// to its Excel amount. The demand is the split to start from and stays
// linked, so Save marks it recovered; a member in the Excel with no demand
// line starts from the demand the import used. A ticked demand member with
// no Excel amount (not in the file, or 0) gets no line: nothing is recovered
// from them for the month and their demand stays pending (counted in
// noEntry). Lines already in the draft keep their own heads as the start. `branchCode` limits the Excel to one branch
// (others excluded on record); '' takes every branch. Only lines of this
// batch are refitted.
export function addExcelLines(lines = [], excel = {}, { candidates = [], members = [], excluded = [], outstanding = {}, branchCode = '' } = {}) {
  const rows = Array.isArray(excel.rows) ? excel.rows : [];
  const batchId = excel.batch?.id || '';
  const demand = addDemandLines(lines, candidates);
  const merged = mergeImportRows(demand.lines, rows, members, batchId, excluded, { branchCodes: branchCode ? [String(branchCode).toUpperCase()] : [] });
  const batchRowIds = new Set(rows.map((row) => row.id).filter(Boolean));
  // The demand lines this Add brings in (not those already in the draft).
  const before = lines.length;
  const noEntryLines = [];
  const kept = merged.lines.filter((line, index) => {
    if (index < before || index >= demand.lines.length || line.excel) return true;
    noEntryLines.push({ member: line.member, memberName: line.memberName || '', branchName: line.branchName || '', designation: line.designation || '', demandAmount: lineTotal(line) });
    return false;
  });
  const noEntry = noEntryLines.length;
  let adjusted = 0;
  // overDemand: Excel more than the demand. loanCapped: within the demand,
  // but a loan owed less than its demand leaves part to allocate.
  let overDemand = 0;
  let loanCapped = 0;
  const fitted = withOutstanding(kept, outstanding).map((line) => {
    if (line.unmatched || !line.excel || !batchRowIds.has(line.excel.rowId)) return line;
    const start = line.source === 'EXCEL' ? line.excel.demandHeads : line.heads;
    const fit = fitHeadsToAmount(line.excel.amount, start, line.outstanding || null);
    if (fit.note) adjusted += 1;
    if (toPaise(line.excel.amount) > toPaise(fit.demandTotal)) overDemand += 1;
    else if (fit.extra > 0) loanCapped += 1;
    return { ...line, heads: fit.heads, demandAmount: fit.demandTotal, fitNote: fit.note, needsReview: false, reviewNote: '' };
  });
  return { ...merged, lines: withWarnings(fitted), demandMatched: demand.added - noEntry, adjusted, overDemand, loanCapped, noEntry, noEntryLines };
}

// The Excel amount against the demand it was split from: 'EXTRA' (more),
// 'LESS', 'EQUAL', or '' for a line with no Excel row or no demand figure.
// (Members with 0 / nothing in the Excel get no line: see noEntryLines.)
export function excelVsDemand(line = {}) {
  if (!line.excel || line.unmatched || line.demandAmount == null || line.demandAmount === '') return '';
  const difference = toPaise(line.excel.amount) - toPaise(line.demandAmount);
  return difference > 0 ? 'EXTRA' : difference < 0 ? 'LESS' : 'EQUAL';
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
// Only rows with an amount, for members with a membership date, are taken:
// a 0 row, or a member with no membership date, goes to the excluded list
// with its reason (counted in zeroAmount / noMembershipDate).
// `branchCodes` (Load Excel) names the branches taken outright instead of
// working them out from the demand lines; [] takes every branch.
export function mergeImportRows(lines = [], rows = [], members = [], batchId = '', excluded = [], { branchCodes } = {}) {
  const memberById = new Map(members.map((member) => [String(member.id || member._id), member]));
  const next = lines.map((line) => ({ ...line }));
  const demandBranches = new Set(branchCodes || lines.filter((line) => line.source === 'DEMAND' && line.branchCode).map((line) => line.branchCode));
  let matched = 0;
  let added = 0;
  let unmatched = 0;
  let otherBranch = 0;
  let zeroAmount = 0;
  let noMembershipDate = 0;
  const nextExcluded = [...excluded];
  for (const row of rows) {
    // The import's validation result (VALID, SHORT, MEMBER NOT FOUND...).
    const { status: validation = '' } = row;
    const member = memberById.get(String(row.memberId || ''));
    const excel = excelOf(row, batchId);
    if (toPaise(excel.amount) <= 0) {
      zeroAmount += 1;
      nextExcluded.push(excludedEntry(excel, 'Amount is 0 in the Excel'));
      continue;
    }
    if (member && !hasMembershipDate(member)) {
      noMembershipDate += 1;
      nextExcluded.push(excludedEntry(excel, `Member ${String(member.code || '').toUpperCase()} has no membership date`));
      continue;
    }
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
  return { lines: withWarnings(next), excluded: nextExcluded, matched, added, unmatched, otherBranch, zeroAmount, noMembershipDate };
}

export function hasMembershipDate(member = {}) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(member.membershipDate || '').trim());
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
  OVER_DEMAND: 'More than demand',
  NO_MEMBER: 'No member',
  OVER_BALANCE: 'Cut over balance'
};

// Loan heads a recovery reduces: the cut may not pass what is still owed.
const LOAN_HEADS = [['loan', 'regularLoan', 'Regular Loan'], ['lad', 'loanAgainstDeposit', 'Loan Against Deposit']];

// A loan cut while nothing is owed, or more than is owed (empty when the
// line's outstanding is not known yet).
export function balanceErrors(line = {}) {
  if (!line.outstanding) return [];
  const heads = normalizeHeads(line.heads);
  const errors = [];
  for (const [head, key, name] of LOAN_HEADS) {
    const cut = toPaise(heads[head]);
    if (cut <= 0) continue;
    const owed = toPaise(line.outstanding[key] || 0);
    if (owed <= 0) errors.push(`${name} is fully repaid (balance 0): nothing should be cut. Edit the cut.`);
    else if (cut > owed) errors.push(`${name} cut ₹${formatRupees(fromPaise(cut))} is more than the ₹${formatRupees(fromPaise(owed))} outstanding: edit the cut.`);
  }
  return errors;
}

// What the whole draft holds, worked out once per draft array (every line's
// status asks; scanning the draft each time made a 600-line grid slow).
const draftFlagCache = new WeakMap();
function draftFlags(lines = []) {
  if (!Array.isArray(lines)) return { excel: false, demand: false };
  let flags = draftFlagCache.get(lines);
  if (!flags || flags.length !== lines.length) {
    flags = { length: lines.length, excel: lines.some((entry) => entry?.excel), demand: lines.some((entry) => entry?.source === 'DEMAND') };
    draftFlagCache.set(lines, flags);
  }
  return flags;
}

// VALID only when the heads add up exactly to the expected amount.
export function lineStatus(line = {}, lines = []) {
  if (line.unmatched) return 'NO_MEMBER';
  const excelImported = draftFlags(lines).excel;
  if (excelImported && line.source === 'DEMAND' && !line.excel) return 'NOT_IN_EXCEL';
  const expected = expectedPaise(line);
  if (expected == null || expected <= 0) return 'NO_EXPECTED';
  const heads = normalizeHeads(line.heads);
  if (UNSUPPORTED_HEADS.some(([key]) => toPaise(heads[key]) > 0)) return 'UNSUPPORTED';
  if (balanceErrors(line).length) return 'OVER_BALANCE';
  const difference = expected - lineTotalPaise(line);
  if (difference > 0 && overDemandPaise(line) > 0) return 'OVER_DEMAND';
  if (difference > 0) return 'UNDER';
  if (difference < 0) return 'OVER';
  return 'VALID';
}

// How much a line's Excel amount is over the demand it was split from
// (paise; 0 when not over, or not an Excel-fitted line).
export function overDemandPaise(line = {}) {
  if (!line.excel || line.demandAmount == null || line.demandAmount === '') return 0;
  return Math.max(0, toPaise(line.excel.amount) - toPaise(line.demandAmount));
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
  if (status === 'OVER_DEMAND') return [`Excel ₹${formatRupees(line.excel.amount)} is ₹${formatRupees(fromPaise(overDemandPaise(line)))} more than the demand ₹${formatRupees(line.demandAmount)}: put the ₹${formatRupees(lineDifference(line))} not yet allocated into a head (Edit).`];
  const difference = lineDifference(line);
  if (status === 'OVER_BALANCE') {
    const mismatch = difference === 0 ? [] : [`Expected ₹${formatRupees(fromPaise(expectedPaise(line)))}, allocated ₹${formatRupees(lineTotal(line))}: ${difference > 0 ? 'under' : 'over'} by ₹${formatRupees(Math.abs(difference))}.`];
    return [...balanceErrors(line), ...mismatch];
  }
  return [`Expected ₹${formatRupees(fromPaise(expectedPaise(line)))}, allocated ₹${formatRupees(lineTotal(line))}: ${difference > 0 ? 'under' : 'over'} by ₹${formatRupees(Math.abs(difference))}.`];
}

// Information only (never blocks Save).
export function lineNotes(line = {}, lines = []) {
  const demandLoaded = draftFlags(lines).demand;
  const notes = [];
  if (line.excel?.nameDiffers) notes.push(`Excel name "${line.excel.name}" differs from the member`);
  if (line.excel?.branchDiffers) notes.push(`Excel branch "${line.excel.branch}" differs from the member`);
  if (demandLoaded && line.source === 'EXCEL') notes.push('In the Excel, not in the loaded demand (split from the member\'s monthly demand)');
  if (line.needsReview && line.reviewNote) notes.push(line.reviewNote);
  if (line.fitNote) notes.push(line.fitNote);
  if (line.demandSource === 'MEMBER_DEMAND') notes.push(`From the member's Monthly Demand Data (${String(line.demandMonth || '').padStart(2, '0')}/${line.demandYear || ''})`);
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

// Each line with the member's loan outstanding before this recovery
// ({ CODE: { regularLoan, loanAgainstDeposit } }).
export function withOutstanding(lines = [], outstandingByCode = {}) {
  return lines.map((line) => {
    const owed = outstandingByCode[String(line.member || '').toUpperCase()];
    return owed ? { ...line, outstanding: { regularLoan: Number(owed.regularLoan || 0), loanAgainstDeposit: Number(owed.loanAgainstDeposit || 0) } } : line;
  });
}

// Edit a line's amounts (Update): provenance stays and the Excel amount never
// changes; a line with no Excel row may also set its expected amount.
export function updateLineHeads(lines = [], index, heads = {}, expectedAmount) {
  return withWarnings(lines.map((line, i) => {
    if (i !== index) return line;
    const next = { ...line, heads: { ...normalizeHeads(line.heads), ...heads }, needsReview: false, reviewNote: '', fitNote: '' };
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

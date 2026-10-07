// Demand Entry draft: a demand list header (FY, branch, month, year, list no,
// date) and one line per member with the demand heads. Share is not a demand
// head. A line's total — and the list total — are always derived from the
// heads in paise; there is no editable total. Recovered lines (collected by a
// saved recovery) are read-only here.

export const DEMAND_HEADS = [
  ['compulsoryDeposit', 'Cmp. Dep.'],
  ['specialDeposit', 'SSA'],
  ['regularLoan', 'Reg. Loan'],
  ['loanAgainstDeposit', 'LAD'],
  ['insurancePremium', 'Insurance'],
  ['other', 'Other']
];

const HEAD_KEYS = DEMAND_HEADS.map(([key]) => key);

export const MONTH_OPTIONS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  .map((label, index) => ({ label, value: String(index + 1) }));

export function toPaise(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

export function fromPaise(paise) {
  return Math.round(paise) / 100;
}

export function demandLineTotal(line = {}) {
  return fromPaise(HEAD_KEYS.reduce((sum, key) => sum + toPaise(line[key]), 0));
}

export function demandTotals(lines = []) {
  const paise = Object.fromEntries(HEAD_KEYS.map((key) => [key, 0]));
  for (const line of lines) for (const key of HEAD_KEYS) paise[key] += toPaise(line[key]);
  return {
    heads: Object.fromEntries(HEAD_KEYS.map((key) => [key, fromPaise(paise[key])])),
    total: fromPaise(HEAD_KEYS.reduce((sum, key) => sum + paise[key], 0))
  };
}

export const isRecoveredLine = (line = {}) => String(line.recoveryStatus || '').toUpperCase() === 'RECOVERED';

// A new list defaults to the next list number and the current month of the FY.
export function emptyDemandDraft(fy = null, entries = []) {
  const numbers = entries.map((entry) => Number(entry.demandListNo)).filter(Number.isFinite);
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const date = fy?.start && fy?.end ? (iso < fy.start ? fy.start : iso > fy.end ? fy.end : iso) : iso;
  return {
    demandListNo: numbers.length ? String(Math.max(...numbers) + 1) : '',
    demandListDate: date,
    branchCode: '',
    month: String(Number(date.slice(5, 7))),
    year: date.slice(0, 4),
    remarks: '',
    lines: []
  };
}

export function draftFromEntry(entry = {}) {
  return {
    demandListNo: entry.demandListNo || '',
    demandListDate: entry.demandListDate || '',
    branchCode: entry.branchCode || '',
    month: entry.month ? String(entry.month) : '',
    year: entry.year || '',
    remarks: entry.remarks || '',
    lines: (entry.lines || []).map((line) => ({ ...line }))
  };
}

// Load Members: adds the branch's members not already in the grid, with their
// configured demand split; existing lines (and recovered ones) are kept.
export function mergeLoadedMembers(lines = [], loaded = []) {
  const present = new Set(lines.map((line) => String(line.memberCode).toUpperCase()));
  const added = loaded
    .filter((member) => !present.has(String(member.memberCode).toUpperCase()))
    .map((member) => ({
      memberCode: member.memberCode,
      memberName: member.memberName || '',
      designation: member.designation || '',
      ...Object.fromEntries(HEAD_KEYS.map((key) => [key, Number(member[key] || 0) || ''])),
      recoveryStatus: 'PENDING'
    }));
  return { lines: [...lines, ...added], added: added.length };
}

export function updateDemandLine(lines = [], index, key, value) {
  return lines.map((line, i) => (i === index && !isRecoveredLine(line) ? { ...line, [key]: value } : line));
}

export function removeDemandLine(lines = [], index) {
  return lines.filter((line, i) => i !== index || isRecoveredLine(line));
}

// What the server takes: header + member heads. Totals are derived there too.
export function buildDemandEntryPayload(draft = {}, fy = null) {
  return {
    demandListNo: String(draft.demandListNo || '').trim(),
    demandListDate: draft.demandListDate || '',
    branchCode: String(draft.branchCode || '').trim(),
    month: draft.month,
    year: String(draft.year || '').trim(),
    remarks: draft.remarks || '',
    fyCode: fy?.code || fy?.label || '',
    lines: (draft.lines || []).map((line) => ({
      memberCode: line.memberCode,
      ...Object.fromEntries(HEAD_KEYS.map((key) => [key, toPaise(line[key]) / 100]))
    }))
  };
}

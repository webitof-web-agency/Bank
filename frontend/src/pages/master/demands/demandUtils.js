function toString(value) {
  return String(value ?? '').trim();
}

function toUpper(value) {
  return toString(value).toUpperCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEMAND_STATUS_OPTIONS = ['Pending', 'Partially Recovered', 'Recovered'];

export function buildNextDemandNo(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const value = toUpper(row?.demandNo);
    const match = value.match(/^DM(\d+)$/);
    if (!match) continue;
    const number = Number(match[1]);
    if (Number.isFinite(number) && number > maxNumber) {
      maxNumber = number;
    }
  }

  return `DM${String(maxNumber + 1).padStart(2, '0')}`;
}

export function createEmptyDemandDraft(rows = []) {
  return {
    demandNo: buildNextDemandNo(rows),
    month: '',
    branchCode: '',
    memberCode: '',
    dueDate: '',
    total: '',
    recovered: '',
    status: 'Pending',
    remarks: ''
  };
}

export function createDemandDraftFromRecord(record = {}) {
  return {
    demandNo: toString(record.demandNo),
    month: toString(record.month),
    branchCode: toString(record.branchCode),
    memberCode: toString(record.memberCode),
    dueDate: toString(record.dueDate),
    total: record.total ?? '',
    recovered: record.recovered ?? '',
    status: toString(record.status) || 'Pending',
    remarks: toString(record.remarks)
  };
}

export function buildDemandPayload(draft = {}) {
  return {
    demandNo: toUpper(draft.demandNo) || undefined,
    month: toString(draft.month),
    branchCode: toUpper(draft.branchCode),
    memberCode: toUpper(draft.memberCode),
    dueDate: toString(draft.dueDate),
    total: draft.total === '' || draft.total === null || draft.total === undefined ? undefined : toNumber(draft.total, 0),
    recovered: draft.recovered === '' || draft.recovered === null || draft.recovered === undefined ? undefined : toNumber(draft.recovered, 0),
    status: toString(draft.status) || 'Pending',
    remarks: toString(draft.remarks)
  };
}

export function formatMoney(value) {
  const amount = toNumber(value, 0);
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

export function getBranchLabel(branch) {
  if (!branch) return '';
  return `${branch.code || ''}${branch.label ? ` - ${branch.label}` : ''}`.trim();
}

export function getMemberLabel(member) {
  if (!member) return '';
  return `${member.code || ''}${member.name ? ` - ${member.name}` : ''}`.trim();
}


function toString(value) {
  return String(value ?? '').trim();
}

function toUpper(value) {
  return toString(value).toUpperCase();
}

export const NO_INTEREST_STATUS_OPTIONS = ['Active', 'Inactive'];

export function buildNextNoInterestMemberCode(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = toUpper(row?.code);
    const match = code.match(/^NI(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `NI${String(maxNumber + 1).padStart(3, '0')}`;
}

export function createEmptyNoInterestMemberDraft(rows = []) {
  return {
    code: buildNextNoInterestMemberCode(rows),
    memberCode: '',
    branchCode: '',
    designation: '',
    reason: '',
    fromDate: '',
    toDate: '',
    status: 'Active',
    payload: {}
  };
}

export function createNoInterestMemberDraftFromRecord(record = {}) {
  const payload = record.payload || {};
  return {
    code: toString(record.code),
    memberCode: toString(record.memberCode),
    branchCode: toString(record.branchCode || payload.branchCode),
    designation: toString(record.designation || payload.designation),
    reason: toString(record.reason),
    fromDate: toString(record.fromDate),
    toDate: toString(record.toDate),
    status: toString(record.status) || 'Active',
    payload
  };
}

export function buildNoInterestMemberPayload(draft = {}) {
  return {
    code: toUpper(draft.code) || undefined,
    memberCode: toUpper(draft.memberCode),
    reason: toString(draft.reason),
    fromDate: toString(draft.fromDate),
    toDate: toString(draft.toDate),
    status: toString(draft.status) || 'Active',
    payload: {
      ...(draft.payload || {}),
      branchCode: toString(draft.branchCode),
      designation: toString(draft.designation)
    }
  };
}

export function getMemberLabel(member) {
  if (!member) return '';
  return `${member.code || ''}${member.name ? ` - ${member.name}` : ''}`.trim();
}

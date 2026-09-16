function toString(value) {
  return String(value ?? '').trim();
}

function toUpper(value) {
  return toString(value).toUpperCase();
}

function getDefaultHeadOfficeCode(rows = []) {
  for (const row of Array.isArray(rows) ? rows : []) {
    const code = toUpper(row?.headOfficeCode);
    if (code) {
      return code;
    }
  }
  return 'HO01';
}

// Plain numeric, auto-incrementing — matches the real migrated branch codes
// (e.g. "59", "77"), which never had a "BR" prefix.
export function buildNextBranchCode(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const value = Number(toUpper(row?.code));
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return String(maxNumber + 1);
}

export function createEmptyBranchDraft(rows = []) {
  return {
    code: buildNextBranchCode(rows),
    headOfficeCode: getDefaultHeadOfficeCode(rows),
    label: '',
    place: '',
    address: '',
    district: '',
    phone: '',
    isActive: true
  };
}

export function createBranchDraftFromRecord(record = {}) {
  return {
    code: toString(record.code),
    headOfficeCode: toString(record.headOfficeCode) || 'HO01',
    label: toString(record.label),
    place: toString(record.place),
    address: toString(record.address),
    district: toString(record.district),
    phone: toString(record.phone),
    isActive: record.isActive !== false
  };
}

export function buildBranchPayload(draft = {}) {
  return {
    code: toUpper(draft.code) || undefined,
    headOfficeCode: toUpper(draft.headOfficeCode) || undefined,
    label: toString(draft.label),
    place: toString(draft.place),
    address: toString(draft.address),
    district: toString(draft.district),
    phone: toString(draft.phone),
    isActive: draft.isActive !== false
  };
}

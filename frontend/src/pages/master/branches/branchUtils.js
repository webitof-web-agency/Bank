function toString(value) {
  return String(value ?? '').trim();
}

function toUpper(value) {
  return toString(value).toUpperCase();
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
    isHeadOffice: false,
    headOfficeCode: '',
    label: '',
    address: '',
    district: '',
    phone: '',
    isActive: true
  };
}

export function createBranchDraftFromRecord(record = {}) {
  return {
    code: toString(record.code),
    isHeadOffice: record.isHeadOffice === true,
    // Legacy rows hold "0" for "no head office".
    headOfficeCode: toString(record.headOfficeCode) === '0' ? '' : toString(record.headOfficeCode),
    label: toString(record.label),
    address: toString(record.address),
    district: toString(record.district),
    phone: toString(record.phone),
    isActive: record.isActive !== false
  };
}

export function buildBranchPayload(draft = {}) {
  return {
    code: toUpper(draft.code) || undefined,
    isHeadOffice: Boolean(draft.isHeadOffice),
    // A head office belongs to no other head office.
    headOfficeCode: draft.isHeadOffice ? '' : toUpper(draft.headOfficeCode),
    label: toString(draft.label),
    address: toString(draft.address),
    district: toString(draft.district),
    phone: toString(draft.phone),
    isActive: draft.isActive !== false
  };
}

// "12 - SADAR BAZAR": a branch as shown in pickers and lists.
export function branchDisplayName(branch = {}) {
  return [toString(branch.code), toString(branch.label)].filter(Boolean).join(' - ');
}

function toString(value) {
  return String(value ?? '').trim();
}

function toUpper(value) {
  return toString(value).toUpperCase();
}

export function buildNextBranchCode(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = toUpper(row?.code);
    const match = code.match(/^BR(\d+)$/);
    if (!match) continue;
    const number = Number(match[1]);
    if (Number.isFinite(number) && number > maxNumber) {
      maxNumber = number;
    }
  }

  return `BR${String(maxNumber + 1).padStart(2, '0')}`;
}

export function createEmptyBranchDraft(rows = []) {
  return {
    code: buildNextBranchCode(rows),
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
    label: toString(draft.label),
    place: toString(draft.place),
    address: toString(draft.address),
    district: toString(draft.district),
    phone: toString(draft.phone),
    isActive: draft.isActive !== false
  };
}


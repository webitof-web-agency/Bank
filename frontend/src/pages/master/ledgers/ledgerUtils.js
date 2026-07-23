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

export const LEDGER_NATURE_OPTIONS = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'];
export const LEDGER_SIDE_OPTIONS = ['DR', 'CR'];

export function buildNextLedgerCode(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = toUpper(row?.code);
    const match = code.match(/^L(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `L${String(maxNumber + 1).padStart(3, '0')}`;
}

export function createEmptyLedgerDraft(rows = []) {
  return {
    code: buildNextLedgerCode(rows),
    name: '',
    nature: 'ASSET',
    group: 'GENERAL',
    openingBalance: '',
    balanceSide: 'DR',
    isBankAccount: false,
    isActive: true
  };
}

export function createLedgerDraftFromRecord(record = {}) {
  return {
    code: toString(record.code),
    name: toString(record.name),
    nature: toUpper(record.nature) || 'ASSET',
    group: toString(record.group) || 'GENERAL',
    openingBalance: record.openingBalance ?? '',
    balanceSide: toUpper(record.balanceSide) || 'DR',
    isBankAccount: Boolean(record.isBankAccount),
    isActive: record.isActive !== false
  };
}

export function buildLedgerPayload(draft = {}) {
  return {
    code: toUpper(draft.code) || undefined,
    name: toString(draft.name),
    nature: toUpper(draft.nature) || 'ASSET',
    group: toString(draft.group) || 'GENERAL',
    openingBalance: draft.openingBalance === '' || draft.openingBalance === null || draft.openingBalance === undefined
      ? undefined
      : toNumber(draft.openingBalance, 0),
    balanceSide: toUpper(draft.balanceSide) || 'DR',
    isBankAccount: Boolean(draft.isBankAccount),
    isActive: draft.isActive !== false
  };
}

export function formatMoney(value) {
  const amount = toNumber(value, 0);
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}


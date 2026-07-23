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

export const BANK_ACCOUNT_TYPE_OPTIONS = ['Current', 'Saving', 'OD', 'Cash'];
export const BANK_ACCOUNT_STATUS_OPTIONS = ['Active', 'Inactive'];

export function buildNextBankAccountCode(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = toUpper(row?.code);
    const match = code.match(/^BA(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `BA${String(maxNumber + 1).padStart(3, '0')}`;
}

export function createEmptyBankAccountDraft(rows = []) {
  return {
    code: buildNextBankAccountCode(rows),
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    ifsc: '',
    branch: '',
    accountType: 'Current',
    upiId: '',
    openingBalance: '',
    currentBalance: '',
    isPrimary: false,
    linkedLedgerCode: '',
    status: 'Active'
  };
}

export function createBankAccountDraftFromRecord(record = {}) {
  return {
    code: toString(record.code),
    bankName: toString(record.bankName),
    accountHolderName: toString(record.accountHolderName),
    accountNumber: toString(record.accountNumber),
    ifsc: toString(record.ifsc),
    branch: toString(record.branch),
    accountType: toString(record.accountType) || 'Current',
    upiId: toString(record.upiId),
    openingBalance: record.openingBalance ?? '',
    currentBalance: record.currentBalance ?? '',
    isPrimary: Boolean(record.isPrimary),
    linkedLedgerCode: toString(record.linkedLedgerCode),
    status: toString(record.status) || 'Active'
  };
}

export function buildBankAccountPayload(draft = {}) {
  const openingBalance = draft.openingBalance === '' || draft.openingBalance === null || draft.openingBalance === undefined
    ? undefined
    : toNumber(draft.openingBalance, 0);
  const currentBalance = draft.currentBalance === '' || draft.currentBalance === null || draft.currentBalance === undefined
    ? openingBalance
    : toNumber(draft.currentBalance, 0);

  return {
    code: toUpper(draft.code) || undefined,
    bankName: toString(draft.bankName),
    accountHolderName: toString(draft.accountHolderName),
    accountNumber: toString(draft.accountNumber),
    ifsc: toString(draft.ifsc),
    branch: toString(draft.branch),
    accountType: toString(draft.accountType) || 'Current',
    upiId: toString(draft.upiId),
    openingBalance,
    currentBalance,
    isPrimary: Boolean(draft.isPrimary),
    linkedLedgerCode: toUpper(draft.linkedLedgerCode),
    status: toString(draft.status) || 'Active'
  };
}

export function formatMoney(value) {
  const amount = toNumber(value, 0);
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

export function getLedgerLabel(ledger) {
  if (!ledger) return '';
  return `${ledger.code || ''}${ledger.name ? ` - ${ledger.name}` : ''}`.trim();
}


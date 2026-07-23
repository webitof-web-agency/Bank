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

export function buildNextRateCode(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = toUpper(row?.code);
    const match = code.match(/^R(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `R${String(maxNumber + 1).padStart(2, '0')}`;
}

export function createEmptyRateDraft(rows = []) {
  return {
    code: buildNextRateCode(rows),
    ledgerCode: '',
    ledgerName: '',
    category: 'Interest Rate',
    value: '',
    effectiveFrom: ''
  };
}

export function createRateDraftFromRecord(record = {}) {
  return {
    code: toString(record.code),
    ledgerCode: toString(record.ledgerCode),
    ledgerName: toString(record.ledgerName),
    category: toString(record.category) || 'Interest Rate',
    value: record.value ?? '',
    effectiveFrom: toString(record.effectiveFrom)
  };
}

export function buildRatePayload(draft = {}) {
  return {
    code: toUpper(draft.code) || undefined,
    ledgerCode: toUpper(draft.ledgerCode),
    ledgerName: toString(draft.ledgerName),
    category: toString(draft.category),
    value: draft.value === '' || draft.value === null || draft.value === undefined
      ? undefined
      : toNumber(draft.value, 0),
    effectiveFrom: toString(draft.effectiveFrom)
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


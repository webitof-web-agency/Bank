// Journal Voucher draft <-> payload. Pure, so the balancing rule is testable.

let nextKey = 1;
const lineKey = () => `line-${nextKey++}`;

function emptyLine() {
  return { key: lineKey(), ledgerCode: '', debit: '', credit: '' };
}

export function emptyJournalDraft() {
  return { date: new Date().toISOString().slice(0, 10), narration: '', lines: [emptyLine(), emptyLine()] };
}

export function journalDraftFromRecord(record = {}) {
  const lines = (record.details?.journalLines || []).map((line) => ({
    key: lineKey(),
    ledgerCode: String(line.ledgerCode || ''),
    debit: Number(line.debit) ? String(line.debit) : '',
    credit: Number(line.credit) ? String(line.credit) : ''
  }));
  while (lines.length < 2) lines.push(emptyLine());
  return { date: record.date || '', narration: record.narration || '', lines };
}

const paise = (value) => Math.round((Number(value) || 0) * 100);

// Totals in rupees; balanced when debit and credit agree to the paisa.
export function journalTotals(lines = []) {
  const debit = lines.reduce((total, line) => total + paise(line.debit), 0);
  const credit = lines.reduce((total, line) => total + paise(line.credit), 0);
  const complete = lines.filter((line) => paise(line.debit) || paise(line.credit)).every((line) => line.ledgerCode);
  return { debit: debit / 100, credit: credit / 100, balanced: debit === credit && complete };
}

export function journalPayload(draft = {}) {
  const journalLines = (draft.lines || [])
    .filter((line) => line.ledgerCode && (paise(line.debit) || paise(line.credit)))
    .map((line) => ({ ledgerCode: line.ledgerCode, debit: paise(line.debit) / 100, credit: paise(line.credit) / 100 }));
  return {
    date: draft.date,
    narration: draft.narration,
    partyType: 'ledger',
    details: { key: 'journal-voucher', journalLines }
  };
}

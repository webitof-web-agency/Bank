// Financial Year Closing page: labels and the appropriation arithmetic.
// Pure functions, so the rules can be tested without rendering the page.

export const INTEREST_HEAD_LABELS = {
  cd: 'Compulsory Deposit interest (paid to members)',
  ssa: 'Special Saving interest (paid to members)',
  loan: 'Members loan interest (charged)',
  dloan: 'Loan against deposit interest (charged)',
  housing: 'Staff housing loan interest',
  vehicle: 'Staff vehicle loan interest'
};

const paise = (value) => Math.round((Number(value) || 0) * 100);

export function formatAmount(value) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

// The profit the appropriation must clear: with or without staff interest.
export function profitToAppropriate(preview, includeEmployeeInterest) {
  if (!preview) return 0;
  return includeEmployeeInterest ? Number(preview.profitWithEmployeeInterest || 0) : Number(preview.profitAfterInterest || 0);
}

// rows: [{ ledgerCode, amount }]. Remaining = profit - allocated (rupees);
// done when it is zero to the paisa and every amount has a fund.
export function appropriationState(rows = [], profit = 0) {
  const filled = rows.filter((row) => paise(row.amount));
  const allocated = filled.reduce((total, row) => total + paise(row.amount), 0);
  const remaining = paise(profit) - allocated;
  const missingFund = filled.some((row) => !row.ledgerCode);
  const duplicate = new Set(filled.map((row) => row.ledgerCode)).size !== filled.length;
  return {
    allocated: allocated / 100,
    remaining: remaining / 100,
    balanced: remaining === 0 && !missingFund && !duplicate,
    missingFund,
    duplicate
  };
}

export function appropriationPayload(rows = []) {
  return rows
    .filter((row) => row.ledgerCode && paise(row.amount))
    .map((row) => ({ ledgerCode: row.ledgerCode, amount: paise(row.amount) / 100 }));
}

export function yearStatusLabel(year = {}) {
  if (year.source === 'legacy') return 'Closed in old software';
  return year.status === 'CLOSED' ? 'Closed' : 'Open';
}

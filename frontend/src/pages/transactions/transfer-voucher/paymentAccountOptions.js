// Transfer Voucher -> Payment: the only accounts money can be paid from.
// Found by the ledgers' accounting roles, not by hardcoded codes, so the
// options follow whatever codes the migrated ledgers carry (2/3/4 today).
export const TRANSFER_VOUCHER_PAID_FROM_ROLES = [
  { role: 'CASH', label: 'Cash-in-hand' },
  { role: 'BANK_SAVING', label: 'Bank Saving A/c' },
  { role: 'BANK_CC', label: 'Cash Credit A/c' }
];

export function buildPaidFromOptions(ledgers = []) {
  const list = Array.isArray(ledgers) ? ledgers : [];
  return TRANSFER_VOUCHER_PAID_FROM_ROLES
    .map(({ role, label }) => {
      const ledger = list.find((row) => String(row?.semanticRole || '').toUpperCase() === role);
      return ledger ? { value: String(ledger.code), label } : null;
    })
    .filter(Boolean);
}

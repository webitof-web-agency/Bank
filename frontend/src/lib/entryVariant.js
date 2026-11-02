// Entry-form colours of the original desktop software, by transaction key:
// pink for amounts paid out, green for amounts received, a very subtle green
// for Recovery From Member, white / off-white for masters and supporting
// entries. One map for the whole app: Modal (variant), the archived voucher
// editor and AddEntryButton read it, so Add and Edit always match.
export const ENTRY_VARIANT_BY_KEY = {
  // Member
  'loan-paid-member': 'pink',
  'deposit-paid-member': 'pink',
  'ssa-paid-member': 'pink',
  'insurance-paid-member': 'pink',
  'recovery-member': 'mint',
  // Bank
  'loan-recv-cash': 'green',
  'loan-recv-saving': 'pink',
  'deposit-in-bank': 'pink',
  'cheque-issue-saving': 'green',
  'cheque-issue-loan': 'green',
  'transfer-saving': 'green',
  'transfer-cashcredit': 'pink',
  // Employee
  'advance-paid-emp': 'pink',
  'advance-recovery-emp': 'green',
  // Transfer Voucher
  'transfer-voucher-paid': 'pink',
  'transfer-voucher-recover': 'green',
  'transfer-voucher-payment': 'pink',
  'transfer-voucher-receipt': 'green',
  // Receipt / Interest / Other
  'payment-voucher': 'pink',
  'receipt-voucher': 'green',
  'interest-paid-member': 'pink',
  // Not in the original colour list: receipts are green.
  'interest-recv-member': 'green',
  'interest-recv-employee': 'green',
  'journal-voucher': 'neutral',
  'no-interest-members': 'neutral',
  'demand-entry': 'neutral'
};

export const ENTRY_VARIANTS = ['pink', 'green', 'mint', 'neutral'];

// The variant for a transaction key (or a voucher record / draft carrying
// details.key); anything unknown — masters included — is neutral.
export function entryVariantFor(source) {
  const key = typeof source === 'string'
    ? source
    : source?.details?.key || source?.key || '';
  return ENTRY_VARIANT_BY_KEY[String(key || '').trim().toLowerCase()] || 'neutral';
}

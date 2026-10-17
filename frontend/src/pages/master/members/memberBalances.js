// Current / Opening Balances on the member form: what the member has or owes.
// Every head is a positive amount; loans are the amount outstanding (the
// server stores them with the ledger's own signs). A separate thing from the
// Monthly Demand Data (memberDemand.js): neither is copied into the other.
// A migrated member's opening comes from the legacy books and is read-only.

import { demandAmountError } from './memberDemand.js';

export const MEMBER_OPENING_FIELDS = [
  ['share', 'Share'],
  ['compulsoryDeposit', 'Compulsory Deposit'],
  ['specialDeposit', 'Special Saving / SSA'],
  ['regularLoan', 'Regular Loan Outstanding'],
  ['loanAgainstDeposit', 'Loan Against Deposit Outstanding'],
  ['insurancePremium', 'Insurance Premium'],
  ['providentFund', 'Provident Fund']
];

// Heads the member ledger tracks: the current balance is shown beside them.
export const LEDGER_TRACKED_HEADS = new Set(['share', 'compulsoryDeposit', 'specialDeposit', 'regularLoan', 'loanAgainstDeposit']);

const KEYS = MEMBER_OPENING_FIELDS.map(([key]) => key);

export function emptyOpeningBalances() {
  return Object.fromEntries(KEYS.map((key) => [key, '']));
}

export function openingBalancesFromRecord(record = {}) {
  const source = record?.openingBalances || {};
  return Object.fromEntries(KEYS.map((key) => [key, Number(source[key]) ? Number(source[key]) : '']));
}

export function openingBalancesErrors(values = {}) {
  return MEMBER_OPENING_FIELDS
    .map(([key, label]) => (demandAmountError(values[key]) ? label : ''))
    .filter(Boolean);
}

// What Save sends (blank = 0). Locked (migrated) members send nothing.
export function buildOpeningBalancesPayload(values = {}, { locked = false } = {}) {
  if (locked) return undefined;
  return Object.fromEntries(KEYS.map((key) => {
    const number = Number(String(values[key] ?? '').trim() || 0);
    return [key, Number.isFinite(number) ? number : 0];
  }));
}

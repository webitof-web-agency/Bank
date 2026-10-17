// Monthly Demand Data on the member form: the amounts normally recovered
// from the member each month (member_demand_defaults). They are a separate
// thing from the member's balances (what the member has or owes): neither
// is ever copied into the other. Demand Entry copies these into a month's
// demand lines. Share is not a monthly demand head; the total is derived.

import { DEMAND_HEADS, demandLineTotal } from '../../transactions/other/demand-entry/demandEntryDraft.js';

export const MEMBER_DEMAND_FIELDS = [
  ['compulsoryDeposit', 'Compulsory Deposit'],
  ['specialDeposit', 'Special Saving / SSA'],
  ['regularLoan', 'Regular Loan'],
  ['loanAgainstDeposit', 'Loan Against Deposit'],
  ['insurancePremium', 'Insurance Premium'],
  ['other', 'Other']
];

const KEYS = DEMAND_HEADS.map(([key]) => key);

export function emptyDemandDefaults() {
  return Object.fromEntries(KEYS.map((key) => [key, '']));
}

// From a member record's demandDefaults (blank where nil).
export function demandDefaultsFromRecord(record = {}) {
  const source = record?.demandDefaults || {};
  return Object.fromEntries(KEYS.map((key) => [key, Number(source[key]) ? Number(source[key]) : '']));
}

export function demandDefaultsTotal(values = {}) {
  return demandLineTotal(values);
}

// "" if the amount is fine, else what is wrong with it.
export function demandAmountError(value) {
  const text = value == null ? '' : String(value).trim();
  if (!text) return '';
  return /^\d+(\.\d{1,2})?$/.test(text) ? '' : 'Enter 0 or more, at most 2 decimals';
}

export function demandDefaultsErrors(values = {}) {
  return MEMBER_DEMAND_FIELDS
    .map(([key, label]) => (demandAmountError(values[key]) ? label : ''))
    .filter(Boolean);
}

// What Save sends: each head as a number (blank = 0). No total: the server
// derives it.
export function buildDemandDefaultsPayload(values = {}) {
  return Object.fromEntries(KEYS.map((key) => {
    const number = Number(String(values[key] ?? '').trim() || 0);
    return [key, Number.isFinite(number) ? number : 0];
  }));
}

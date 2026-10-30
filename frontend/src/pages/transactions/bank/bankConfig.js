import { Banknote, Landmark, FileText, Repeat2, ChevronDown, ExternalLink, Plus } from 'lucide-react';

export const BANK_TRANSACTION_TYPES = [
  {
    key: 'loan-recv-cash',
    slug: 'loan-recv-cash',
    label: 'Loan Receive By Cash-Credit A/c',
    description: 'The society draws on its bank cash credit (legacy Loan Receive By CCA).',
    tone: 'emerald',
    icon: Banknote
  },
  {
    key: 'loan-recv-saving',
    slug: 'loan-recv-saving',
    label: 'Loan Receive To Saving A/c',
    description: 'A loan received into the bank saving account (legacy Loan Receive To SA).',
    tone: 'emerald',
    icon: Landmark
  },
  {
    key: 'deposit-in-bank',
    slug: 'deposit-in-bank',
    label: 'Deposit In Bank',
    description: 'Cash or a cheque / DD deposited into the saving or cash-credit account.',
    tone: 'amber',
    icon: FileText
  },
  {
    key: 'cheque-issue-saving',
    slug: 'cheque-issue-saving',
    label: 'Cheque Issue With Bank',
    description: 'A cheque issued from the bank saving account (legacy Cheque Issue By SA).',
    tone: 'pink',
    icon: FileText
  },
  {
    key: 'cheque-issue-loan',
    slug: 'cheque-issue-loan',
    label: 'Cheque Issue With Bank (Loan A/c)',
    description: 'Dedicated workspace for cheque issue against loan account.',
    tone: 'pink',
    icon: FileText
  },
  {
    key: 'transfer-saving',
    slug: 'transfer-saving',
    label: 'Amount Transfer By Saving A/c',
    description: 'Money transferred out of the bank saving account (legacy Amount Transfer By SA).',
    tone: 'amber',
    icon: Repeat2
  },
  {
    key: 'transfer-cashcredit',
    slug: 'transfer-cashcredit',
    label: 'Amount Transfer To Cash-Credit A/c',
    description: 'Money paid into the bank cash-credit account (legacy Amount Transfer To CCA).',
    tone: 'amber',
    icon: Repeat2
  }
];

export function getBankTransactionTypeByKey(key = '') {
  const normalized = String(key || '').trim().toLowerCase();
  return BANK_TRANSACTION_TYPES.find((item) => item.key === normalized) || null;
}

export function getBankTransactionTypeBySlug(slug = '') {
  const normalized = String(slug || '').trim().toLowerCase();
  return BANK_TRANSACTION_TYPES.find((item) => item.slug === normalized) || null;
}

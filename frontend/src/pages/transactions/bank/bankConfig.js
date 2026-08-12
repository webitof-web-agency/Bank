import { Banknote, Landmark, FileText, Repeat2, ChevronDown, ExternalLink, Plus } from 'lucide-react';

export const BANK_TRANSACTION_TYPES = [
  {
    key: 'loan-recv-cash',
    slug: 'loan-recv-cash',
    label: 'Loan Received to Cash/Credit A/c',
    description: 'Dedicated workspace for loan receipt through cash or credit.',
    tone: 'emerald',
    icon: Banknote
  },
  {
    key: 'loan-recv-saving',
    slug: 'loan-recv-saving',
    label: 'Loan Received to Saving A/c',
    description: 'Dedicated workspace for loan receipt into saving account.',
    tone: 'emerald',
    icon: Landmark
  },
  {
    key: 'deposit-in-bank',
    slug: 'deposit-in-bank',
    label: 'Deposit in Bank',
    description: 'Dedicated workspace for bank deposit entries.',
    tone: 'amber',
    icon: FileText
  },
  {
    key: 'cheque-issue-saving',
    slug: 'cheque-issue-saving',
    label: 'Cheque Issue With Bank (Saving A/c)',
    description: 'Dedicated workspace for cheque issue against saving account.',
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
    label: 'Amount Transfer to Saving A/c',
    description: 'Dedicated workspace for fund transfer to saving account.',
    tone: 'amber',
    icon: Repeat2
  },
  {
    key: 'transfer-cashcredit',
    slug: 'transfer-cashcredit',
    label: 'Amount Transfer to Cash-Credit A/c',
    description: 'Dedicated workspace for fund transfer to cash-credit account.',
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

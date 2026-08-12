import { Banknote, FileText, Repeat2, WalletCards } from 'lucide-react';

export const MEMBER_TRANSACTION_TYPES = [
  {
    key: 'loan-paid-member',
    slug: 'loan-paid',
    label: 'Loan Paid to Member',
    description: 'Dedicated workspace for member loan disbursement entries.',
    tone: 'pink',
    icon: Banknote
  },
  {
    key: 'deposit-paid-member',
    slug: 'deposit-paid',
    label: 'Compulsory Deposit Paid to Member',
    description: 'Dedicated workspace for compulsory deposit payout entries.',
    tone: 'pink',
    icon: WalletCards
  },
  {
    key: 'insurance-paid-member',
    slug: 'insurance-paid',
    label: 'Insurance Premium Paid to Member',
    description: 'Dedicated workspace for insurance payout entries.',
    tone: 'pink',
    icon: FileText
  },
  {
    key: 'ssa-paid-member',
    slug: 'ssa-paid',
    label: 'SSA Paid To Member',
    description: 'Dedicated workspace for SSA payout entries.',
    tone: 'pink',
    icon: WalletCards
  },
  {
    key: 'recovery-member',
    slug: 'recovery',
    label: 'Recovery From Member',
    description: 'Dedicated workspace for member recovery entries.',
    tone: 'emerald',
    icon: Repeat2
  }
];

export function getMemberTransactionTypeByKey(key = '') {
  const normalized = String(key || '').trim().toLowerCase();
  return MEMBER_TRANSACTION_TYPES.find((item) => item.key === normalized) || null;
}

export function getMemberTransactionTypeBySlug(slug = '') {
  const normalized = String(slug || '').trim().toLowerCase();
  return MEMBER_TRANSACTION_TYPES.find((item) => item.slug === normalized) || null;
}

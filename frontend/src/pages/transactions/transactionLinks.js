import { Banknote, FileText, Landmark, ReceiptText, Repeat2, Users } from 'lucide-react';

export const TRANSACTION_SECTIONS = [
  {
    key: 'member',
    label: 'Member',
    path: '/app/transactions/member',
    icon: Users,
    permission: 'transactions.read',
    description: 'Loan paid, compulsory deposit, insurance, and recovery transactions.',
    tone: 'pink'
  },
  {
    key: 'bank',
    label: 'Bank',
    path: '/app/transactions/bank',
    icon: Landmark,
    permission: 'bank-transactions.read',
    description: 'Loan receipt, deposit, cheque issue, and transfer entries.',
    tone: 'emerald'
  },
  {
    key: 'employee',
    label: 'Employee',
    path: '/app/transactions/employee',
    icon: Banknote,
    permission: 'transactions.read',
    description: 'Advance paid and recovery entries for employees.',
    tone: 'amber'
  },
  {
    key: 'transfer-voucher',
    label: 'Transfer Voucher',
    path: '/app/transactions/transfer-voucher',
    icon: Repeat2,
    permission: 'transactions.read',
    description: 'Transfer voucher paid and recovered from member records.',
    tone: 'violet'
  },
  {
    key: 'receipt-interest',
    label: 'Receipt / Interest',
    path: '/app/transactions/receipt-interest',
    icon: ReceiptText,
    permission: ['transactions.read', 'no-interest-members.read'],
    description: 'Receipt, interest paid, and related member support links.',
    tone: 'sky'
  },
  {
    key: 'supporting',
    label: 'Supporting',
    path: '/app/transactions/supporting',
    icon: FileText,
    permission: ['transactions.read', 'demands.read'],
    description: 'Payment and demand entry helper screens.',
    tone: 'slate'
  }
];

export const TRANSACTION_LINKS = TRANSACTION_SECTIONS.map(({ key, ...item }) => ({
  ...item,
  group: 'Transactions'
}));

export const TRANSACTION_SECTION_MAP = TRANSACTION_SECTIONS.reduce((acc, section) => {
  acc[section.key] = section;
  return acc;
}, {});

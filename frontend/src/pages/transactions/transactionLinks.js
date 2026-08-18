import { Banknote, FileText, Landmark, ReceiptText, Repeat2, Users } from 'lucide-react';

export const TRANSACTION_SECTIONS = [
  {
    key: 'member',
    label: 'Member',
    icon: Users,
    permission: 'transactions.member.view',
    description: 'Dedicated loan paid, compulsory deposit, insurance, and recovery workspaces.',
    tone: 'pink',
    children: [
      { label: 'Loan Payment', path: '/app/transactions/member/loan-paid', icon: Banknote },
      { label: 'CD Payment', path: '/app/transactions/member/deposit-paid', icon: ReceiptText },
      { label: 'SSA Payment', path: '/app/transactions/member/ssa-paid', icon: Banknote },
      { label: 'Premium Paid To Member', path: '/app/transactions/member/insurance-paid', icon: FileText },
      { label: 'Recovery', path: '/app/transactions/member/recovery', icon: Repeat2 }
    ]
  },
  {
    key: 'bank',
    label: 'Bank',
    path: '/app/transactions/bank',
    icon: Landmark,
    permission: 'transactions.bank.view',
    description: 'Loan receipt, deposit, cheque issue, and transfer entries.',
    tone: 'emerald',
    children: [
      { label: 'Loan Receive By Cash-Credit A/c', path: '/app/transactions/bank/loan-recv-cash', icon: Banknote },
      { label: 'Loan Receive To Saving A/c', path: '/app/transactions/bank/loan-recv-saving', icon: Banknote },
      { label: 'Deposit In Bank', path: '/app/transactions/bank/deposit-in-bank', icon: FileText },
      { label: 'Cheque Issue With Bank', path: '/app/transactions/bank/cheque-issue-saving', icon: FileText },
      { label: 'Amount Transfer By Saving A/c', path: '/app/transactions/bank/transfer-saving', icon: Repeat2 },
      { label: 'Amount Transfer To Cash-Credit A/c', path: '/app/transactions/bank/transfer-cashcredit', icon: Repeat2 }
    ]
  },
  {
    key: 'employee',
    label: 'Employee',
    path: '/app/transactions/employee',
    icon: Banknote,
    permission: 'transactions.employee.view',
    description: 'Advance paid and recovery entries for employees.',
    tone: 'amber',
    children: [
      { label: 'Advance Paid', path: '/app/transactions/employee/advance-paid-emp', icon: Banknote },
      { label: 'Advance Recovery', path: '/app/transactions/employee/advance-recovery-emp', icon: Repeat2 }
    ]
  },
  {
    key: 'transfer-voucher',
    label: 'Transfer Voucher',
    path: '/app/transactions/transfer-voucher',
    icon: Repeat2,
    permission: 'transactions.transfer-voucher.view',
    description: 'Transfer voucher paid and recovered from member records.',
    tone: 'violet',
    children: [
      { label: 'Paid To Member', path: '/app/transactions/transfer-voucher/transfer-voucher-paid', icon: Banknote },
      { label: 'Recovery From Member', path: '/app/transactions/transfer-voucher/transfer-voucher-recover', icon: Repeat2 },
      { label: 'Payment', path: '/app/transactions/transfer-voucher/payment', icon: Banknote },
      { label: 'Receipt', path: '/app/transactions/transfer-voucher/receipt', icon: ReceiptText }
    ]
  },
  {
    key: 'interest',
    label: 'Interest',
    path: '/app/transactions/interest',
    icon: ReceiptText,
    permission: 'transactions.read',
    description: 'Interest workspaces.',
    tone: 'sky',
    children: [
      { label: 'Paid To Member', path: '/app/transactions/interest/interest-paid-member', icon: Banknote },
      { label: 'Receive From Member', path: '/app/transactions/interest/interest-receive-member', icon: ReceiptText },
      { label: 'Receive From Employee', path: '/app/transactions/interest/interest-receive-employee', icon: ReceiptText }
    ]
  },
  {
    key: 'other',
    label: 'Other',
    path: '/app/transactions/other',
    icon: FileText,
    permission: 'transactions.read',
    description: 'Other transactions and special pages.',
    tone: 'slate',
    children: [
      { label: 'Payment Voucher', path: '/app/transactions/other/payment-voucher', icon: Banknote },
      { label: 'Receipt Voucher', path: '/app/transactions/other/receipt-voucher', icon: ReceiptText },
      { label: 'No Interest Members', path: '/app/transactions/other/no-interest-members', icon: Users },
      { label: 'Demand Entry', path: '/app/transactions/other/demand-entry', icon: FileText }
    ]
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

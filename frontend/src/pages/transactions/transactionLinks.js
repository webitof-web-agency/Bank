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
      { label: 'Loan Paid', path: '/app/transactions/member/loan-paid', icon: Banknote },
      { label: 'Deposit Paid', path: '/app/transactions/member/deposit-paid', icon: ReceiptText },
      { label: 'Insurance Paid', path: '/app/transactions/member/insurance-paid', icon: FileText },
      { label: 'SSA Paid', path: '/app/transactions/member/ssa-paid', icon: Banknote },
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
      { label: 'Loan Received to Cash/Credit A/c', path: '/app/transactions/bank/loan-recv-cash', icon: Banknote },
      { label: 'Loan Received to Saving A/c', path: '/app/transactions/bank/loan-recv-saving', icon: Banknote },
      { label: 'Deposit in Bank', path: '/app/transactions/bank/deposit-in-bank', icon: FileText },
      { label: 'Cheque Issue With Bank (Saving A/c)', path: '/app/transactions/bank/cheque-issue-saving', icon: FileText },
      { label: 'Cheque Issue With Bank (Loan A/c)', path: '/app/transactions/bank/cheque-issue-loan', icon: FileText },
      { label: 'Amount Transfer to Saving A/c', path: '/app/transactions/bank/transfer-saving', icon: Repeat2 },
      { label: 'Amount Transfer to Cash-Credit A/c', path: '/app/transactions/bank/transfer-cashcredit', icon: Repeat2 }
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
      { label: 'Advance Paid by Cash/Cheque', path: '/app/transactions/employee/advance-paid-emp', icon: Banknote },
      { label: 'Advance Recovery by Cash/Transfer', path: '/app/transactions/employee/advance-recovery-emp', icon: Repeat2 }
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
      { label: 'Transfer Voucher Paid to Member', path: '/app/transactions/transfer-voucher/transfer-voucher-paid', icon: Banknote },
      { label: 'Transfer Voucher Recover From Member', path: '/app/transactions/transfer-voucher/transfer-voucher-recover', icon: Repeat2 },
      { label: 'Payment', path: '/app/transactions/transfer-voucher/payment', icon: Banknote }
    ]
  },
  {
    key: 'receipt-interest',
    label: 'Receipt / Interest',
    path: '/app/transactions/receipt-interest',
    icon: ReceiptText,
    permission: 'transactions.read',
    description: 'Receipt, interest paid, and no-interest member workspaces.',
    tone: 'sky',
    children: [
      { label: 'Receipt', path: '/app/transactions/receipt-interest/receipt-voucher', icon: FileText },
      { label: 'Interest Paid to Member', path: '/app/transactions/receipt-interest/interest-paid-member', icon: Banknote },
      { label: 'No Interest Members', path: '/app/transactions/receipt-interest/no-interest-members', icon: Users }
    ]
  },
  {
    key: 'supporting',
    label: 'Supporting',
    path: '/app/transactions/supporting',
    icon: FileText,
    permission: 'transactions.supporting.view',
    description: 'Demand entry helper screens.',
    tone: 'slate',
    children: [
      { label: 'Demand Entry', path: '/app/transactions/supporting', icon: FileText }
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






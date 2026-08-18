const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../services/banking.service.js');
let code = fs.readFileSync(targetPath, 'utf8');

const newCatalog = `const TRANSACTION_CATALOG = [
  {
    key: 'member',
    label: 'Member',
    description: 'Member loan, deposit, insurance, and recovery transactions.',
    permission: 'transactions.read',
    items: [
      { key: 'loan-paid-member', label: 'Loan Paid to Member', description: 'Disburse loan amounts to members.', voucherCategory: 'Loan Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Cash / Cheque', documents: MEMBER_TRANSACTION_DOCUMENTS.loanPaidMember },
      { key: 'deposit-paid-member', label: 'Compulsory Deposit Paid to Member', description: 'Pay compulsory deposit amounts back to member accounts.', voucherCategory: 'Compulsory Deposit Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Cash / Cheque', documents: MEMBER_TRANSACTION_DOCUMENTS.depositPaidMember },
      { key: 'insurance-paid-member', label: 'Insurance Premium Paid to Member', description: 'Record insurance premium disbursement entries.', voucherCategory: 'Insurance Premium Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Cash / Cheque', documents: MEMBER_TRANSACTION_DOCUMENTS.insurancePaidMember },
      { key: 'ssa-paid-member', label: 'SSA Paid To Member', description: 'Record SSA payout entries to members.', voucherCategory: 'SSA Paid To Member', transactionType: 'payment', accent: 'pink', mode: 'Cash-in-Hand', documents: MEMBER_TRANSACTION_DOCUMENTS.ssaPaidMember },
      { key: 'recovery-member', label: 'Recovery From Member', description: 'Recover dues from member accounts.', voucherCategory: 'Recovery From Member', transactionType: 'receipt', accent: 'emerald', mode: 'Cash / Transfer', documents: MEMBER_TRANSACTION_DOCUMENTS.recoveryMember }
    ]
  },
  {
    key: 'bank',
    label: 'Bank',
    description: 'Bank cash movement, cheque, and transfer vouchers.',
    permission: 'bank-transactions.read',
    items: [
      { key: 'loan-recv-cash', label: 'Loan Received to Cash/Credit A/c', description: 'Receive loan proceeds through cash or credit settlement.', voucherCategory: 'Loan Received', transactionType: 'receipt', accent: 'emerald', mode: 'Cash / Credit', documents: BANK_TRANSACTION_DOCUMENTS['loan-recv-cash'] },
      { key: 'loan-recv-saving', label: 'Loan Received to Saving A/c', description: 'Receive loan proceeds into saving account.', voucherCategory: 'Loan Received to Saving A/c', transactionType: 'receipt', accent: 'emerald', mode: 'Saving A/c', documents: BANK_TRANSACTION_DOCUMENTS['loan-recv-saving'] },
      { key: 'deposit-in-bank', label: 'Deposit in Bank', description: 'Move cash or settlement into bank account.', voucherCategory: 'Deposit in Bank', transactionType: 'transfer', accent: 'amber', mode: 'Bank Deposit', documents: BANK_TRANSACTION_DOCUMENTS['deposit-in-bank'] },
      { key: 'cheque-issue-saving', label: 'Cheque Issue With Bank (Saving A/c)', description: 'Issue cheque against savings account settlement.', voucherCategory: 'Cheque Issue With Bank (Saving A/c)', transactionType: 'payment', accent: 'pink', mode: 'Cheque', documents: BANK_TRANSACTION_DOCUMENTS['cheque-issue-saving'] },
      { key: 'cheque-issue-loan', label: 'Cheque Issue With Bank (Loan A/c)', description: 'Issue cheque against loan account settlement.', voucherCategory: 'Cheque Issue With Bank (Loan A/c)', transactionType: 'payment', accent: 'pink', mode: 'Cheque', documents: BANK_TRANSACTION_DOCUMENTS['cheque-issue-loan'] },
      { key: 'transfer-saving', label: 'Amount Transfer to Saving A/c', description: 'Transfer money to saving account ledger.', voucherCategory: 'Amount Transfer to Saving A/c', transactionType: 'transfer', accent: 'amber', mode: 'Transfer', documents: BANK_TRANSACTION_DOCUMENTS['transfer-saving'] },
      { key: 'transfer-cashcredit', label: 'Amount Transfer to Cash-Credit A/c', description: 'Transfer money to cash-credit account ledger.', voucherCategory: 'Amount Transfer to Cash-Credit A/c', transactionType: 'transfer', accent: 'amber', mode: 'Transfer', documents: BANK_TRANSACTION_DOCUMENTS['transfer-cashcredit'] }
    ]
  },
  {
    key: 'employee',
    label: 'Employee',
    description: 'Employee advance payment and recovery workflow.',
    permission: 'transactions.read',
    items: [
      { key: 'advance-paid-emp', label: 'Advance Paid by Cash/Cheque', description: 'Pay advance to employee through cash or cheque.', voucherCategory: 'Advance Paid by Cash/Cheque', transactionType: 'payment', accent: 'pink', mode: 'Cash / Cheque', documents: EMPLOYEE_TRANSACTION_DOCUMENTS['advance-paid-emp'] },
      { key: 'advance-recovery-emp', label: 'Advance Recovery by Cash/Transfer', description: 'Recover employee advance through cash or transfer.', voucherCategory: 'Advance Recovery by Cash/Transfer', transactionType: 'receipt', accent: 'emerald', mode: 'Cash / Transfer', documents: EMPLOYEE_TRANSACTION_DOCUMENTS['advance-recovery-emp'] }
    ]
  },
  {
    key: 'transfer-voucher',
    label: 'Transfer Voucher',
    description: 'Inter-account transfer voucher movements.',
    permission: 'transactions.read',
    items: [
      { key: 'transfer-voucher-paid', label: 'Transfer Voucher Paid to Member', description: 'Transfer voucher paid out to member.', voucherCategory: 'Transfer Voucher Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Transfer', documents: [] },
      { key: 'transfer-voucher-recover', label: 'Transfer Voucher Recover From Member', description: 'Recover transfer voucher amount from member.', voucherCategory: 'Transfer Voucher Recover From Member', transactionType: 'receipt', accent: 'emerald', mode: 'Transfer', documents: [] },
      { key: 'transfer-voucher-payment', label: 'Payment', description: 'Payment voucher entry under transfer voucher workspace.', voucherCategory: 'Payment', transactionType: 'payment', accent: 'pink', mode: 'Payment', documents: [] },
      { key: 'transfer-voucher-receipt', label: 'Receipt', description: 'Receipt voucher entry under transfer voucher workspace.', voucherCategory: 'Receipt', transactionType: 'receipt', accent: 'emerald', mode: 'Receipt', documents: [] }
    ]
  },
  {
    key: 'interest',
    label: 'Interest',
    description: 'Interest transactions.',
    permission: 'transactions.read',
    items: [
      { key: 'interest-paid-member', label: 'Interest Paid to Member', description: 'Post interest payout to member ledger.', voucherCategory: 'Interest Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Interest', documents: [] },
      { key: 'interest-recv-member', label: 'Interest Receive From Member', description: 'Receive interest from member.', voucherCategory: 'Interest Receive From Member', transactionType: 'receipt', accent: 'emerald', mode: 'Interest', documents: [] },
      { key: 'interest-recv-employee', label: 'Interest Receive From Employee', description: 'Receive interest from employee.', voucherCategory: 'Interest Receive From Employee', transactionType: 'receipt', accent: 'emerald', mode: 'Interest', documents: [] }
    ]
  },
  {
    key: 'other',
    label: 'Other Transactions',
    description: 'Other transactions and support forms.',
    permission: 'transactions.read',
    items: [
      { key: 'payment-voucher', label: 'Payment Voucher', description: 'General payment entry.', voucherCategory: 'Payment Voucher', transactionType: 'payment', accent: 'pink', mode: 'Payment', documents: [] },
      { key: 'receipt-voucher', label: 'Receipt Voucher', description: 'General receipt entry for the society.', voucherCategory: 'Receipt Voucher', transactionType: 'receipt', accent: 'emerald', mode: 'Receipt', documents: [] },
      { key: 'no-interest-members', label: 'No Interest Members', description: 'Members excluded from interest calculation.', voucherCategory: 'No Interest Members', transactionType: 'support', accent: 'amber', mode: 'Master Link', route: '/app/transactions/other/no-interest-members' },
      { key: 'demand-entry', label: 'Demand Entry', description: 'Create or review demand records from the transaction shell.', voucherCategory: 'Demand Entry', transactionType: 'support', accent: 'amber', mode: 'Demand', route: '/app/transactions/other/demand-entry' }
    ]
  }
];`;

const startMarker = 'const TRANSACTION_CATALOG = [';
const endMarker = '];\n\nasync function getTransactionCatalog';
const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  code = code.substring(0, startIndex) + newCatalog + "\n\nasync function getTransactionCatalog" + code.substring(endIndex + endMarker.length);
  fs.writeFileSync(targetPath, code);
  console.log('Successfully updated TRANSACTION_CATALOG');
} else {
  console.log('Failed to find start or end index');
}

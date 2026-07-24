export const BANK_TRANSACTION_DOCUMENTS = {
  'loan-recv-cash': [
    { key: 'loanApplication', label: 'Loan Application', description: 'Sanctioned loan application or request form.' },
    { key: 'disbursementAdvice', label: 'Disbursement Advice', description: 'Advice or cash disbursement note.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or settlement reference.' }
  ],
  'loan-recv-saving': [
    { key: 'loanApplication', label: 'Loan Application', description: 'Sanctioned loan application or request form.' },
    { key: 'savingPassbook', label: 'Saving Passbook / Proof', description: 'Saving account proof or passbook scan.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or settlement reference.' }
  ],
  'deposit-in-bank': [
    { key: 'depositSlip', label: 'Deposit Slip', description: 'Cash deposit slip or challan.' },
    { key: 'bankReceipt', label: 'Bank Receipt', description: 'Bank acknowledgment or receipt.' },
    { key: 'cashBookEntry', label: 'Cash Book Entry', description: 'Cash book or journal evidence.' }
  ],
  'cheque-issue-saving': [
    { key: 'chequeImage', label: 'Cheque Image', description: 'Cheque scan or issued instrument copy.' },
    { key: 'chequeRegister', label: 'Cheque Register', description: 'Cheque issue register or record.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Advice or settlement reference.' }
  ],
  'cheque-issue-loan': [
    { key: 'chequeImage', label: 'Cheque Image', description: 'Cheque scan or issued instrument copy.' },
    { key: 'chequeRegister', label: 'Cheque Register', description: 'Cheque issue register or record.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Advice or settlement reference.' }
  ],
  'transfer-saving': [
    { key: 'transferAdvice', label: 'Transfer Advice', description: 'Transfer request or advice slip.' },
    { key: 'rtgsSlip', label: 'RTGS / NEFT Slip', description: 'Transfer proof or bank confirmation.' },
    { key: 'bankStatement', label: 'Bank Statement', description: 'Statement or transaction proof.' }
  ],
  'transfer-cashcredit': [
    { key: 'transferAdvice', label: 'Transfer Advice', description: 'Transfer request or advice slip.' },
    { key: 'rtgsSlip', label: 'RTGS / NEFT Slip', description: 'Transfer proof or bank confirmation.' },
    { key: 'bankStatement', label: 'Bank Statement', description: 'Statement or transaction proof.' }
  ]
};

export function getBankDocumentDefinitions(activeKey = '') {
  return BANK_TRANSACTION_DOCUMENTS[String(activeKey || '').toLowerCase()] || [];
}

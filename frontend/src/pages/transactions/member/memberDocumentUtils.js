export const MEMBER_TRANSACTION_DOCUMENTS = {
  'loan-paid-member': [
    { key: 'sanctionLetter', label: 'Sanction Letter / Loan Agreement', description: 'Loan approval note or signed agreement.' },
    { key: 'promissoryNote', label: 'Promissory Note', description: 'Member signed promissory note.' },
    { key: 'disbursementAdvice', label: 'Disbursement Advice / Cheque', description: 'Cheque or disbursement advice copy.' },
    { key: 'memberSheet', label: 'Member Calculation Sheet', description: 'Loan calculation or member-wise sheet.' }
  ],
  'deposit-paid-member': [
    { key: 'depositSlip', label: 'Deposit Slip', description: 'Cash or cheque deposit slip.' },
    { key: 'voucherAttachment', label: 'Voucher Attachment', description: 'Primary payout support file or scan.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or transfer reference.' }
  ],
  'insurance-paid-member': [
    { key: 'insurancePolicy', label: 'Insurance Policy', description: 'Policy or premium reference.' },
    { key: 'voucherAttachment', label: 'Voucher Attachment', description: 'Primary insurance payout support file.' },
    { key: 'receiptCopy', label: 'Receipt Copy', description: 'Receipt acknowledgement or cash memo.' }
  ],
  'recovery-member': [
    { key: 'depositSlip', label: 'Deposit Slip', description: 'Cash or cheque deposit slip.' },
    { key: 'receiptCopy', label: 'Receipt Copy', description: 'Bank receipt or cash receipt copy.' },
    { key: 'bankStatement', label: 'Bank Statement', description: 'Statement or online transfer proof.' },
    { key: 'memberSheet', label: 'Member Recovery Sheet', description: 'Member-wise recovery calculation sheet.' }
  ]
};

export function getMemberDocumentDefinitions(activeKey = '') {
  return MEMBER_TRANSACTION_DOCUMENTS[String(activeKey || '').toLowerCase()] || [];
}

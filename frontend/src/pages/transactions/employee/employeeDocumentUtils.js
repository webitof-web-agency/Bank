export const EMPLOYEE_TRANSACTION_DOCUMENTS = {
  'advance-paid-emp': [
    { key: 'advanceApplication', label: 'Advance Application', description: 'Employee advance request or application.' },
    { key: 'approvalNote', label: 'Approval Note', description: 'Sanction or approval note for advance.' },
    { key: 'chequeImage', label: 'Cheque / Payment Proof', description: 'Cheque image or cash payment proof.' },
    { key: 'undertaking', label: 'Employee Undertaking', description: 'Salary adjustment or repayment undertaking.' }
  ],
  'advance-recovery-emp': [
    { key: 'recoverySlip', label: 'Recovery Slip', description: 'Recovery slip or cash deposit note.' },
    { key: 'salaryDeductionAdvice', label: 'Salary Deduction Advice', description: 'Payroll deduction advice or memo.' },
    { key: 'receiptCopy', label: 'Receipt Copy', description: 'Receipt acknowledgement or cash memo.' },
    { key: 'bankTransferProof', label: 'Bank Transfer Proof', description: 'Transfer proof if recovered through bank.' }
  ]
};

export function getEmployeeDocumentDefinitions(activeKey = '') {
  return EMPLOYEE_TRANSACTION_DOCUMENTS[String(activeKey || '').toLowerCase()] || [];
}

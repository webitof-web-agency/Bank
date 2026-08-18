export const RECEIPT_INTEREST_DOCUMENTS = {
  'receipt-voucher': [
    { key: 'receiptVoucher', label: 'Receipt Voucher', description: 'Primary receipt voucher copy.' },
    { key: 'cashReceipt', label: 'Cash Receipt', description: 'Cash receipt or acknowledgment.' },
    { key: 'bankReceipt', label: 'Bank Receipt', description: 'Bank receipt or transfer confirmation.' }
  ],
  'interest-paid-member': [
    { key: 'interestWorksheet', label: 'Interest Worksheet', description: 'Interest calculation worksheet.' },
    { key: 'sanctionNote', label: 'Sanction Note', description: 'Interest approval or sanction note.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or payment reference.' },
    { key: 'receiptCopy', label: 'Receipt Copy', description: 'Receipt copy for interest payout.' }
  ]
};

export function getReceiptInterestDocumentDefinitions(activeKey = '') {
  return RECEIPT_INTEREST_DOCUMENTS[String(activeKey || '').toLowerCase()] || [];
}

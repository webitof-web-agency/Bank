export const SUPPORTING_DOCUMENTS = {
  'payment-voucher': [
    { key: 'paymentVoucher', label: 'Payment Voucher', description: 'Primary payment voucher copy.' },
    { key: 'invoiceBill', label: 'Invoice / Bill', description: 'Bill or invoice attached to payment.' },
    { key: 'approvalNote', label: 'Approval Note', description: 'Approved note or sanction document.' }
  ],
  'demand-entry': [
    { key: 'demandSheet', label: 'Demand Sheet', description: 'Monthly demand sheet or statement.' },
    { key: 'recoveryAdvice', label: 'Recovery Advice', description: 'Recovery advice or internal note.' },
    { key: 'approvalNote', label: 'Approval Note', description: 'Approved demand entry note.' }
  ]
};

export function getSupportingDocumentDefinitions(activeKey = '') {
  return SUPPORTING_DOCUMENTS[String(activeKey || '').toLowerCase()] || [];
}

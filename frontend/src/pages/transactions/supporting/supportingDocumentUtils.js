export const SUPPORTING_DOCUMENTS = {
  'payment-voucher': [
    { key: 'paymentVoucher', label: 'Payment Voucher', description: 'Primary payment voucher copy.' },
    { key: 'invoiceBill', label: 'Invoice / Bill', description: 'Bill or invoice attached to payment.' },
    { key: 'approvalNote', label: 'Approval Note', description: 'Approved note or sanction document.' }
  ]
};

export function getSupportingDocumentDefinitions(activeKey = '') {
  return SUPPORTING_DOCUMENTS[String(activeKey || '').toLowerCase()] || [];
}

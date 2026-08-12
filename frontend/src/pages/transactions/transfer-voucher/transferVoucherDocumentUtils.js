export const TRANSFER_VOUCHER_DOCUMENTS = {
  'transfer-voucher-paid': [
    { key: 'transferAdvice', label: 'Transfer Advice', description: 'Transfer request or advice slip.' },
    { key: 'allocationSheet', label: 'Allocation Sheet', description: 'Member allocation breakdown sheet.' },
    { key: 'memberAcknowledgement', label: 'Member Acknowledgement', description: 'Signed acknowledgement from member.' }
  ],
  'transfer-voucher-recover': [
    { key: 'recoveryAdvice', label: 'Recovery Advice', description: 'Recovery advice or internal note.' },
    { key: 'allocationSheet', label: 'Allocation Sheet', description: 'Member allocation breakdown sheet.' },
    { key: 'bankProof', label: 'Bank Proof', description: 'Bank proof or recovery confirmation.' }
  ],
  'transfer-voucher-payment': [
    { key: 'paymentVoucher', label: 'Payment Voucher', description: 'Primary payment voucher copy.' },
    { key: 'invoiceBill', label: 'Invoice / Bill', description: 'Bill or invoice attached to payment.' },
    { key: 'approvalNote', label: 'Approval Note', description: 'Approved note or sanction document.' }
  ]
};

export function getTransferVoucherDocumentDefinitions(activeKey = '') {
  return TRANSFER_VOUCHER_DOCUMENTS[String(activeKey || '').toLowerCase()] || [];
}


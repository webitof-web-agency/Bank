import { createEmptyDocumentMap, hydrateDocumentMap, serializeDocumentMap } from '../../components/master/documentUtils';

export const TRANSACTION_DOCUMENT_DEFS = [
  { key: 'voucherAttachment', label: 'Voucher Attachment', description: 'Primary voucher support file or scan.' },
  { key: 'supportingDocument', label: 'Supporting Document', description: 'Bills, advice slips, or notes.' },
  { key: 'chequeImage', label: 'Cheque Image', description: 'Cheque scan or bank instrument image.' },
  { key: 'receiptCopy', label: 'Receipt Copy', description: 'Receipt acknowledgement or cash memo.' },
  { key: 'memberSheet', label: 'Member Sheet', description: 'Member-wise calculation sheet.' },
  { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or transfer reference.' }
];

export function createEmptyTransactionDocumentMap() {
  return createEmptyDocumentMap(TRANSACTION_DOCUMENT_DEFS);
}

export function hydrateTransactionDocumentMap(documents = {}) {
  return hydrateDocumentMap(TRANSACTION_DOCUMENT_DEFS, documents);
}

export function serializeTransactionDocumentMap(documents = {}) {
  return serializeDocumentMap(documents);
}


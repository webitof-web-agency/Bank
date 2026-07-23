export const EMPLOYEE_DOCUMENT_DEFS = [
  { key: 'aadhaarFront', label: 'Aadhaar Card Front', description: 'Front side of the Aadhaar card.' },
  { key: 'aadhaarBack', label: 'Aadhaar Card Back', description: 'Back side of the Aadhaar card.' },
  { key: 'panCard', label: 'PAN Card', description: 'PAN card copy for verification.' },
  { key: 'addressProof', label: 'Address Proof', description: 'Voter ID, Driving License, or similar proof.' },
  { key: 'educationCertificate', label: 'Highest Education Certificate', description: 'Degree or mark sheet copy.' },
  { key: 'experienceLetter', label: 'Experience / Relieving Letter', description: 'Previous employment proof.' },
  { key: 'bankProof', label: 'Cancelled Cheque / Bank Passbook', description: 'Salary account proof.' },
  { key: 'policeVerification', label: 'Police Clearance / Verification', description: 'Optional background verification document.' }
];

export const MEMBER_DOCUMENT_DEFS = [
  { key: 'aadhaarFront', label: 'Aadhaar Card Front', description: 'Front side of the Aadhaar card.' },
  { key: 'aadhaarBack', label: 'Aadhaar Card Back', description: 'Back side of the Aadhaar card.' },
  { key: 'panCard', label: 'PAN Card', description: 'Mandatory for tax and high-value verification.' },
  { key: 'signatureSpecimen', label: 'Signature Specimen', description: 'Signature scan for account verification.' },
  { key: 'addressProof', label: 'Address Proof', description: 'Utility bill, ration card, or voter ID.' },
  { key: 'incomeProof', label: 'Income Proof', description: 'Salary slip or ITR for loan review.' },
  { key: 'nomineeIdProof', label: 'Nominee ID Proof', description: 'Nominee identity verification document.' }
];

export function createEmptyDocumentMap(definitions = []) {
  return Object.fromEntries((Array.isArray(definitions) ? definitions : []).map((def) => [def.key, null]));
}

export function hydrateDocumentMap(definitions = [], documents = {}) {
  const initial = createEmptyDocumentMap(definitions);
  for (const def of definitions || []) {
    const existing = documents?.[def.key];
    if (!existing) continue;
    initial[def.key] = {
      fileId: existing.fileId || existing.id || null,
      viewUrl: existing.viewUrl || '',
      originalName: existing.originalName || existing.fileName || existing.name || '',
      documentType: existing.documentType || def.key,
      mimeType: existing.mimeType || '',
      sizeBytes: existing.sizeBytes || 0,
      uploadedAt: existing.uploadedAt || existing.createdAt || '',
      file: existing.file || null
    };
  }
  return initial;
}

export function serializeDocumentMap(documents = {}) {
  return Object.fromEntries(
    Object.entries(documents || {})
      .filter(([, value]) => Boolean(value) && !value.file)
      .map(([key, value]) => [
        key,
        {
          fileId: value.fileId || value.id || null,
          viewUrl: value.viewUrl || '',
          originalName: value.originalName || value.fileName || value.name || '',
          documentType: value.documentType || key,
          mimeType: value.mimeType || '',
          sizeBytes: value.sizeBytes || 0,
          uploadedAt: value.uploadedAt || value.createdAt || ''
        }
      ])
  );
}

export function getDocumentFileName(document = {}) {
  return document?.originalName || document?.file?.name || document?.name || 'Untitled file';
}

export function getDocumentFileUrl(document = {}) {
  if (!document) return '';
  if (document.viewUrl) return document.viewUrl;
  if (document.fileId) return `/api/files/${document.fileId}/view`;
  return '';
}

export function isPendingDocument(document = {}) {
  return Boolean(document?.file);
}


import {
  createEmptyTransactionDocumentMap,
  hydrateTransactionDocumentMap,
  serializeTransactionDocumentMap
} from '../transactionDocumentUtils';

export function toneClassName(tone = 'slate') {
  if (tone === 'pink') return 'border-rose-100 bg-rose-50 text-rose-600';
  if (tone === 'green' || tone === 'emerald') return 'border-emerald-100 bg-emerald-50 text-emerald-600';
  if (tone === 'amber') return 'border-amber-100 bg-amber-50 text-amber-600';
  if (tone === 'violet') return 'border-violet-100 bg-violet-50 text-violet-600';
  if (tone === 'sky') return 'border-sky-100 bg-sky-50 text-sky-600';
  if (tone === 'blue') return 'border-blue-100 bg-blue-50 text-blue-600';
  return 'border-slate-100 bg-slate-50 text-slate-600';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function cleanUpper(value, fallback = '') {
  return cleanText(value, fallback).toUpperCase();
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value && typeof value === 'object' ? value : fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function deepMerge(target = {}, source = {}) {
  const output = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      output[key] = [...value];
      return;
    }
    if (value && typeof value === 'object') {
      output[key] = deepMerge(output[key] && typeof output[key] === 'object' ? output[key] : {}, value);
      return;
    }
    output[key] = value;
  });
  return output;
}

function toNumberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toTitleCase(value = '') {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (match) => match.toUpperCase());
}

function stringifyJson(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return fallback;
  }
}

export const TRANSFER_VOUCHER_HEADS = [
  { key: 'share', label: 'Share' },
  { key: 'cd', label: 'Compulsory Deposit' },
  { key: 'ssa', label: 'SSA' },
  { key: 'loan', label: 'Loan' },
  { key: 'lad', label: 'Loan Against Deposit' }
];

function getTransferVoucherDefaultSide(itemKey = '') {
  return cleanText(itemKey).toLowerCase() === 'transfer-voucher-recover' ? 'CR' : 'DR';
}

function normalizeTransferVoucherSide(value = '', fallback = 'DR') {
  const side = cleanText(value, fallback).toUpperCase();
  return side === 'CR' ? 'CR' : 'DR';
}

function normalizeTransferVoucherAllocation(row = {}, itemKey = '') {
  const head = cleanText(row.head || row.key || '').toLowerCase();
  const meta = TRANSFER_VOUCHER_HEADS.find((entry) => entry.key === head) || null;

  return {
    head: meta?.key || head,
    label: meta?.label || toTitleCase(head),
    amount: toNumberOrZero(row.amount),
    side: normalizeTransferVoucherSide(row.side, getTransferVoucherDefaultSide(itemKey))
  };
}

export function getTransferVoucherAllocationRows(source = [], itemKey = '') {
  const rows = Array.isArray(source) ? source : [];
  const fallbackSide = getTransferVoucherDefaultSide(itemKey);
  const rowMap = new Map(
    rows
      .filter(Boolean)
      .map((row) => {
        const key = cleanText(row.head || row.key || '').toLowerCase();
        return [key, normalizeTransferVoucherAllocation(row, itemKey)];
      })
  );

  return TRANSFER_VOUCHER_HEADS.map((entry) => rowMap.get(entry.key) || {
    head: entry.key,
    label: entry.label,
    amount: '',
    side: fallbackSide
  });
}

export function getTransferVoucherAllocationTotal(source = [], itemKey = '') {
  return getTransferVoucherAllocationRows(source, itemKey).reduce((sum, row) => sum + toNumberOrZero(row.amount), 0);
}

export function buildTransferVoucherAllocationsPayload(source = [], itemKey = '') {
  return getTransferVoucherAllocationRows(source, itemKey)
    .filter((row) => toNumberOrZero(row.amount) > 0)
    .map((row) => ({
      head: row.head,
      label: row.label,
      amount: toNumberOrZero(row.amount),
      side: normalizeTransferVoucherSide(row.side, getTransferVoucherDefaultSide(itemKey))
    }));
}

function buildDetailArray(value, fallback = []) {
  const parsed = safeJsonParse(value, fallback);
  return Array.isArray(parsed) ? parsed : fallback;
}

export function getSectionItems(catalog = [], sectionKey = '') {
  return (Array.isArray(catalog) ? catalog : []).find((section) => section.key === sectionKey)?.items || [];
}

export function getSectionItemByKey(sectionItems = [], key = '') {
  return (Array.isArray(sectionItems) ? sectionItems : []).find((item) => item.key === key) || null;
}

export function getDefaultPartyType(sectionKey = '') {
  if (sectionKey === 'member') return 'member';
  if (sectionKey === 'employee') return 'employee';
  if (sectionKey === 'transfer-voucher') return 'member';
  if (sectionKey === 'bank') return 'ledger';
  return 'ledger';
}

export function createEmptyTransactionDraft(sectionKey = '', sectionItems = []) {
  const firstItem = sectionItems[0] || null;
  const transferKey = cleanText(firstItem?.key || sectionKey).toLowerCase();

  return {
    voucherNo: '',
    date: todayString(),
    voucherCategory: firstItem?.label || '',
    transactionType: firstItem?.transactionType || 'payment',
    accent: firstItem?.accent || 'neutral',
    partyType: getDefaultPartyType(sectionKey),
    partyCode: '',
    amount: '',
    mode: firstItem?.mode || '',
    status: 'Draft',
    narration: '',
    referenceNo: '',
    instrumentNo: '',
    instrumentDate: '',
    branchCode: '',
    fyCode: '',
    approvedBy: '',
    createdBy: '',
    documents: createEmptyTransactionDocumentMap(),
    details: {
      key: firstItem?.key || '',
      settlementAccount: '',
      ledgerTarget: '',
      receiptBy: '',
      depositBy: '',
      depositIn: '',
      fromAccount: '',
      toAccount: '',
      accountHead: '',
      components: {
        loanAmt: '',
        lad: ''
      },
      recoveryLines: [],
      allocations: transferKey.startsWith('transfer-voucher') ? getTransferVoucherAllocationRows([], transferKey) : [],
      recoveryLinesJson: '',
      allocationsJson: ''
    },
    detailsJson: ''
  };
}

export function createTransactionDraftFromRecord(record = {}, sectionItems = [], sectionKey = '') {
  const details = record.details || {};
  const firstItem = getSectionItemByKey(sectionItems, details.key) || sectionItems[0] || null;
  const draftKey = cleanText(details.key || firstItem?.key || sectionKey).toLowerCase();
  const transferAllocations = draftKey.startsWith('transfer-voucher')
    ? getTransferVoucherAllocationRows(Array.isArray(details.allocations) ? details.allocations : [], details.key || firstItem?.key || sectionKey)
    : Array.isArray(details.allocations) ? details.allocations : [];

  return {
    voucherNo: record.voucherNo || '',
    date: record.date || todayString(),
    voucherCategory: record.voucherCategory || firstItem?.label || '',
    transactionType: record.transactionType || firstItem?.transactionType || 'payment',
    accent: record.accent || firstItem?.accent || 'neutral',
    partyType: record.partyType || getDefaultPartyType(sectionKey || firstItem?.key || ''),
    partyCode: record.partyCode || '',
    amount: record.amount ?? '',
    mode: record.mode || firstItem?.mode || '',
    status: record.status || 'Draft',
    narration: record.narration || '',
    referenceNo: record.referenceNo || '',
    instrumentNo: record.instrumentNo || '',
    instrumentDate: record.instrumentDate || '',
    branchCode: record.branchCode || '',
    fyCode: record.fyCode || '',
    approvedBy: record.approvedBy || '',
    createdBy: record.createdBy || '',
    documents: hydrateTransactionDocumentMap(record.documents || {}),
    details: {
      key: details.key || firstItem?.key || '',
      settlementAccount: details.settlementAccount || '',
      ledgerTarget: details.ledgerTarget || '',
      receiptBy: details.receiptBy || '',
      depositBy: details.depositBy || '',
      depositIn: details.depositIn || '',
      fromAccount: details.fromAccount || '',
      toAccount: details.toAccount || '',
      accountHead: details.accountHead || '',
      components: {
        loanAmt: details.components?.loanAmt ?? '',
        lad: details.components?.lad ?? ''
      },
      recoveryLines: Array.isArray(details.recoveryLines) ? details.recoveryLines : [],
      allocations: transferAllocations,
      recoveryLinesJson: stringifyJson(details.recoveryLines || []),
      allocationsJson: stringifyJson(details.allocations || [])
    },
    detailsJson: stringifyJson(details)
  };
}

export function buildTransactionVoucherPayload(draft = {}) {
  const baseDetails = clone(draft.details || {});
  const advancedDetails = safeJsonParse(draft.detailsJson, {});
  const documents = serializeTransactionDocumentMap(draft.documents || {});

  const details = deepMerge(advancedDetails, baseDetails);
  details.key = cleanText(details.key || baseDetails.key);
  details.components = {
    loanAmt: toNumberOrZero(details.components?.loanAmt),
    lad: toNumberOrZero(details.components?.lad)
  };
  details.recoveryLines = buildDetailArray(details.recoveryLines || baseDetails.recoveryLinesJson || details.recoveryLinesJson, []);
  details.allocations = buildDetailArray(details.allocations || baseDetails.allocationsJson || details.allocationsJson, []);
  if (details.key.toLowerCase().startsWith('transfer-voucher')) {
    details.allocations = buildTransferVoucherAllocationsPayload(details.allocations, details.key);
  }
  delete details.recoveryLinesJson;
  delete details.allocationsJson;

  const transferTotal = details.key.toLowerCase().startsWith('transfer-voucher')
    ? getTransferVoucherAllocationTotal(details.allocations, details.key)
    : 0;

  return {
    voucherNo: cleanUpper(draft.voucherNo) || undefined,
    date: cleanText(draft.date),
    voucherCategory: cleanText(draft.voucherCategory),
    transactionType: cleanText(draft.transactionType),
    accent: cleanText(draft.accent, 'neutral'),
    partyCode: cleanUpper(draft.partyCode),
    partyType: cleanText(draft.partyType, 'ledger'),
    amount: transferTotal > 0 ? transferTotal : toNumberOrZero(draft.amount),
    mode: cleanText(draft.mode),
    status: cleanText(draft.status, 'Draft'),
    narration: cleanText(draft.narration),
    referenceNo: cleanText(draft.referenceNo),
    instrumentNo: cleanText(draft.instrumentNo),
    instrumentDate: cleanText(draft.instrumentDate),
    branchCode: cleanUpper(draft.branchCode),
    fyCode: cleanUpper(draft.fyCode),
    approvedBy: cleanText(draft.approvedBy),
    createdBy: cleanText(draft.createdBy),
    documents,
    details
  };
}

export function getVoucherSectionItem(voucher = {}, sectionItems = [], sectionKey = '') {
  const key = cleanText(voucher?.details?.key || voucher?.transactionKey || voucher?.sectionKey || '');
  const normalizedKey = key.toLowerCase();
  const normalizedCategory = cleanText(voucher.voucherCategory).toLowerCase();
  const normalizedSectionKey = cleanText(sectionKey).toLowerCase();
  const normalizedSectionLabel = normalizedSectionKey.replace(/-/g, ' ');

  return getSectionItemByKey(sectionItems, key)
    || (Array.isArray(sectionItems) ? sectionItems.find((item) => cleanText(item.key).toLowerCase() === normalizedKey) : null)
    || (Array.isArray(sectionItems) ? sectionItems.find((item) => cleanText(voucher.voucherCategory).toLowerCase() === cleanText(item.label).toLowerCase()) : null)
    || (normalizedSectionKey && (normalizedKey === normalizedSectionKey || normalizedKey.startsWith(`${normalizedSectionKey}-`)) ? (sectionItems[0] || null) : null)
    || (normalizedSectionLabel && normalizedCategory.includes(normalizedSectionLabel) ? (sectionItems[0] || null) : null)
    || null;
}

export function filterTransactionRows(rows = [], sectionItems = [], sectionKey = '') {
  const normalizedSectionKey = cleanText(sectionKey).toLowerCase();
  const normalizedSectionLabel = normalizedSectionKey.replace(/-/g, ' ');
  const itemKeys = new Set((Array.isArray(sectionItems) ? sectionItems : []).map((item) => cleanText(item.key).toLowerCase()));

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const rowKey = cleanText(row?.details?.key || row?.transactionKey || row?.sectionKey || '').toLowerCase();
    const rowCategory = cleanText(row.voucherCategory).toLowerCase();

    if (rowKey && itemKeys.has(rowKey)) return true;
    if (normalizedSectionKey && (rowKey === normalizedSectionKey || rowKey.startsWith(`${normalizedSectionKey}-`))) return true;
    if (normalizedSectionLabel && rowCategory.includes(normalizedSectionLabel)) return true;
    return (Array.isArray(sectionItems) ? sectionItems : []).some((item) => rowCategory === cleanText(item.label).toLowerCase());
  });
}

export function getTransactionVoucherTitle(voucher = {}, sectionItems = [], sectionKey = '') {
  const item = getVoucherSectionItem(voucher, sectionItems, sectionKey);
  return item?.label || voucher.voucherCategory || voucher.transactionType || voucher.voucherNo || 'Transaction';
}

export function formatTransactionAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-IN').format(number);
}

export function getTransactionPartyLabel(value = '', lookups = {}, partyType = '') {
  const code = cleanUpper(value);
  if (!code) return '—';

  if (partyType === 'member') {
    const member = (lookups.members || []).find((row) => cleanUpper(row.code) === code);
    return member ? `${member.code} - ${member.name || ''}`.trim() : code;
  }

  if (partyType === 'employee') {
    const employee = (lookups.employees || []).find((row) => cleanUpper(row.code) === code);
    return employee ? `${employee.code} - ${employee.fullName || employee.name || ''}`.trim() : code;
  }

  if (partyType === 'bank') {
    const bank = (lookups.bankAccounts || []).find((row) => cleanUpper(row.code) === code);
    return bank ? `${bank.code} - ${bank.bankName || ''}`.trim() : code;
  }

  const ledger = (lookups.ledgers || []).find((row) => cleanUpper(row.code) === code);
  if (ledger) {
    return `${ledger.code} - ${ledger.name || ''}`.trim();
  }

  return code;
}

export function getTransactionLedgerLabel(value = '', lookups = {}) {
  const code = cleanUpper(value);
  if (!code) return '—';
  const ledger = (lookups.ledgers || []).find((row) => cleanUpper(row.code) === code);
  if (ledger) return `${ledger.code} - ${ledger.name || ''}`.trim();
  const bank = (lookups.bankAccounts || []).find((row) => cleanUpper(row.code) === code);
  if (bank) return `${bank.code} - ${bank.bankName || ''}`.trim();
  return code;
}

export function toCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(number);
}

export function getSectionNotes(sectionKey = '', activeKey = '') {
  const key = String(activeKey || '').toLowerCase();
  if (key === 'loan-paid-member') return ['Choose member party, settlement ledger, and loan breakdown.'];
  if (key === 'recovery-member') return ['Recovery lines will be stored as structured rows.'];
  if (key === 'deposit-paid-member' || key === 'insurance-paid-member') return ['Use settlement and deposit/insurance references as needed.'];
  if (key === 'advance-paid-emp' || key === 'advance-recovery-emp') return ['Employee party selection is linked to master employee code.'];
  if (key === 'transfer-voucher-paid' || key === 'transfer-voucher-recover') return ['Transfer allocations stay in row format for backend posting.'];
  if (key === 'receipt-voucher' || key === 'interest-paid-member') return ['Receipt and interest entries use ledger/member lookup based on voucher type.'];
  if (key === 'transfer-voucher-payment') return ['Payment voucher uses ledger target, paid from account, instrument fields, and narration.'];
  if (key === 'payment-voucher') return ['General supporting payment voucher.'];
  if (sectionKey === 'bank') return ['Bank section vouchers can move between ledgers and bank accounts.'];
  return ['Maintain structured voucher details.'];
}


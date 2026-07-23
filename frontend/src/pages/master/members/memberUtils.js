import imageCompression from 'browser-image-compression';
import { MEMBER_DOCUMENT_DEFS, createEmptyDocumentMap, hydrateDocumentMap, serializeDocumentMap } from '../../../components/master/documentUtils';

export function stripPhoneDigits(value = '') {
  return String(value || '').replace(/[^\d]/g, '');
}

export function formatMemberPhone(value = '') {
  const digits = stripPhoneDigits(value);
  return digits ? `+${digits}` : '';
}

export async function prepareMemberAvatarFile(file) {
  if (!file) return null;

  let uploadFile = file;
  if (String(file.type || '').startsWith('image/')) {
    try {
      uploadFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true
      });
    } catch {
      uploadFile = file;
    }
  }

  return uploadFile;
}

export function buildNextMemberCode(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = String(row?.code || '').trim().toUpperCase();
    const match = code.match(/^M(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `M${String(maxNumber + 1).padStart(4, '0')}`;
}

export function buildNextMembershipNo(rows = []) {
  let maxNumber = 1000;

  for (const row of Array.isArray(rows) ? rows : []) {
    const membershipNo = String(row?.membershipNo || '').trim().toUpperCase();
    const match = membershipNo.match(/^MB-(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `MB-${maxNumber + 1}`;
}

export function formatBranchLabel(branch = {}) {
  const code = String(branch.code || '').trim();
  const label = String(branch.label || branch.place || '').trim();

  if (!code && !label) return '';
  if (!code) return label;
  if (!label || label === code) return code;
  return `${code} - ${label}`;
}

export function getBranchMap(branches = []) {
  return new Map(
    (Array.isArray(branches) ? branches : []).map((branch) => [String(branch.code || '').trim().toUpperCase(), branch])
  );
}

export function formatMoney(value) {
  if (value === '' || value === null || value === undefined) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-IN').format(number);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createEmptyMemberDraft(rows = []) {
  return {
    code: buildNextMemberCode(rows),
    membershipNo: buildNextMembershipNo(rows),
    name: '',
    fatherOrHusbandName: '',
    branchCode: '',
    category: '',
    caste: '',
    designation: '',
    serviceName1: '',
    serviceName2: '',
    dateOfBirth: '',
    membershipDate: '',
    appointmentDate: '',
    address: '',
    mobileNo: '',
    photoUrl: '',
    photoFileId: null,
    openingBalance: 0,
    depositBalance: 0,
    loanOutstanding: 0,
    balances: {
      share: 0,
      compulsoryDeposit: 0,
      specialSaving: 0,
      providentFund: 0,
      loanAgainstDeposit: 0,
      insurancePremium: 0
    },
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active',
    documents: createEmptyDocumentMap(MEMBER_DOCUMENT_DEFS)
  };
}

export function createMemberDraftFromRecord(member = {}) {
  const balances = member.balances || {};
  const depositBalance = member.depositBalance ?? balances.compulsoryDeposit ?? 0;

  return {
    code: member.code || '',
    membershipNo: member.membershipNo || '',
    name: member.name || '',
    fatherOrHusbandName: member.fatherOrHusbandName || '',
    branchCode: member.branchCode || '',
    category: member.category || '',
    caste: member.caste || '',
    designation: member.designation || '',
    serviceName1: member.serviceName1 || '',
    serviceName2: member.serviceName2 || '',
    dateOfBirth: member.dateOfBirth || '',
    membershipDate: member.membershipDate || '',
    appointmentDate: member.appointmentDate || '',
    address: member.address || '',
    mobileNo: member.mobileNo || '',
    photoUrl: member.photoUrl || '',
    photoFileId: member.photoFileId || null,
    openingBalance: member.openingBalance ?? 0,
    depositBalance,
    loanOutstanding: member.loanOutstanding ?? 0,
    balances: {
      share: toNumber(balances.share, 0),
      compulsoryDeposit: toNumber(balances.compulsoryDeposit, depositBalance),
      specialSaving: toNumber(balances.specialSaving, 0),
      providentFund: toNumber(balances.providentFund, 0),
      loanAgainstDeposit: toNumber(balances.loanAgainstDeposit, 0),
      insurancePremium: toNumber(balances.insurancePremium, 0)
    },
    nomineeName: member.nomineeName || '',
    nomineeRelation: member.nomineeRelation || '',
    status: member.status || 'Active',
    documents: hydrateDocumentMap(MEMBER_DOCUMENT_DEFS, member.documents || {})
  };
}

export function buildMemberPayload(draft = {}) {
  const openingBalance = Number(draft.openingBalance);
  const depositBalance = Number(draft.depositBalance);
  const loanOutstanding = Number(draft.loanOutstanding);
  const balances = draft.balances || {};

  return {
    code: String(draft.code || '').trim().toUpperCase() || undefined,
    membershipNo: String(draft.membershipNo || '').trim().toUpperCase() || undefined,
    name: String(draft.name || '').trim(),
    fatherOrHusbandName: String(draft.fatherOrHusbandName || '').trim(),
    branchCode: String(draft.branchCode || '').trim().toUpperCase(),
    category: String(draft.category || '').trim(),
    caste: String(draft.caste || '').trim(),
    designation: String(draft.designation || '').trim(),
    serviceName1: String(draft.serviceName1 || '').trim(),
    serviceName2: String(draft.serviceName2 || '').trim(),
    dateOfBirth: String(draft.dateOfBirth || '').trim(),
    membershipDate: String(draft.membershipDate || '').trim(),
    appointmentDate: String(draft.appointmentDate || '').trim(),
    address: String(draft.address || '').trim(),
    mobileNo: String(draft.mobileNo || '').trim(),
    photoUrl: String(draft.photoUrl || '').trim(),
    photoFileId: draft.photoFileId || null,
    openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
    depositBalance: Number.isFinite(depositBalance) ? depositBalance : 0,
    loanOutstanding: Number.isFinite(loanOutstanding) ? loanOutstanding : 0,
    balances: {
      share: toNumber(balances.share, 0),
      compulsoryDeposit: Number.isFinite(depositBalance) ? depositBalance : toNumber(balances.compulsoryDeposit, 0),
      specialSaving: toNumber(balances.specialSaving, 0),
      providentFund: toNumber(balances.providentFund, 0),
      loanAgainstDeposit: toNumber(balances.loanAgainstDeposit, 0),
      insurancePremium: toNumber(balances.insurancePremium, 0)
    },
    nomineeName: String(draft.nomineeName || '').trim(),
    nomineeRelation: String(draft.nomineeRelation || '').trim(),
    status: String(draft.status || 'Active').trim(),
    isActive: String(draft.status || 'Active').trim() !== 'Inactive',
    documents: serializeDocumentMap(draft.documents || {})
  };
}

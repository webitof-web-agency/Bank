import imageCompression from 'browser-image-compression';
import { MEMBER_DOCUMENT_DEFS, createEmptyDocumentMap, hydrateDocumentMap, serializeDocumentMap } from '../../../components/master/documentUtils';
// Canonical 10-digit mobile rules shared with the employee form and the backend.
import { normalizeMobile, isValidMobile } from '../../../utils/mobile';
import { buildDemandDefaultsPayload, demandDefaultsFromRecord, emptyDemandDefaults } from './memberDemand';
import { buildOpeningBalancesPayload, emptyOpeningBalances, openingBalancesFromRecord } from './memberBalances';

export { normalizeMobile, isValidMobile };

export function stripPhoneDigits(value = '') {
  return String(value || '').replace(/[^\d]/g, '');
}

// The phone box reads its value as country code + number, so a bare 10-digit
// mobile ("9425526729") must carry the 91, or "94" is read as Sri Lanka.
export function toPhoneInputValue(value = '') {
  const digits = normalizeMobile(value);
  return digits.length === 10 ? `91${digits}` : digits;
}

// <input type="date"> only shows YYYY-MM-DD; the API sends timestamps.
// Uses the local calendar day (dates are stored at local midnight).
export function toDateInputValue(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "9425526729" / "+919425526729" -> "+91 9425526729"; anything that isn't a
// 10-digit Indian number is shown as its digits.
export function formatMemberPhone(value = '') {
  const digits = normalizeMobile(value);
  if (!digits) return '';
  return digits.length === 10 ? `+91 ${digits}` : digits;
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

// Plain numeric, auto-incrementing — matches the real migrated member codes
// (e.g. "827", "1738"), which never had an "M"/"MB-" prefix.
export function buildNextMemberCode(rows = []) {
  let maxNumber = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const value = Number(String(row?.code || '').trim());
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return String(maxNumber + 1);
}

export function formatBranchLabel(branch = {}) {
  const code = String(branch.code || '').trim();
  const label = String(branch.label || '').trim();

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
  if (value === '' || value === null || value === undefined) return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return new Intl.NumberFormat('en-IN').format(number);
}


// Member code and membership no. are assigned by the backend sequence on
// create. Guessing "highest visible + 1" here collided with deleted members
// (hidden from the list but still holding their code), so a new member
// could not be saved (409).
// 'ACTIVE' / 'inactive' / 'Exited' -> 'Active' | 'Inactive' | 'Exited'.
export function memberStatusLabel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.startsWith('inact')) return 'Inactive';
  if (text.startsWith('exit')) return 'Exited';
  return 'Active';
}

export function createEmptyMemberDraft() {
  return {
    code: '',
    pfNo: '',
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
    password: '',
    photoUrl: '',
    photoFileId: null,
    basicSalary: 0,
    openingBalances: emptyOpeningBalances(),
    openingBalancesLocked: false,
    currentBalances: null,
    demandDefaults: emptyDemandDefaults(),
    nomineeName: '',
    nomineeRelation: '',
    dismembered: false,
    dismemberedDate: '',
    status: 'Active',
    payload: {},
    documents: createEmptyDocumentMap(MEMBER_DOCUMENT_DEFS)
  };
}

export function createMemberDraftFromRecord(member = {}) {
  const payload = member.payload || {};

  return {
    code: member.code || '',
    pfNo: member.pfNo || '',
    name: member.name || '',
    fatherOrHusbandName: member.fatherOrHusbandName || '',
    branchCode: member.branchCode || '',
    category: member.category || '',
    caste: member.caste || '',
    designation: member.designation || '',
    serviceName1: member.serviceName1 || '',
    serviceName2: member.serviceName2 || '',
    dateOfBirth: toDateInputValue(member.dateOfBirth),
    membershipDate: toDateInputValue(member.membershipDate),
    appointmentDate: toDateInputValue(member.appointmentDate),
    openingDate: toDateInputValue(member.openingDate || payload.openingDate),
    address: member.address || '',
    mobileNo: member.mobileNo || '',
    // Never round-trip the hash; blank means "keep the existing password".
    password: '',
    hasPassword: Boolean(member.hasPassword),
    photoUrl: member.photoUrl || '',
    photoFileId: member.photoFileId || null,
    basicSalary: member.basicSalary ?? 0,
    openingBalances: openingBalancesFromRecord(member),
    openingBalancesLocked: Boolean(member.openingBalancesLocked),
    currentBalances: member.currentBalances || null,
    demandDefaults: demandDefaultsFromRecord(member),
    nomineeName: member.nomineeName || '',
    nomineeRelation: member.nomineeRelation || '',
    dismembered: member.dismembered ?? payload.dismembered ?? false,
    dismemberedDate: toDateInputValue(member.dismemberedDate || payload.dismemberedDate),
    // Stored as 'ACTIVE' by the migration: the form's option spelling.
    status: memberStatusLabel(member.status),
    payload,
    documents: hydrateDocumentMap(MEMBER_DOCUMENT_DEFS, member.documents || {})
  };
}

export function buildMemberPayload(draft = {}) {
  const basicSalary = Number(draft.basicSalary);
  const payload = {
    ...(draft.payload || {}),
    dismembered: Boolean(draft.dismembered),
    dismemberedDate: String(draft.dismemberedDate || '').trim(),
    openingDate: String(draft.openingDate || '').trim()
  };

  return {
    code: String(draft.code || '').trim().toUpperCase() || undefined,
    pfNo: String(draft.pfNo || '').trim(),
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
    openingDate: String(draft.openingDate || '').trim(),
    appointmentDate: String(draft.appointmentDate || '').trim(),
    address: String(draft.address || '').trim(),
    mobileNo: normalizeMobile(draft.mobileNo),
    // Only send a password when one was typed; blank keeps the current one.
    password: String(draft.password || '').trim(),
    photoUrl: String(draft.photoUrl || '').trim(),
    photoFileId: draft.photoFileId || null,
    basicSalary: Number.isFinite(basicSalary) ? basicSalary : 0,
    // The stored balances change only through openingBalances (never sent
    // for a migrated member, whose opening is locked).
    openingBalances: buildOpeningBalancesPayload(draft.openingBalances || {}, { locked: draft.openingBalancesLocked }),
    demandDefaults: buildDemandDefaultsPayload(draft.demandDefaults || {}),
    nomineeName: String(draft.nomineeName || '').trim(),
    nomineeRelation: String(draft.nomineeRelation || '').trim(),
    // Dismembered goes with Inactive (the server enforces it too).
    dismembered: Boolean(draft.dismembered),
    dismemberedDate: draft.dismembered ? String(draft.dismemberedDate || '').trim() : '',
    status: draft.dismembered ? 'Inactive' : memberStatusLabel(draft.status),
    isActive: !draft.dismembered && memberStatusLabel(draft.status) === 'Active',
    payload,
    documents: serializeDocumentMap(draft.documents || {})
  };
}

import imageCompression from 'browser-image-compression';
import { EMPLOYEE_DOCUMENT_DEFS, createEmptyDocumentMap, hydrateDocumentMap, serializeDocumentMap } from '../../../components/master/documentUtils';
import { toDateInputValue } from '../members/memberUtils';
import { normalizeMobile } from '../../../utils/mobile';

export function stripPhoneDigits(value = '') {
  return String(value || '').replace(/[^\d]/g, '');
}

// Show the canonical 10-digit number as "+91 9669685295"; fall back to the raw
// digits for anything that isn't a clean 10-digit mobile.
export function formatEmployeePhone(value = '') {
  const digits = normalizeMobile(value);
  if (!digits) return '';
  return digits.length === 10 ? `+91 ${digits}` : digits;
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

export async function prepareEmployeeAvatarFile(file) {
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

export function createEmptyEmployeeDraft(rows = []) {
  return {
    code: '',
    fullName: '',
    fatherOrHusbandName: '',
    fatherName: '',
    dateOfBirth: '',
    appointmentDate: '',
    category: '',
    caste: '',
    qualification: '',
    username: '',
    email: '',
    mobileNo: '',
    designation: '',
    branchCode: '',
    address: '',
    gender: '',
    basicSalary: '',
    housingLoan: '',
    housingSide: 'Dr',
    vehicleLoan: '',
    vehicleSide: 'Dr',
    grainAdvance: '',
    grainSide: 'Dr',
    retired: false,
    retiredDate: '',
    status: 'Active',
    password: '',
    isActive: true,
    roleIds: [],
    payload: {},
    documents: createEmptyDocumentMap(EMPLOYEE_DOCUMENT_DEFS)
  };
}

export function createEmployeeDraftFromRecord(user = {}) {
  const payload = user.payload || {};
  return {
    code: user.code || '',
    fullName: user.fullName || user.name || '',
    fatherOrHusbandName: user.fatherOrHusbandName || payload.fatherOrHusbandName || '',
    fatherName: user.fatherName || payload.fatherName || '',
    dateOfBirth: toDateInputValue(user.dateOfBirth || payload.dateOfBirth),
    appointmentDate: toDateInputValue(user.appointmentDate || payload.appointmentDate),
    category: user.category || payload.category || '',
    caste: user.caste || payload.caste || '',
    qualification: user.qualification || payload.qualification || '',
    username: user.username || '',
    email: user.email || '',
    mobileNo: user.mobileNo || '',
    designation: user.designation || '',
    branchCode: user.branchCode || '',
    address: user.address || '',
    gender: user.gender || '',
    basicSalary: user.basicSalary ?? payload.basicSalary ?? '',
    ...loanField('housingLoan', 'housingSide', user.housingLoan ?? payload.housingLoan, user.housingSide || payload.housingSide),
    ...loanField('vehicleLoan', 'vehicleSide', user.vehicleLoan ?? payload.vehicleLoan, user.vehicleSide || payload.vehicleSide),
    ...loanField('grainAdvance', 'grainSide', user.grainAdvance ?? payload.grainAdvance, user.grainSide || payload.grainSide),
    retired: user.retired ?? payload.retired ?? false,
    retiredDate: toDateInputValue(user.retiredDate || payload.retiredDate),
    status: user.status || (user.isActive === false ? 'Inactive' : 'Active'),
    password: '',
    isActive: user.isActive !== false,
    hasLogin: user.hasLogin !== false,
    roleIds: (user.roles || []).map((role) => role.id),
    payload,
    documents: hydrateDocumentMap(EMPLOYEE_DOCUMENT_DEFS, user.documents || {})
  };
}

// Staff loan balances (housing, vehicle, grain) are stored as legacy keeps
// them, credit-positive: money the employee owes is negative (-44745). The
// form shows the amount without a sign and the side on the Dr / Cr switch
// (44745 Dr), so a minus never doubles the Dr; saving puts the sign back.
const sideOf = (side) => (String(side || '').trim().toLowerCase() === 'cr' ? 'Cr' : 'Dr');

function loanField(amountKey, sideKey, stored, storedSide) {
  if (stored === '' || stored === null || stored === undefined) return { [amountKey]: '', [sideKey]: sideOf(storedSide) };
  const value = Number(stored);
  if (!Number.isFinite(value)) return { [amountKey]: '', [sideKey]: sideOf(storedSide) };
  const side = value < 0 ? 'Dr' : value > 0 ? 'Cr' : sideOf(storedSide);
  return { [amountKey]: String(Math.abs(value)), [sideKey]: side };
}

function signedLoan(amount, side) {
  if (amount === '' || amount === null || amount === undefined) return '';
  const value = Math.abs(Number(amount));
  if (!Number.isFinite(value)) return '';
  if (value === 0) return 0;
  return sideOf(side) === 'Dr' ? -value : value;
}

export function buildEmployeePayload(draft = {}) {
  const payload = {
    ...(draft.payload || {}),
    fatherOrHusbandName: String(draft.fatherOrHusbandName || '').trim(),
    fatherName: String(draft.fatherName || '').trim(),
    dateOfBirth: String(draft.dateOfBirth || '').trim(),
    appointmentDate: String(draft.appointmentDate || '').trim(),
    category: String(draft.category || '').trim(),
    caste: String(draft.caste || '').trim(),
    qualification: String(draft.qualification || '').trim(),
    basicSalary: draft.basicSalary === '' || draft.basicSalary === null || draft.basicSalary === undefined
      ? ''
      : Number(draft.basicSalary),
    housingLoan: signedLoan(draft.housingLoan, draft.housingSide),
    housingSide: sideOf(draft.housingSide),
    vehicleLoan: signedLoan(draft.vehicleLoan, draft.vehicleSide),
    vehicleSide: sideOf(draft.vehicleSide),
    grainAdvance: signedLoan(draft.grainAdvance, draft.grainSide),
    grainSide: sideOf(draft.grainSide),
    retired: Boolean(draft.retired),
    retiredDate: String(draft.retiredDate || '').trim()
  };

  return {
    code: String(draft.code || '').trim().toUpperCase() || undefined,
    fullName: String(draft.fullName || '').trim(),
    name: String(draft.fullName || '').trim(),
    username: String(draft.username || '').trim(),
    email: String(draft.email || '').trim(),
    mobileNo: String(draft.mobileNo || '').trim(),
    designation: String(draft.designation || '').trim(),
    branchCode: String(draft.branchCode || '').trim().toUpperCase(),
    address: String(draft.address || '').trim(),
    gender: String(draft.gender || '').trim(),
    status: String(draft.status || 'Active').trim(),
    isActive: String(draft.status || 'Active').trim() !== 'Inactive',
    roleIds: Array.isArray(draft.roleIds) ? draft.roleIds.filter(Boolean) : [],
    password: String(draft.password || '').trim() || undefined,
    payload,
    documents: serializeDocumentMap(draft.documents || {})
  };
}

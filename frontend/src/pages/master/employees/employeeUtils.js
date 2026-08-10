import imageCompression from 'browser-image-compression';
import { EMPLOYEE_DOCUMENT_DEFS, createEmptyDocumentMap, hydrateDocumentMap, serializeDocumentMap } from '../../../components/master/documentUtils';

export function stripPhoneDigits(value = '') {
  return String(value || '').replace(/[^\d]/g, '');
}

export function formatEmployeePhone(value = '') {
  const digits = stripPhoneDigits(value);
  return digits ? `+${digits}` : '';
}

export function suggestEmployeeCode(fullName = '', username = '') {
  const basis = String(username || fullName || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '')
    .toUpperCase();

  return basis ? `EMP-${basis.slice(0, 12)}` : '';
}

export function buildNextEmployeeCode(rows = []) {
  let maxNumber = 1000;

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = String(row?.code || '').trim().toUpperCase();
    const match = code.match(/^(?:EMP-|E)(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `EMP-${maxNumber + 1}`;
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
    code: buildNextEmployeeCode(rows),
    fullName: '',
    fatherOrHusbandName: '',
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
    dateOfBirth: user.dateOfBirth || payload.dateOfBirth || '',
    appointmentDate: user.appointmentDate || payload.appointmentDate || '',
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
    housingLoan: user.housingLoan ?? payload.housingLoan ?? '',
    housingSide: user.housingSide || payload.housingSide || 'Dr',
    vehicleLoan: user.vehicleLoan ?? payload.vehicleLoan ?? '',
    vehicleSide: user.vehicleSide || payload.vehicleSide || 'Dr',
    grainAdvance: user.grainAdvance ?? payload.grainAdvance ?? '',
    grainSide: user.grainSide || payload.grainSide || 'Dr',
    retired: user.retired ?? payload.retired ?? false,
    retiredDate: user.retiredDate || payload.retiredDate || '',
    status: user.status || (user.isActive === false ? 'Inactive' : 'Active'),
    password: '',
    isActive: user.isActive !== false,
    roleIds: (user.roles || []).map((role) => role.id),
    payload,
    documents: hydrateDocumentMap(EMPLOYEE_DOCUMENT_DEFS, user.documents || {})
  };
}

export function buildEmployeePayload(draft = {}) {
  const payload = {
    ...(draft.payload || {}),
    fatherOrHusbandName: String(draft.fatherOrHusbandName || '').trim(),
    dateOfBirth: String(draft.dateOfBirth || '').trim(),
    appointmentDate: String(draft.appointmentDate || '').trim(),
    category: String(draft.category || '').trim(),
    caste: String(draft.caste || '').trim(),
    qualification: String(draft.qualification || '').trim(),
    basicSalary: draft.basicSalary === '' || draft.basicSalary === null || draft.basicSalary === undefined
      ? ''
      : Number(draft.basicSalary),
    housingLoan: draft.housingLoan === '' || draft.housingLoan === null || draft.housingLoan === undefined
      ? ''
      : Number(draft.housingLoan),
    housingSide: String(draft.housingSide || 'Dr').trim(),
    vehicleLoan: draft.vehicleLoan === '' || draft.vehicleLoan === null || draft.vehicleLoan === undefined
      ? ''
      : Number(draft.vehicleLoan),
    vehicleSide: String(draft.vehicleSide || 'Dr').trim(),
    grainAdvance: draft.grainAdvance === '' || draft.grainAdvance === null || draft.grainAdvance === undefined
      ? ''
      : Number(draft.grainAdvance),
    grainSide: String(draft.grainSide || 'Dr').trim(),
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

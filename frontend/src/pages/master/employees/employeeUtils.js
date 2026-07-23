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
    username: '',
    email: '',
    mobileNo: '',
    designation: '',
    branchCode: '',
    address: '',
    gender: '',
    status: 'Active',
    password: '',
    isActive: true,
    roleIds: [],
    documents: createEmptyDocumentMap(EMPLOYEE_DOCUMENT_DEFS)
  };
}

export function createEmployeeDraftFromRecord(user = {}) {
  return {
    code: user.code || '',
    fullName: user.fullName || user.name || '',
    username: user.username || '',
    email: user.email || '',
    mobileNo: user.mobileNo || user.phone || '',
    designation: user.designation || '',
    branchCode: user.branchCode || '',
    address: user.address || '',
    gender: user.gender || '',
    status: user.status || (user.isActive === false ? 'Inactive' : 'Active'),
    password: '',
    isActive: user.isActive !== false,
    roleIds: (user.roles || []).map((role) => role.id),
    documents: hydrateDocumentMap(EMPLOYEE_DOCUMENT_DEFS, user.documents || {})
  };
}

export function buildEmployeePayload(draft = {}) {
  return {
    code: String(draft.code || '').trim().toUpperCase() || undefined,
    fullName: String(draft.fullName || '').trim(),
    name: String(draft.fullName || '').trim(),
    username: String(draft.username || '').trim(),
    email: String(draft.email || '').trim(),
    mobileNo: String(draft.mobileNo || '').trim(),
    phone: String(draft.mobileNo || '').trim(),
    designation: String(draft.designation || '').trim(),
    branchCode: String(draft.branchCode || '').trim().toUpperCase(),
    address: String(draft.address || '').trim(),
    gender: String(draft.gender || '').trim(),
    status: String(draft.status || 'Active').trim(),
    isActive: String(draft.status || 'Active').trim() !== 'Inactive',
    roleIds: Array.isArray(draft.roleIds) ? draft.roleIds.filter(Boolean) : [],
    password: String(draft.password || '').trim() || undefined,
    documents: serializeDocumentMap(draft.documents || {})
  };
}

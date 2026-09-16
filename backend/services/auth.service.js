const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomInt } = require('crypto');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const { Employee } = require('../models/banking.models');
const { restoreMainRow } = require('../config/postgres');
const {
  DEFAULT_ROLE_DEFINITIONS,
  DEMO_ROLE_DEFINITIONS,
  DEMO_USER_DEFINITIONS,
  ROLE_TEMPLATES
} = require('../config/rbac');
const {
  PAGE_PERMISSIONS,
  buildPermissionGroups: buildGranularPermissionGroups,
  expandPermissionCodes,
  isKnownPermissionCode
} = require('../config/permissionCatalog');
const { getPasswordHashRounds } = require('../config/security');
const { sendPasswordResetOtpEmail } = require('./mailer.service');
const { createNotification } = require('./notification.service');
const {
  deleteDocumentFiles,
  deleteFileById,
  deleteFolder,
  ensureEntityFolder
} = require('./file.service');
const { buildFileViewUrl } = require('../utils/file-url');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePhone(value = '') {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
}

function isUniqueConstraintError(error) {
  return Boolean(error) && (
    error.code === '23505'
    || error.code === 11000
    || error.dbCode === 'ER_DUP_ENTRY'
  );
}

function normalizeStatus(value, fallback = 'Active') {
  const text = normalizeText(value);
  return text || fallback;
}

function isActiveFromStatus(status, fallback = true) {
  if (status == null || status === '') return fallback;
  return !String(status).trim().toLowerCase().startsWith('inact');
}

function generateStaffCode(fullName = '', username = '') {
  const basis = normalizeText(username || fullName).replace(/[^a-z0-9]+/gi, '').toUpperCase();
  return basis ? `EMP-${basis.slice(0, 12)}` : '';
}

const { getNextSequenceValue } = require('./sequence.service');

async function generateNextEmployeeCode() {
  return await getNextSequenceValue('employees', 'code');
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing in environment configuration.');
  }
  return process.env.JWT_SECRET;
}

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h'
  });
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), getPasswordHashRounds());
}

async function comparePassword(password, hash) {
  return bcrypt.compare(String(password || ''), String(hash || ''));
}

function generatePasswordResetOtp() {
  return String(randomInt(100000, 1000000));
}

function buildOtpExpiry() {
  const minutes = Math.max(1, Number(process.env.PASSWORD_RESET_OTP_MINUTES || 10));
  return new Date(Date.now() + minutes * 60 * 1000);
}

function isExpired(value) {
  if (!value) return true;
  return new Date(value).getTime() <= Date.now();
}

async function notifySafely(payload) {
  try {
    return await createNotification(payload);
  } catch (error) {
    console.error('[notification] failed to create auth notification:', error.message);
    return null;
  }
}

function mapRoleForResponse(role = {}) {
  const codeList = Array.isArray(role.permissions) ? role.permissions : [];
  const expandedPermissions = expandPermissionCodes(codeList);
  const permissionObjects = expandedPermissions
    .map((code) => PAGE_PERMISSIONS.find((permission) => permission.code === code))
    .filter(Boolean);

  return {
    id: String(role._id || role.id),
    code: role.code,
    name: role.name,
    description: role.description || '',
    isSystem: Boolean(role.isSystem),
    isActive: role.isActive !== false,
    permissions: expandedPermissions,
    permissionObjects,
    payload: role.payload || {}
  };
}

function normalizePermissionCode(value) {
  return String(value || '').trim();
}

function normalizePermissionCodes(permissionCodes = []) {
  const seen = new Set();
  const normalized = [];

  for (const code of Array.isArray(permissionCodes) ? permissionCodes : []) {
    const value = normalizePermissionCode(code);
    if (!value) {
      continue;
    }

    if (!isKnownPermissionCode(value)) {
      const error = new Error(`Unknown permission: ${value}`);
      error.statusCode = 400;
      throw error;
    }

    for (const resolvedCode of expandPermissionCodes([value])) {
      if (seen.has(resolvedCode)) {
        continue;
      }
      seen.add(resolvedCode);
      normalized.push(resolvedCode);
    }
  }

  return normalized;
}

function buildPermissionGroups() {
  return buildGranularPermissionGroups();
}

function buildRolePermissionMatrix(roles = []) {
  const sections = buildPermissionGroups();

  return roles.map((role) => {
    const permissionSet = new Set(role.permissions || []);
    return {
      ...role,
      groupedPermissions: sections.map((section) => ({
        key: section.key,
        label: section.label,
        pages: section.pages.map((page) => ({
          key: page.key,
          label: page.label,
          permissions: page.permissions.map((permission) => ({
            ...permission,
            granted: permissionSet.has(permission.code)
          }))
        }))
      }))
    };
  });
}

function getPermissionTemplates() {
  return ROLE_TEMPLATES.map((template) => ({
    ...template,
    permissions: expandPermissionCodes(
      DEFAULT_ROLE_DEFINITIONS.find((role) => role.code === template.code)?.permissions
      || DEMO_ROLE_DEFINITIONS.find((role) => role.code === template.code)?.permissions
      || []
    )
  }));
}

// HR fields (father's name, DOB, category, caste, qualification, salary,
// loans) belong on the real `employees` table now, not schemaless JSON on a
// login row. The frontend (frontend/src/pages/master/employees/employeeUtils.js
// buildEmployeePayload) still sends them bundled inside `data.payload` — this
// maps that bundle onto Employee's real columns. `fatherOrHusbandName` has no
// dedicated employees column, so it's kept in the Employee row's own payload.
function extractEmployeeHrFields(data = {}) {
  const payload = data.payload || {};
  const hr = {};

  if (payload.fatherName !== undefined) hr.fatherName = String(payload.fatherName || '').trim();
  if (payload.dateOfBirth !== undefined) hr.dateOfBirth = payload.dateOfBirth || null;
  if (payload.appointmentDate !== undefined) hr.appointmentDate = payload.appointmentDate || null;
  if (payload.category !== undefined) hr.category = String(payload.category || '').trim();
  if (payload.caste !== undefined) hr.caste = String(payload.caste || '').trim();
  if (payload.qualification !== undefined) hr.qualification = String(payload.qualification || '').trim();
  if (payload.basicSalary !== undefined) hr.basicSalary = payload.basicSalary === '' ? null : Number(payload.basicSalary);
  if (payload.housingLoan !== undefined) hr.homeLoanBalance = payload.housingLoan === '' ? null : Number(payload.housingLoan);
  if (payload.housingSide !== undefined) hr.homeLoanCrDr = String(payload.housingSide || 'Dr').trim();
  if (payload.vehicleLoan !== undefined) hr.vehicleLoanBalance = payload.vehicleLoan === '' ? null : Number(payload.vehicleLoan);
  if (payload.vehicleSide !== undefined) hr.vehicleLoanCrDr = String(payload.vehicleSide || 'Dr').trim();
  if (payload.grainAdvance !== undefined) hr.grainAdvanceBalance = payload.grainAdvance === '' ? null : Number(payload.grainAdvance);
  if (payload.grainSide !== undefined) hr.grainAdvanceCrDr = String(payload.grainSide || 'Dr').trim();
  if (payload.retired !== undefined) hr.retired = Boolean(payload.retired);
  if (payload.retiredDate !== undefined) hr.retirementDate = payload.retiredDate || null;

  // Login-side facts the HR record should mirror too (so an employee with no
  // login still has correct designation/branch/contact/documents on their own
  // HR record, and reports/lookups sourced from `employees` stay accurate).
  if (data.designation !== undefined) hr.designation = String(data.designation || '').trim();
  if (data.branchCode !== undefined) hr.branchCode = normalizeUpper(data.branchCode);
  if (data.mobileNo !== undefined) hr.mobileNo = normalizePhone(data.mobileNo);
  if (data.address !== undefined) hr.address = String(data.address || '').trim();
  if (data.documents !== undefined) hr.documents = data.documents || {};
  if (data.documentsFolderId !== undefined) hr.documentsFolderId = data.documentsFolderId || null;
  if (data.fullName !== undefined || data.name !== undefined) {
    hr.name = String(data.fullName || data.name || '').trim();
  }
  if (data.status !== undefined) {
    hr.isActive = data.status !== 'Inactive';
  } else if (data.isActive !== undefined) {
    hr.isActive = Boolean(data.isActive);
  }
  if (payload.fatherOrHusbandName !== undefined) {
    hr.payload = { fatherOrHusbandName: String(payload.fatherOrHusbandName || '').trim() };
  }

  return hr;
}

// Merges a linked Employee's HR fields onto a user's response, at the TOP
// LEVEL (not nested in `payload`) — the frontend already checks
// `user.fieldName || payload.fieldName` for every HR field
// (createEmployeeDraftFromRecord in employeeUtils.js), preferring top-level,
// so no frontend change is needed for it to pick these up correctly.
function mergeEmployeeIntoResponse(response, employee) {
  if (!employee) return response;
  const employeePayload = typeof employee.payload === 'string' ? JSON.parse(employee.payload || '{}') : (employee.payload || {});
  return {
    ...response,
    employeeCode: employee.code || '',
    fatherName: employee.fatherName || '',
    fatherOrHusbandName: employeePayload.fatherOrHusbandName || '',
    dateOfBirth: employee.dateOfBirth || '',
    appointmentDate: employee.appointmentDate || '',
    category: employee.category || '',
    caste: employee.caste || '',
    qualification: employee.qualification || '',
    basicSalary: employee.basicSalary ?? '',
    housingLoan: employee.homeLoanBalance ?? '',
    housingSide: employee.homeLoanCrDr || 'Dr',
    vehicleLoan: employee.vehicleLoanBalance ?? '',
    vehicleSide: employee.vehicleLoanCrDr || 'Dr',
    grainAdvance: employee.grainAdvanceBalance ?? '',
    grainSide: employee.grainAdvanceCrDr || 'Dr',
    retired: employee.retired ?? false,
    retiredDate: employee.retirementDate || ''
  };
}

// Creates or updates the linked Employee HR row for a user. Returns the
// employee's code (to be stored as user.employeeCode) — reuses the SAME
// employees_code_seq sequence Employee seeding already numbers itself from,
// so employees.code stays the one canonical code space.
async function syncLinkedEmployee(existingEmployeeCode, data, desiredCode = null, { alwaysLink = false } = {}) {
  const hrFields = extractEmployeeHrFields(data);
  const targetCode = existingEmployeeCode || (desiredCode ? normalizeUpper(desiredCode) : null);

  // On update, don't spontaneously create an Employee from an edit that
  // touched no HR fields and isn't already linked (e.g. a password change).
  // On create, every login made through this endpoint IS "adding an
  // employee" in the current UI, so it must always get a code — callers
  // pass alwaysLink: true there.
  if (!alwaysLink && Object.keys(hrFields).length === 0 && !targetCode) return null;

  if (targetCode) {
    const existing = await Employee.findOne({ code: targetCode });
    if (existing) {
      existing.set(hrFields);
      await existing.save();
      return targetCode;
    }
    if (desiredCode) {
      // Caller explicitly asked for this code (e.g. data.code on create) — honor it.
      await Employee.create({ code: targetCode, isActive: true, ...hrFields });
      return targetCode;
    }
  }

  const code = normalizeUpper(await generateNextEmployeeCode());
  await Employee.create({ code, isActive: true, ...hrFields });
  return code;
}

function applyStaffFields(user, data = {}) {
  if (!user) return user;

  if (data.code !== undefined) {
    user.code = normalizeUpper(data.code);
  }

  if (data.fullName !== undefined || data.name !== undefined) {
    const nextName = normalizeText(data.fullName !== undefined ? data.fullName : data.name);
    user.fullName = nextName;
    user.name = normalizeText(data.name !== undefined ? data.name : nextName);
  }

  if (data.designation !== undefined) {
    user.designation = normalizeText(data.designation);
  }

  if (data.branchCode !== undefined) {
    user.branchCode = normalizeUpper(data.branchCode);
  }

  if (data.mobileNo !== undefined) {
    user.mobileNo = normalizePhone(data.mobileNo);
  }

  if (data.status !== undefined) {
    user.status = normalizeStatus(data.status, user.status || 'Active');
    user.isActive = isActiveFromStatus(user.status, user.isActive !== false);
  } else if (data.isActive !== undefined) {
    user.isActive = Boolean(data.isActive);
    user.status = user.isActive ? 'Active' : 'Inactive';
  }

  if (data.payload !== undefined) {
    user.payload = data.payload || {};
  }

  if (data.documents !== undefined) {
    user.documents = data.documents || {};
  }

  if (data.documentsFolderId !== undefined) {
    user.documentsFolderId = data.documentsFolderId || null;
  }

  return user;
}

async function syncEmployeeDocumentsFolder(user) {
  if (!user?._id) return null;

  const folder = await ensureEntityFolder({
    moduleName: 'employees',
    entityId: String(user._id),
    entityName: user.fullName || user.name || user.username || user.code || 'Employee',
    entityCode: user.code || '',
    createdBy: user.createdByUserId || user.updatedByUserId || null
  });

  const folderId = folder?.id ? String(folder.id) : null;
  if (folderId && String(user.documentsFolderId || '') !== folderId) {
    user.documentsFolderId = folderId;
    await user.save();
  }

  return folderId;
}

async function buildAccessProfile(userDoc) {
  const user = userDoc?.populate ? userDoc : await User.findById(userDoc);
  if (!user) return null;

  await user.populate({
    path: 'roles',
    select: 'code name description isSystem isActive permissions payload'
  });

  const roles = Array.isArray(user.roles) ? user.roles.map((role) => mapRoleForResponse(role)) : [];
  const permissionMap = new Map();
  for (const role of roles) {
    for (const code of role.permissions || []) {
      const permission = PAGE_PERMISSIONS.find((item) => item.code === code);
      if (permission) {
        permissionMap.set(permission.code, permission);
      }
    }
  }

  const profile = {
    id: String(user._id),
    code: user.code || '',
    fullName: user.fullName,
    name: user.name || user.fullName || '',
    username: user.username,
    email: user.email,
    mobileNo: normalizePhone(user.mobileNo || ''),
    address: user.address || '',
    gender: user.gender || '',
    designation: user.designation || '',
    branchCode: user.branchCode || '',
    status: user.status || (user.isActive !== false ? 'Active' : 'Inactive'),
    avatarUrl: buildFileViewUrl(user.avatarFileId || user.avatarUrl || ''),
    avatarFileId: user.avatarFileId ? String(user.avatarFileId) : null,
    documentsFolderId: user.documentsFolderId ? String(user.documentsFolderId) : null,
    documents: user.documents || {},
    isActive: user.isActive !== false,
    lastLoginAt: user.lastLoginAt || null,
    employeeCode: user.employeeCode || '',
    payload: user.payload || {},
    roles,
    permissions: [...permissionMap.keys()],
    permissionObjects: [...permissionMap.values()],
    isSuperAdmin: roles.some((role) => role.code === 'admin')
  };

  // Optional link (see users.employeeCode in config/tableSchemas.js) — not
  // every login belongs to a staff member. When it does, merge in the real HR
  // fields so the Employees admin screen keeps working exactly as before,
  // now backed by the real employees table instead of schemaless JSON.
  if (user.employeeCode) {
    const employee = await Employee.findOne({ code: user.employeeCode }).lean();
    return mergeEmployeeIntoResponse(profile, employee);
  }
  return profile;
}

async function findUserByLogin(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  if (!value) return null;
  return User.findOne({
    $or: [
      { email: value },
      { username: value },
      { code: value.toUpperCase() }
    ]
  });
}

async function login({ identifier, password }) {
  const user = await findUserByLogin(identifier);
  if (!user) {
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    throw error;
  }

  if (user.isActive === false) {
    const error = new Error('User account is disabled');
    error.statusCode = 403;
    throw error;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    throw error;
  }

  user.lastLoginAt = new Date();
  await user.save();

  return {
    token: signToken({
      sub: String(user._id),
      uid: String(user._id),
      email: user.email,
      username: user.username
    }),
    user: await buildAccessProfile(user)
  };
}

async function createPasswordResetRequest(identifier, meta = {}) {
  const user = await findUserByLogin(identifier);
  if (!user) {
    return { message: 'If the account exists, an OTP has been sent to the registered email address.' };
  }

  const otp = generatePasswordResetOtp();
  const otpHash = await bcrypt.hash(otp, getPasswordHashRounds());

  user.passwordReset = {
    otpHash,
    expiresAt: buildOtpExpiry(),
    attempts: 0,
    requestedAt: new Date(),
    requestedFromIp: meta.ip || '',
    requestedUserAgent: meta.userAgent || ''
  };
  await user.save();

  try {
    await sendPasswordResetOtpEmail({
      name: user.fullName,
      otp,
      minutes: Math.max(1, Number(process.env.PASSWORD_RESET_OTP_MINUTES || 10)),
      to: user.email
    });
  } catch (error) {
    console.error('Password reset email failed:', error.message);
  }

  await notifySafely({
    title: 'Password Reset Requested',
    message: `A password reset OTP was requested for ${user.fullName || user.username || user.email}.`,
    type: 'security',
    severity: 'high',
    module: 'security',
    action: 'reset-requested',
    actionUrl: '/app/profile',
    entityType: 'User',
    entityId: String(user._id),
    entityCode: user.code || '',
    recipientUserIds: [user._id],
    includeDefaultRecipients: false,
    includeActorUserId: false,
    payload: {
      source: 'password-reset-request',
      requestedFromIp: meta.ip || '',
      requestedUserAgent: meta.userAgent || ''
    }
  });

  return { message: 'If the account exists, an OTP has been sent to the registered email address.' };
}

async function resetPasswordWithOtp({ identifier, otp, password }) {
  const user = await findUserByLogin(identifier);
  if (!user) {
    const error = new Error('Invalid OTP or expired request');
    error.statusCode = 400;
    throw error;
  }

  const reset = user.passwordReset || {};
  if (!reset.otpHash || isExpired(reset.expiresAt)) {
    user.passwordReset = {};
    await user.save();
    const error = new Error('Invalid OTP or expired request');
    error.statusCode = 400;
    throw error;
  }

  const valid = await bcrypt.compare(String(otp || '').trim(), reset.otpHash);
  if (!valid) {
    const attempts = Number(reset.attempts || 0) + 1;
    user.passwordReset.attempts = attempts;
    await user.save();

    if (attempts >= Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS || 5)) {
      user.passwordReset = {};
      await user.save();
    }

    const error = new Error('Invalid OTP or expired request');
    error.statusCode = 400;
    throw error;
  }

  if (!password || String(password).trim().length < 8) {
    const error = new Error('Password must be at least 8 characters long');
    error.statusCode = 400;
    throw error;
  }

  user.passwordHash = await hashPassword(password);
  user.passwordReset = {};
  await user.save();

  await notifySafely({
    title: 'Password Reset Completed',
    message: `Password reset completed for ${user.fullName || user.username || user.email}.`,
    type: 'security',
    severity: 'high',
    module: 'security',
    action: 'reset-completed',
    actionUrl: '/app/profile',
    entityType: 'User',
    entityId: String(user._id),
    entityCode: user.code || '',
    recipientUserIds: [user._id],
    includeDefaultRecipients: false,
    includeActorUserId: false,
    payload: {
      source: 'password-reset-completed'
    }
  });

  return { message: 'Password reset successfully' };
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    const error = new Error('Incorrect current password');
    error.statusCode = 400;
    throw error;
  }

  if (!newPassword || String(newPassword).trim().length < 8) {
    const error = new Error('New password must be at least 8 characters long');
    error.statusCode = 400;
    throw error;
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  await notifySafely({
    title: 'Password Changed',
    message: `Password changed successfully for ${user.fullName || user.username || user.email}.`,
    type: 'security',
    severity: 'medium',
    module: 'security',
    action: 'changed',
    actionUrl: '/app/profile',
    entityType: 'User',
    entityId: String(user._id),
    entityCode: user.code || '',
    recipientUserIds: [user._id],
    includeDefaultRecipients: false,
    includeActorUserId: false,
    payload: {
      source: 'password-change'
    }
  });

  return { message: 'Password changed successfully' };
}

async function listUsers(search = '') {
  const term = String(search || '').trim();
  const query = term
    ? {
        $or: [
          { fullName: { $regex: term, $options: 'i' } },
          { name: { $regex: term, $options: 'i' } },
          { username: { $regex: term, $options: 'i' } },
          { email: { $regex: term, $options: 'i' } },

          { mobileNo: { $regex: term, $options: 'i' } },
          { code: { $regex: term, $options: 'i' } },
          { branchCode: { $regex: term, $options: 'i' } },
          { designation: { $regex: term, $options: 'i' } },
          { status: { $regex: term, $options: 'i' } }
        ]
      }
    : {};

  const users = await User.find(query).sort({ updatedAt: -1 }).populate({
    path: 'roles',
    select: 'code name description isSystem isActive permissions payload'
  });

  const rows = [];
  for (const user of users) {
    rows.push(await buildAccessProfile(user));
  }
  return rows;
}

async function getRoleById(roleId) {
  const role = await Role.findById(roleId).lean();
  return role ? mapRoleForResponse(role) : null;
}

async function listRoles(search = '') {
  const term = String(search || '').trim();
  const query = term
    ? {
        $or: [
          { code: { $regex: term, $options: 'i' } },
          { name: { $regex: term, $options: 'i' } },
          { description: { $regex: term, $options: 'i' } }
        ]
      }
    : {};

  const roles = await Role.find(query).sort({ updatedAt: -1 }).lean();
  return roles.map((role) => mapRoleForResponse(role));
}

async function listPermissions() {
  return PAGE_PERMISSIONS;
}

async function getPermissionCatalog() {
  return {
    permissions: PAGE_PERMISSIONS,
    groups: buildPermissionGroups(),
    roleTemplates: getPermissionTemplates()
  };
}

async function getRolePermissionMatrix() {
  const roles = await listRoles('');
  return buildRolePermissionMatrix(roles);
}

async function upsertRoleDefinition(definition = {}) {
  const code = String(definition.code || '').trim().toLowerCase();
  const name = String(definition.name || '').trim();
  if (!code || !name) {
    return null;
  }

  await Role.updateOne(
    { code },
    {
      $setOnInsert: {
        code
      },
      $set: {
        name,
        description: String(definition.description || '').trim(),
        isSystem: Boolean(definition.isSystem),
        isActive: definition.isActive !== false,
        permissions: normalizePermissionCodes(Array.isArray(definition.permissions) ? definition.permissions : []),
        payload: definition.payload || {}
      }
    },
    { upsert: true }
  );

  return Role.findOne({ code });
}

async function seedUserDefinition(definition = {}) {
  const fullName = String(definition.fullName || '').trim();
  const username = normalizeUsername(definition.username || definition.email);
  const email = normalizeEmail(definition.email || definition.username);
  const password = String(definition.password || '').trim();

  if (!fullName || !username || !email || !password) {
    return null;
  }

  const roleCodes = Array.isArray(definition.roleCodes) ? definition.roleCodes.filter(Boolean) : [];
  const roles = roleCodes.length
    ? await Role.find({ code: { $in: roleCodes } }).select('_id code')
    : [];

  const roleIds = [];
  for (const code of roleCodes) {
    const role = roles.find((item) => item.code === code);
    if (!role) {
      throw new Error(`Missing seed role: ${code}`);
    }
    roleIds.push(role._id);
  }

  const passwordHash = await hashPassword(password);
  const explicitCode = definition.code !== undefined ? normalizeUpper(definition.code) : '';
  const seedCode = explicitCode || await generateNextEmployeeCode();

  const buildPatch = (codeValue, includeCode = true) => {
    const patch = {
      fullName,
      name: normalizeText(definition.name || fullName),
      username,
      email,
      passwordHash,

      mobileNo: definition.mobileNo !== undefined ? normalizePhone(definition.mobileNo) : undefined,
      address: definition.address !== undefined ? String(definition.address).trim() : undefined,
      gender: definition.gender !== undefined ? String(definition.gender).trim() : undefined,
      designation: definition.designation !== undefined ? normalizeText(definition.designation) : undefined,
      branchCode: definition.branchCode !== undefined ? normalizeUpper(definition.branchCode) : undefined,
      status: definition.status !== undefined ? normalizeStatus(definition.status, definition.isActive === false ? 'Inactive' : 'Active') : undefined,
      avatarUrl: String(definition.avatarUrl || '').trim(),
      avatarFileId: definition.avatarFileId || null,
      isActive: definition.isActive !== false,
      roles: roleIds,
      payload: definition.payload || {}
    };

    if (includeCode) {
      patch.code = codeValue;
    }

    return patch;
  };

  const findSeededUser = async (codeValue) => {
    const clauses = [{ email }, { username }];
    if (codeValue) {
      clauses.push({ code: codeValue });
    }
    return User.findOne({ $or: clauses });
  };

  const existing = await findSeededUser(explicitCode || seedCode);
  if (existing) {
    existing.set(buildPatch(existing.code || seedCode, false));
    await existing.save();
    return buildAccessProfile(existing);
  }

  let nextCode = seedCode;
  const maxAttempts = explicitCode ? 1 : 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const user = await User.create({ ...buildPatch(nextCode), code: nextCode });
      return buildAccessProfile(user);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const retryExisting = await findSeededUser(nextCode);
      if (retryExisting) {
        retryExisting.set(buildPatch(retryExisting.code || nextCode, false));
        await retryExisting.save();
        return buildAccessProfile(retryExisting);
      }

      if (explicitCode) {
        throw error;
      }

      nextCode = await generateNextEmployeeCode();
    }
  }

  const fallback = await findSeededUser(nextCode);
  if (fallback) {
    fallback.set(buildPatch(fallback.code || nextCode, false));
    await fallback.save();
    return buildAccessProfile(fallback);
  }

  throw new Error('Unable to seed user definition');
}

async function createUser(data = {}) {
  const fullName = String(data.fullName || data.name || '').trim();
  const username = normalizeUsername(data.username || data.email);
  const email = normalizeEmail(data.email || data.username);
  const password = String(data.password || '').trim();

  if (!fullName || !username || !email) {
    const error = new Error('fullName, username, and email are required');
    error.statusCode = 400;
    throw error;
  }
  if (password.length < 8) {
    const error = new Error('Password must be at least 8 characters long');
    error.statusCode = 400;
    throw error;
  }

  const roleIds = Array.isArray(data.roleIds) ? data.roleIds.filter(Boolean) : [];
  const passwordHash = await hashPassword(password);
  const status = normalizeStatus(data.status, data.isActive === false ? 'Inactive' : 'Active');
  // The HR record (employees table) is the canonical code source
  // (employees_code_seq) — create/reuse it first, then this login shares
  // the same code and links to it via employeeCode.
  const code = await syncLinkedEmployee(null, data, data.code, { alwaysLink: true });

  const user = await User.create({
    code,
    employeeCode: code,
    fullName,
    name: String(data.name || fullName).trim(),
    username,
    email,
    passwordHash,

    mobileNo: data.mobileNo !== undefined ? normalizePhone(data.mobileNo) : undefined,
    address: String(data.address || '').trim(),
    gender: String(data.gender || '').trim(),
    designation: String(data.designation || '').trim(),
    branchCode: normalizeUpper(data.branchCode),
    status,
    avatarUrl: String(data.avatarUrl || '').trim(),
    avatarFileId: data.avatarFileId || null,
    documentsFolderId: data.documentsFolderId || null,
    documents: data.documents || {},
    isActive: isActiveFromStatus(status, data.isActive !== false),
    roles: roleIds,
    payload: data.payload || {}
  });

  await syncEmployeeDocumentsFolder(user);

  await notifySafely({
    title: 'Employee Created',
    message: `Employee ${fullName} was created.`,
    type: 'master',
    severity: 'medium',
    module: 'master',
    action: 'created',
    actionUrl: '/app/master/employees',
    entityType: 'Employee',
    entityId: String(user._id),
    entityCode: user.code || ''
  });

  return buildAccessProfile(user);
}

async function updateUser(userId, data = {}) {
  const user = await User.findById(userId);
  if (!user) return null;

  const previousAvatarFileId = user.avatarFileId ? String(user.avatarFileId) : '';

  applyStaffFields(user, data);
  if (data.fullName !== undefined && data.name === undefined) {
    user.name = String(data.fullName || '').trim();
  }
  if (data.name !== undefined && data.fullName === undefined) {
    user.fullName = String(data.name || '').trim();
  }
  if (data.username !== undefined) user.username = normalizeUsername(data.username);
  if (data.email !== undefined) user.email = normalizeEmail(data.email);

  if (data.mobileNo !== undefined) user.mobileNo = normalizePhone(data.mobileNo);
  if (data.address !== undefined) user.address = String(data.address || '').trim();
  if (data.gender !== undefined) user.gender = String(data.gender || '').trim();
  if (data.avatarUrl !== undefined) user.avatarUrl = String(data.avatarUrl || '').trim();
  if (data.avatarFileId !== undefined) user.avatarFileId = data.avatarFileId || null;
  if (data.documentsFolderId !== undefined) user.documentsFolderId = data.documentsFolderId || null;
  if (data.documents !== undefined) user.documents = data.documents || {};
  if (data.payload !== undefined) user.payload = data.payload || {};
  if (Array.isArray(data.roleIds)) user.roles = data.roleIds.filter(Boolean);
  if (data.password) {
    user.passwordHash = await hashPassword(data.password);
  }

  const linkedEmployeeCode = await syncLinkedEmployee(user.employeeCode || null, data);
  if (linkedEmployeeCode && !user.employeeCode) {
    user.employeeCode = linkedEmployeeCode;
  }

  await user.save();

  await syncEmployeeDocumentsFolder(user);

  const nextAvatarFileId = user.avatarFileId ? String(user.avatarFileId) : '';
  if (previousAvatarFileId && previousAvatarFileId !== nextAvatarFileId) {
    await deleteFileById(previousAvatarFileId).catch(() => {});
  }

  await notifySafely({
    title: 'Employee Profile Updated',
    message: `Employee ${user.fullName || user.username || user.email} was updated.`,
    type: 'master',
    severity: 'medium',
    module: 'master',
    action: 'updated',
    actionUrl: '/app/master/employees',
    entityType: 'Employee',
    entityId: String(user._id),
    entityCode: user.code || ''
  });

  return buildAccessProfile(user);
}

async function deleteUser(userId) {
  const user = await User.findById(userId);
  if (!user) return false;

  await deleteDocumentFiles(user.documents || {});
  if (user.avatarFileId) {
    await deleteFileById(user.avatarFileId).catch(() => {});
  }

  if (user.documentsFolderId) {
    await deleteFolder(user.documentsFolderId).catch(() => {});
  }

  await user.deleteOne();

  // Soft-delete (see deleteMainRow in config/postgres.js) the linked HR
  // record too — from this UI's perspective "delete employee" is one action.
  // Revoking someone's login doesn't happen here without also retiring their
  // HR record; a future frontend split could separate the two.
  if (user.employeeCode) {
    const employee = await Employee.findOne({ code: user.employeeCode });
    if (employee) await employee.deleteOne();
  }

  await notifySafely({
    title: 'Employee Deleted',
    message: `Employee ${user.fullName || user.username || user.email} was deleted.`,
    type: 'master',
    severity: 'high',
    module: 'master',
    action: 'deleted',
    actionUrl: '/app/master/employees',
    entityType: 'Employee',
    entityId: String(user._id),
    entityCode: user.code || ''
  });
  return true;
}

// Mirrors deleteUser's reach — restoring a login must also restore its linked
// HR record together (same pattern as restoreVoucher in banking.service.js
// restoring a voucher's journal_lines/recovery_lines together).
async function restoreUser(userId) {
  const user = await User.findById(userId).withDeleted().lean();
  if (!user || !user.deletedAt) return false;

  const restored = await restoreMainRow('users', userId);
  if (!restored) return false;

  if (user.employeeCode) {
    const employee = await Employee.findOne({ code: user.employeeCode }).withDeleted().lean();
    if (employee && employee.deletedAt) {
      await restoreMainRow('employees', employee.id);
    }
  }
  return true;
}

async function createRole(data = {}) {
  const code = String(data.code || data.name || '').trim().toLowerCase().replace(/\s+/g, '-');
  const name = String(data.name || '').trim();

  if (!code || !name) {
    const error = new Error('code and name are required');
    error.statusCode = 400;
    throw error;
  }

  const permissions = normalizePermissionCodes(data.permissionCodes || data.permissions || []);

  const role = await Role.create({
    code,
    name,
    description: String(data.description || '').trim(),
    isSystem: Boolean(data.isSystem),
    isActive: data.isActive !== false,
    permissions,
    payload: data.payload || {}
  });

  await notifySafely({
    title: 'Role Created',
    message: `Role ${role.name} was created.`,
    type: 'system',
    severity: 'medium',
    module: 'admin',
    action: 'created',
    actionUrl: '/app/roles',
    entityType: 'Role',
    entityId: String(role._id),
    entityCode: role.code || ''
  });

  return getRoleById(role.id);
}

async function updateRole(roleId, data = {}) {
  const role = await Role.findById(roleId);
  if (!role) return null;

  if (data.code !== undefined) role.code = String(data.code || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (data.name !== undefined) role.name = String(data.name || '').trim();
  if (data.description !== undefined) role.description = String(data.description || '').trim();
  if (data.isSystem !== undefined) role.isSystem = Boolean(data.isSystem);
  if (data.isActive !== undefined) role.isActive = Boolean(data.isActive);
  if (data.payload !== undefined) role.payload = data.payload || {};
  if (Array.isArray(data.permissionCodes)) {
    role.permissions = normalizePermissionCodes(data.permissionCodes);
  } else if (Array.isArray(data.permissions)) {
    role.permissions = normalizePermissionCodes(data.permissions);
  }

  await role.save();
  await notifySafely({
    title: 'Role Updated',
    message: `Role ${role.name} was updated.`,
    type: 'system',
    severity: 'medium',
    module: 'admin',
    action: 'updated',
    actionUrl: '/app/roles',
    entityType: 'Role',
    entityId: String(role._id),
    entityCode: role.code || ''
  });
  return getRoleById(role.id);
}

async function updateRolePermissions(roleId, permissionCodes = []) {
  const role = await Role.findById(roleId);
  if (!role) return null;

  role.permissions = normalizePermissionCodes(permissionCodes);
  await role.save();
  await notifySafely({
    title: 'Role Permissions Updated',
    message: `Permissions were updated for role ${role.name}.`,
    type: 'system',
    severity: 'medium',
    module: 'admin',
    action: 'permissions-updated',
    actionUrl: '/app/roles',
    entityType: 'Role',
    entityId: String(role._id),
    entityCode: role.code || ''
  });
  return getRoleById(role.id);
}

async function deleteRole(roleId) {
  const role = await Role.findById(roleId);
  if (!role) return false;
  if (role.isSystem) {
    const error = new Error('System roles cannot be deleted');
    error.statusCode = 400;
    throw error;
  }
  await role.deleteOne();
  await notifySafely({
    title: 'Role Deleted',
    message: `Role ${role.name} was deleted.`,
    type: 'system',
    severity: 'high',
    module: 'admin',
    action: 'deleted',
    actionUrl: '/app/roles',
    entityType: 'Role',
    entityId: String(role._id),
    entityCode: role.code || ''
  });
  return true;
}

async function ensureDefaultRoles() {
  const seededRoles = [];
  for (const definition of DEFAULT_ROLE_DEFINITIONS) {
    await upsertRoleDefinition(definition);
    seededRoles.push(definition.code);
  }
  return seededRoles;
}

async function ensureDemoRoles() {
  const seededRoles = [];
  for (const definition of DEMO_ROLE_DEFINITIONS) {
    await upsertRoleDefinition(definition);
    seededRoles.push(definition.code);
  }
  return seededRoles;
}

async function seedBootstrapAdmin() {
  const bootstrapEmail = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@bank.local');
  const bootstrapUsername = normalizeUsername(process.env.BOOTSTRAP_ADMIN_USERNAME || bootstrapEmail);
  const bootstrapPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@12345').trim();
  const bootstrapName = String(process.env.BOOTSTRAP_ADMIN_NAME || 'System Admin').trim() || 'System Admin';
  const bootstrapCode = normalizeUpper(process.env.BOOTSTRAP_ADMIN_CODE || 'EMP-1000');
  const bootstrapMobileNo = String(process.env.BOOTSTRAP_ADMIN_MOBILE_NO || '').trim();
  const bootstrapAddress = String(process.env.BOOTSTRAP_ADMIN_ADDRESS || '').trim();
  const bootstrapGender = String(process.env.BOOTSTRAP_ADMIN_GENDER || '').trim();
  const bootstrapDesignation = String(process.env.BOOTSTRAP_ADMIN_DESIGNATION || 'System Admin').trim();

  if (!bootstrapEmail || !bootstrapPassword) {
    return null;
  }

  const adminRole = await Role.findOne({ code: 'admin' }).select('_id');
  if (!adminRole) return null;

  const profile = await seedUserDefinition({
    code: bootstrapCode,
    fullName: bootstrapName,
    username: bootstrapUsername,
    email: bootstrapEmail,
    password: bootstrapPassword,
    mobileNo: bootstrapMobileNo || undefined,
    address: bootstrapAddress || undefined,
    gender: bootstrapGender || undefined,
    designation: bootstrapDesignation || undefined,
    roleCodes: ['admin']
  });

  return profile
    ? {
        fullName: profile.fullName,
        username: profile.username,
        email: profile.email,
        roleCodes: ['admin'],
        password: bootstrapPassword
      }
    : null;
}

async function seedDemoUsers() {
  const seededUsers = [];

  for (const definition of DEMO_USER_DEFINITIONS) {
    const profile = await seedUserDefinition(definition);
    if (profile) {
      seededUsers.push({
        fullName: profile.fullName,
        username: profile.username,
        email: profile.email,
        roleCodes: (definition.roleCodes || []).slice(),
        password: definition.password
      });
    }
  }

  return seededUsers;
}

module.exports = {
  buildAccessProfile,
  changePassword,
  comparePassword,
  createPasswordResetRequest,
  createRole,
  createUser,
  deleteRole,
  deleteUser,
  restoreUser,
  getPermissionCatalog,
  getRolePermissionMatrix,
  ensureDefaultRoles,
  ensureDemoRoles,
  findUserByLogin,
  getRoleById,
  hashPassword,
  listPermissions,
  listRoles,
  listUsers,
  login,
  normalizeEmail,
  normalizeUsername,
  resetPasswordWithOtp,
  seedBootstrapAdmin,
  seedDemoUsers,
  signToken,
  updateRole,
  updateRolePermissions,
  updateUser
};










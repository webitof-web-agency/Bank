const bcrypt = require('bcryptjs');
const {
  BANK_ACCOUNT_SEEDS,
  BANK_TRANSACTION_SEEDS,
  BRANCH_SEEDS,
  COMMITTEE_SEED,
  MANAGER_SEEDS,
  DEMAND_SEEDS,
  EMPLOYEE_SEEDS,
  LEDGER_SEEDS,
  MEMBER_SEEDS,
  NO_INTEREST_MEMBER_SEEDS,
  RATE_SEEDS,
  SOCIETY_SEED,
  VOUCHER_SEEDS
} = require('../config/bankingSeed');
const {
  BankAccount,
  BankTransaction,
  Branch,
  Committee,
  Manager,
  Demand,
  Ledger,
  Member,
  NoInterestMember,
  Rate,
  Society,
  Voucher
} = require('../models/banking.models');
const User = require('../models/user.model');
const {
  deleteFileById,
  deleteFolder,
  ensureEntityFolder
} = require('./file.service');
const { createNotification } = require('./notification.service');
const { DEFAULT_SETTINGS } = require('../config/defaultSettings');
const { getSettings, updateSettings, mergeDeep } = require('./settings.service');
const { toResponse } = require('../utils/response');
const { buildFileViewUrl } = require('../utils/file-url');

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text;
}

function cleanUpper(value, fallback = '') {
  return cleanText(value, fallback).toUpperCase();
}

function cleanLower(value, fallback = '') {
  return cleanText(value, fallback).toLowerCase();
}

function normalizePhone(value = '') {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return Boolean(value);
}

const BRANCH_SCOPED_RESOURCES = new Set([
  'branches',
  'employees',
  'managers',
  'members',
  'demands',
  'noInterestMembers',
  'vouchers',
  'bankTransactions'
]);

function getScopedBranchCode(user = {}) {
  if (!user || user.isSuperAdmin) {
    return '';
  }
  return cleanUpper(user.branchCode);
}

function resolveBranchCode(user = {}, branchCode = '') {
  const scopedBranchCode = getScopedBranchCode(user);
  if (scopedBranchCode) {
    return scopedBranchCode;
  }
  return cleanUpper(branchCode);
}

function isBranchScopedResource(resource) {
  return BRANCH_SCOPED_RESOURCES.has(resource);
}

function applyBranchScope(query = {}, resource = '', user = {}) {
  const branchCode = resolveBranchCode(user);
  if (!branchCode) {
    return query;
  }
  if (resource === 'branches') {
    query.code = branchCode;
    return query;
  }
  if (isBranchScopedResource(resource)) {
    query.branchCode = branchCode;
  }
  return query;
}

function canAccessBranchRecord(resource, record = {}, user = {}) {
  const branchCode = resolveBranchCode(user);
  if (!branchCode) {
    return true;
  }
  if (resource === 'branches') {
    return cleanUpper(record.code || '') === branchCode;
  }
  if (!isBranchScopedResource(resource)) {
    return true;
  }
  return cleanUpper(record.branchCode || '') === branchCode;
}

function toArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
}

function toMixed(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return fallback;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchQuery(fields = [], search = '') {
  const term = cleanText(search);
  if (!term || !fields.length) {
    return {};
  }

  const regex = new RegExp(escapeRegex(term), 'i');
  return {
    $or: fields.map((field) => ({ [field]: regex }))
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const DEFAULT_RATES_CONFIG = clone(DEFAULT_SETTINGS.payload?.ratesConfig || {});

function normalizeRatesConfig(config = {}) {
  const source = config || {};
  return {
    interestRates: {
      paid: {
        compulsoryDeposit: toNumber(source.interestRates?.paid?.compulsoryDeposit, DEFAULT_RATES_CONFIG.interestRates.paid.compulsoryDeposit),
        specialSaving: toNumber(source.interestRates?.paid?.specialSaving, DEFAULT_RATES_CONFIG.interestRates.paid.specialSaving),
        cashCredit: toNumber(source.interestRates?.paid?.cashCredit, DEFAULT_RATES_CONFIG.interestRates.paid.cashCredit),
        dividend: toNumber(source.interestRates?.paid?.dividend, DEFAULT_RATES_CONFIG.interestRates.paid.dividend)
      },
      receive: {
        loan: toNumber(source.interestRates?.receive?.loan, DEFAULT_RATES_CONFIG.interestRates.receive.loan),
        loanAgainstDeposit: toNumber(source.interestRates?.receive?.loanAgainstDeposit, DEFAULT_RATES_CONFIG.interestRates.receive.loanAgainstDeposit),
        houseLoanStaff: toNumber(source.interestRates?.receive?.houseLoanStaff, DEFAULT_RATES_CONFIG.interestRates.receive.houseLoanStaff),
        vehicleLoanStaff: toNumber(source.interestRates?.receive?.vehicleLoanStaff, DEFAULT_RATES_CONFIG.interestRates.receive.vehicleLoanStaff)
      }
    },
    limits: {
      loan: {
        maxAmount: toNumber(source.limits?.loan?.maxAmount, DEFAULT_RATES_CONFIG.limits.loan.maxAmount),
        multipliers: {
          coOpBankBasic: toNumber(source.limits?.loan?.multipliers?.coOpBankBasic, DEFAULT_RATES_CONFIG.limits.loan.multipliers.coOpBankBasic),
          ldBankBasic: toNumber(source.limits?.loan?.multipliers?.ldBankBasic, DEFAULT_RATES_CONFIG.limits.loan.multipliers.ldBankBasic),
          jilaSanghBasic: toNumber(source.limits?.loan?.multipliers?.jilaSanghBasic, DEFAULT_RATES_CONFIG.limits.loan.multipliers.jilaSanghBasic)
        }
      },
      loanAgainstDeposit: {
        compulsoryDepositPercent: toNumber(source.limits?.loanAgainstDeposit?.compulsoryDepositPercent, DEFAULT_RATES_CONFIG.limits.loanAgainstDeposit.compulsoryDepositPercent)
      }
    },
    demandListAmount: {
      compulsoryDeposit: toNumber(source.demandListAmount?.compulsoryDeposit, DEFAULT_RATES_CONFIG.demandListAmount.compulsoryDeposit),
      coOpBankBasic: toNumber(source.demandListAmount?.coOpBankBasic, DEFAULT_RATES_CONFIG.demandListAmount.coOpBankBasic),
      ldBankBasic: toNumber(source.demandListAmount?.ldBankBasic, DEFAULT_RATES_CONFIG.demandListAmount.ldBankBasic),
      jilaSanghBasic: toNumber(source.demandListAmount?.jilaSanghBasic, DEFAULT_RATES_CONFIG.demandListAmount.jilaSanghBasic)
    },
    syncOptions: {
      applyChangesInAllMembers: toBool(source.syncOptions?.applyChangesInAllMembers, DEFAULT_RATES_CONFIG.syncOptions.applyChangesInAllMembers),
      applyChangesInCompulsoryDeposit: toBool(source.syncOptions?.applyChangesInCompulsoryDeposit, DEFAULT_RATES_CONFIG.syncOptions.applyChangesInCompulsoryDeposit)
    }
  };
}

async function getGlobalRatesConfig() {
  const settings = await getSettings();
  const config = settings?.payload?.ratesConfig || {};
  return normalizeRatesConfig(mergeDeep(DEFAULT_RATES_CONFIG, config));
}

async function updateGlobalRatesConfig(patch = {}) {
  const current = await getGlobalRatesConfig();
  const next = normalizeRatesConfig(mergeDeep(current, patch));
  await updateSettings({
    payload: {
      ratesConfig: next
    }
  });
  return next;
}

function humanizeLabel(value = '') {
  return String(value || '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value = '') {
  return humanizeLabel(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

async function notifySafely(payload) {
  try {
    return await createNotification(payload);
  } catch (error) {
    console.error('[notification] failed to create banking notification:', error.message);
    return null;
  }
}

function summarizeRecord(resource, record = {}) {
  const parts = [];
  const normalized = resource === 'employees'
    ? {
        code: record.code || '',
        name: record.fullName || record.name || ''
      }
    : resource === 'managers'
      ? {
          name: [record.name, record.designation].filter(Boolean).join(' - ') || record.name || record.branchCode || ''
        }
    : resource === 'members'
      ? {
          code: record.code || '',
          membershipNo: record.membershipNo || '',
          name: record.name || ''
        }
      : resource === 'branches'
        ? {
            code: record.code || '',
            name: record.label || record.name || ''
          }
        : resource === 'bankAccounts'
          ? {
              code: record.code || '',
              name: record.bankName || ''
            }
          : resource === 'bankTransactions'
            ? {
                code: record.transactionNo || '',
                name: record.transactionType || ''
              }
            : resource === 'vouchers'
              ? {
                  code: record.voucherNo || '',
                  name: record.voucherCategory || record.transactionType || ''
                }
            : resource === 'demands'
              ? {
                  code: record.demandNo || '',
                  name: record.memberCode || ''
                }
              : resource === 'noInterestMembers'
                ? {
                    code: record.code || '',
                    name: record.memberCode || ''
                  }
                : {
                    code: record.code || record.key || record.voucherNo || '',
                    name: record.name || record.label || record.voucherCategory || ''
                  };

  if (normalized.code) parts.push(normalized.code);
  if (normalized.membershipNo) parts.push(normalized.membershipNo);
  if (normalized.name && normalized.name !== normalized.code) parts.push(normalized.name);
  return parts.filter(Boolean).join(' - ') || normalized.code || normalized.name || 'Record';
}

function getResourceMeta(resource) {
  const meta = {
    society: {
      label: 'Head Office',
      module: 'settings',
      type: 'security',
      severity: 'medium',
      listUrl: '/app/settings/head-office',
      detailUrl: '/app/settings/head-office'
    },
    committee: {
      label: 'Committee',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/committee',
      detailUrl: '/app/master/committee'
    },
    managers: {
      label: 'Manager',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/managers',
      detailUrl: '/app/master/managers'
    },
    branches: {
      label: 'Branch',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/branches',
      detailUrl: (record) => `/app/master/branches/${record.id}`
    },
    managers: {
    model: Manager,
    searchFields: ['name', 'designation', 'branchCode'],
    normalize(data = {}) {
      return {
        name: cleanText(data.name),
        designation: cleanText(data.designation),
        branchCode: cleanUpper(data.branchCode),
        isActive: toBool(data.isActive, true),
        payload: toMixed(data.payload, {})
      };
    }
  },
  employees: {
      label: 'Employee',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/employees',
      detailUrl: (record) => `/app/master/employees/${record.id}`
    },
    members: {
      label: 'Member',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/members',
      detailUrl: (record) => `/app/master/members/${record.id}`
    },
    ledgers: {
      label: 'Ledger',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/ledgers',
      detailUrl: (record) => `/app/master/ledgers/${record.id}`
    },
    rates: {
      label: 'Rates Config',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/rates',
      detailUrl: (record) => `/app/master/rates/${record.id}`
    },
    bankAccounts: {
      label: 'Bank Account',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/bank-accounts',
      detailUrl: (record) => `/app/master/bank-accounts/${record.id}`
    },
    demands: {
      label: 'Demand',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/demands',
      detailUrl: (record) => `/app/master/demands/${record.id}`
    },
    noInterestMembers: {
      label: 'No Interest Member',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/no-interest-members',
      detailUrl: (record) => `/app/master/no-interest-members/${record.id}`
    },
    bankTransactions: {
      label: 'Bank Transaction',
      module: 'transactions',
      type: 'transaction',
      severity: 'high',
      listUrl: '/app/transactions/bank',
      detailUrl: (record) => `/app/transactions/bank/${record.id}`
    }
  };

  return meta[resource] || {
    label: resource,
    module: 'system',
    type: 'info',
    severity: 'medium',
    listUrl: '/app/dashboard',
    detailUrl: '/app/dashboard'
  };
}

function getTransactionSectionUrl(voucher = {}) {
  const key = cleanLower(voucher.details?.key || voucher.transactionKey || voucher.voucherCategory || '');

  if (['loan-paid-member', 'deposit-paid-member', 'insurance-paid-member', 'ssa-paid-member', 'recovery-member'].includes(key)) {
    return '/app/transactions/member';
  }
  if (['loan-recv-cash', 'loan-recv-saving', 'deposit-in-bank', 'cheque-issue-saving', 'cheque-issue-loan', 'transfer-saving', 'transfer-cashcredit'].includes(key)) {
    return '/app/transactions/bank';
  }
  if (key === 'advance-paid-emp') {
    return '/app/transactions/employee/advance-paid-emp';
  }
  if (key === 'advance-recovery-emp') {
    return '/app/transactions/employee/advance-recovery-emp';
  }
  if (key === 'transfer-voucher-paid') {
    return '/app/transactions/transfer-voucher/transfer-voucher-paid';
  }
  if (key === 'transfer-voucher-recover') {
    return '/app/transactions/transfer-voucher/transfer-voucher-recover';
  }
  if (key === 'transfer-voucher-payment') {
    return '/app/transactions/transfer-voucher/payment';
  }
  if (key === 'receipt-voucher') {
    return '/app/transactions/receipt-interest/receipt-voucher';
  }
  if (key === 'interest-paid-member') {
    return '/app/transactions/receipt-interest/interest-paid-member';
  }
  if (key === 'no-interest-members') {
    return '/app/transactions/receipt-interest/no-interest-members';
  }
  if (['payment-voucher', 'demand-entry'].includes(key)) {
    return '/app/transactions/supporting';
  }

  return '/app/transactions/overview';
}

function buildResourceNotificationPayload(resource, action, record = {}, meta = {}) {
  const resourceMeta = getResourceMeta(resource);
  const actionLabel = action === 'created' ? 'created' : action === 'deleted' ? 'deleted' : action === 'updated' ? 'updated' : action;
  const summary = summarizeRecord(resource, record);
  const actionUrl = action === 'deleted'
    ? resourceMeta.listUrl
    : typeof resourceMeta.detailUrl === 'function'
      ? resourceMeta.detailUrl(record)
      : resourceMeta.detailUrl;

  return {
    title: `${resourceMeta.label} ${titleCase(actionLabel)}`,
    message: `${resourceMeta.label} ${summary} was ${humanizeLabel(actionLabel)}.`,
    type: resourceMeta.type,
    severity: action === 'deleted' ? 'high' : resourceMeta.severity,
    module: resourceMeta.module,
    action: actionLabel,
    actionUrl,
    entityType: resourceMeta.label,
    entityId: record.id || record._id || '',
    entityCode: record.code || record.key || record.transactionNo || record.voucherNo || '',
    actorUserId: meta.actorUserId || null,
    payload: {
      resource,
      action: actionLabel,
      summary
    }
  };
}

function buildVoucherNotificationPayload(action, voucher = {}, meta = {}) {
  const actionLabel = action === 'created' ? 'created' : action === 'deleted' ? 'deleted' : action === 'reversed' ? 'reversed' : action === 'updated' ? 'updated' : action;
  const summary = summarizeRecord('vouchers', voucher);
  const actionUrl = action === 'deleted' ? '/app/transactions/overview' : getTransactionSectionUrl(voucher);
  const severity = action === 'deleted' || action === 'reversed' ? 'high' : 'medium';

  return {
    title: `Voucher ${titleCase(actionLabel)}`,
    message: `Voucher ${summary} was ${humanizeLabel(actionLabel)}.`,
    type: 'transaction',
    severity,
    module: 'transactions',
    action: actionLabel,
    actionUrl,
    entityType: 'Voucher',
    entityId: voucher.id || voucher._id || '',
    entityCode: voucher.voucherNo || '',
    actorUserId: meta.actorUserId || null,
    payload: {
      voucherCategory: voucher.voucherCategory || '',
      transactionType: voucher.transactionType || '',
      status: voucher.status || '',
      amount: toNumber(voucher.amount, 0)
    }
  };
}

function buildBankTransactionNotificationPayload(action, transaction = {}, meta = {}) {
  const actionLabel = action === 'created' ? 'created' : action === 'deleted' ? 'deleted' : action === 'updated' ? 'updated' : action;
  const summary = summarizeRecord('bankTransactions', transaction);
  const actionUrl = action === 'deleted' ? '/app/transactions/bank' : `/app/transactions/bank/${transaction.id}`;

  return {
    title: `Bank Transaction ${titleCase(actionLabel)}`,
    message: `Bank transaction ${summary} was ${humanizeLabel(actionLabel)}.`,
    type: 'transaction',
    severity: action === 'deleted' ? 'high' : 'medium',
    module: 'transactions',
    action: actionLabel,
    actionUrl,
    entityType: 'Bank Transaction',
    entityId: transaction.id || transaction._id || '',
    entityCode: transaction.transactionNo || '',
    actorUserId: meta.actorUserId || null,
    payload: {
      bankAccountCode: transaction.bankAccountCode || '',
      transactionType: transaction.transactionType || '',
      amount: toNumber(transaction.amount, 0),
      status: transaction.status || ''
    }
  };
}

async function generateNextMemberCode() {
  const rows = await Member.find({ code: { $regex: /^M\d+$/i } }).select('code').lean();
  let maxNumber = 0;

  for (const row of rows) {
    const code = cleanUpper(row.code);
    const match = code.match(/^M(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `M${String(maxNumber + 1).padStart(4, '0')}`;
}

async function generateNextMembershipNo() {
  const rows = await Member.find({ membershipNo: { $regex: /^MB-\d+$/i } }).select('membershipNo').lean();
  let maxNumber = 1000;

  for (const row of rows) {
    const membershipNo = cleanUpper(row.membershipNo);
    const match = membershipNo.match(/^MB-(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return `MB-${maxNumber + 1}`;
}

function getEmployeePasswordHash(data = {}) {
  const password = String(data.password || process.env.EMPLOYEE_DEFAULT_PASSWORD || 'Employee@12345').trim();
  return bcrypt.hashSync(password, 10);
}

function normalizeEmployeeUser(data = {}) {
  const fullName = cleanText(data.fullName || data.name);
  const username = cleanLower(data.username || data.code || fullName.replace(/\s+/g, '.'));
  const email = cleanLower(data.email || `${cleanLower(data.code || fullName.replace(/\s+/g, '.'))}@bank.local`);
  const status = cleanText(data.status || (data.isActive === false ? 'Inactive' : 'Active')) || 'Active';
  const isActive = !status.toLowerCase().startsWith('inact');
  const code = cleanUpper(data.code || `EMP-${username.replace(/[^a-z0-9]+/gi, '').toUpperCase().slice(0, 12)}`);

  return {
    code,
    fullName,
    name: cleanText(data.name || fullName),
    username,
    email,
    passwordHash: data.passwordHash || getEmployeePasswordHash(data),
    phone: data.phone !== undefined ? normalizePhone(data.phone) : undefined,
    mobileNo: data.mobileNo !== undefined ? normalizePhone(data.mobileNo) : undefined,
    address: cleanText(data.address),
    gender: cleanText(data.gender),
    designation: cleanText(data.designation),
    branchCode: cleanUpper(data.branchCode),
    status,
    isActive,
    avatarUrl: cleanText(data.avatarUrl),
    avatarFileId: data.avatarFileId || null,
    documentsFolderId: data.documentsFolderId || null,
    documents: toMixed(data.documents, {}),
    roles: Array.isArray(data.roles) ? data.roles.filter(Boolean) : [],
    payload: toMixed(data.payload, {})
  };
}

function sanitizeEmployeeUserResponse(doc) {
  const response = toResponse(doc);
  if (!response) return null;
  response.phone = normalizePhone(response.phone || '');
  response.mobileNo = normalizePhone(response.mobileNo || '');
  response.documentsFolderId = response.documentsFolderId ? String(response.documentsFolderId) : null;
  response.avatarFileId = response.avatarFileId ? String(response.avatarFileId) : null;
  response.avatarUrl = buildFileViewUrl(response.avatarFileId || response.avatarUrl || '');
  delete response.passwordHash;
  delete response.passwordReset;
  return response;
}

function sanitizeMemberResponse(doc) {
  const response = toResponse(doc);
  if (!response) return null;
  response.mobileNo = normalizePhone(response.mobileNo || '');
  response.photoFileId = response.photoFileId ? String(response.photoFileId) : null;
  response.documentsFolderId = response.documentsFolderId ? String(response.documentsFolderId) : null;
  response.photoUrl = buildFileViewUrl(response.photoFileId || response.photoUrl || '');
  return response;
}

async function syncRecordDocumentsFolder(resource, record, createdBy = null) {
  if (!record?._id || !['employees', 'members'].includes(resource)) return null;

  const moduleName = resource;
  const entityName = resource === 'employees'
    ? record.fullName || record.name || record.username || record.code || 'Employee'
    : record.name || record.code || 'Member';

  const folder = await ensureEntityFolder({
    moduleName,
    entityId: String(record._id),
    entityName,
    entityCode: record.code || '',
    createdBy
  });

  const folderId = folder?.id ? String(folder.id) : null;
  if (folderId && String(record.documentsFolderId || '') !== folderId) {
    record.documentsFolderId = folderId;
    await record.save();
  }

  return folderId;
}

const MEMBER_TRANSACTION_DOCUMENTS = {
  loanPaidMember: [
    { key: 'sanctionLetter', label: 'Sanction Letter / Loan Agreement', description: 'Loan approval note or signed agreement.' },
    { key: 'promissoryNote', label: 'Promissory Note', description: 'Member signed promissory note.' },
    { key: 'disbursementAdvice', label: 'Disbursement Advice / Cheque', description: 'Cheque or disbursement advice copy.' },
    { key: 'memberSheet', label: 'Member Calculation Sheet', description: 'Loan calculation or member-wise sheet.' }
  ],
  depositPaidMember: [
    { key: 'voucherAttachment', label: 'Voucher Attachment', description: 'Primary payout support file or scan.' },
    { key: 'chequeImage', label: 'Cheque Image', description: 'Cheque scan or bank instrument image.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or transfer reference.' }
  ],
  insurancePaidMember: [
    { key: 'voucherAttachment', label: 'Voucher Attachment', description: 'Primary insurance payout support file.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or transfer reference.' },
    { key: 'receiptCopy', label: 'Receipt Copy', description: 'Receipt acknowledgement or cash memo.' }
  ],
  ssaPaidMember: [
    { key: 'ssaAdvice', label: 'SSA Payment Advice', description: 'SSA payment approval or advice note.' },
    { key: 'memberAcknowledgement', label: 'Member Acknowledgement', description: 'Signed member acknowledgement.' },
    { key: 'chequeCopy', label: 'Cheque / Instrument Copy', description: 'Cheque or transfer instrument proof.' },
    { key: 'smsProof', label: 'SMS Proof', description: 'SMS confirmation or dispatch proof.' }
  ],
  recoveryMember: [
    { key: 'depositSlip', label: 'Deposit Slip', description: 'Cash or cheque deposit slip.' },
    { key: 'receiptCopy', label: 'Receipt Copy', description: 'Bank receipt or cash receipt copy.' },
    { key: 'bankStatement', label: 'Bank Statement', description: 'Statement or online transfer proof.' },
    { key: 'memberSheet', label: 'Member Recovery Sheet', description: 'Member-wise recovery calculation sheet.' }
  ]
};

const BANK_TRANSACTION_DOCUMENTS = {
  'loan-recv-cash': [
    { key: 'loanApplication', label: 'Loan Application', description: 'Sanctioned loan application or request form.' },
    { key: 'disbursementAdvice', label: 'Disbursement Advice', description: 'Advice or cash disbursement note.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or settlement reference.' }
  ],
  'loan-recv-saving': [
    { key: 'loanApplication', label: 'Loan Application', description: 'Sanctioned loan application or request form.' },
    { key: 'savingPassbook', label: 'Saving Passbook / Proof', description: 'Saving account proof or passbook scan.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or settlement reference.' }
  ],
  'deposit-in-bank': [
    { key: 'depositSlip', label: 'Deposit Slip', description: 'Cash deposit slip or challan.' },
    { key: 'bankReceipt', label: 'Bank Receipt', description: 'Bank acknowledgment or receipt.' },
    { key: 'cashBookEntry', label: 'Cash Book Entry', description: 'Cash book or journal evidence.' }
  ],
  'cheque-issue-saving': [
    { key: 'chequeImage', label: 'Cheque Image', description: 'Cheque scan or issued instrument copy.' },
    { key: 'chequeRegister', label: 'Cheque Register', description: 'Cheque issue register or record.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Advice or settlement reference.' }
  ],
  'cheque-issue-loan': [
    { key: 'chequeImage', label: 'Cheque Image', description: 'Cheque scan or issued instrument copy.' },
    { key: 'chequeRegister', label: 'Cheque Register', description: 'Cheque issue register or record.' },
    { key: 'bankAdvice', label: 'Bank Advice', description: 'Advice or settlement reference.' }
  ],
  'transfer-saving': [
    { key: 'transferAdvice', label: 'Transfer Advice', description: 'Transfer request or advice slip.' },
    { key: 'rtgsSlip', label: 'RTGS / NEFT Slip', description: 'Transfer proof or bank confirmation.' },
    { key: 'bankStatement', label: 'Bank Statement', description: 'Statement or transaction proof.' }
  ],
  'transfer-cashcredit': [
    { key: 'transferAdvice', label: 'Transfer Advice', description: 'Transfer request or advice slip.' },
    { key: 'rtgsSlip', label: 'RTGS / NEFT Slip', description: 'Transfer proof or bank confirmation.' },
    { key: 'bankStatement', label: 'Bank Statement', description: 'Statement or transaction proof.' }
  ]
};

const EMPLOYEE_TRANSACTION_DOCUMENTS = {
  'advance-paid-emp': [
    { key: 'advanceApplication', label: 'Advance Application', description: 'Employee advance request or application.' },
    { key: 'approvalNote', label: 'Approval Note', description: 'Sanction or approval note for advance.' },
    { key: 'chequeImage', label: 'Cheque / Payment Proof', description: 'Cheque image or cash payment proof.' },
    { key: 'undertaking', label: 'Employee Undertaking', description: 'Salary adjustment or repayment undertaking.' }
  ],
  'advance-recovery-emp': [
    { key: 'recoverySlip', label: 'Recovery Slip', description: 'Recovery slip or cash deposit note.' },
    { key: 'salaryDeductionAdvice', label: 'Salary Deduction Advice', description: 'Payroll deduction advice or memo.' },
    { key: 'receiptCopy', label: 'Receipt Copy', description: 'Receipt acknowledgement or cash memo.' },
    { key: 'bankTransferProof', label: 'Bank Transfer Proof', description: 'Transfer proof if recovered through bank.' }
  ]
};

const TRANSACTION_CATALOG = [
  {
    key: 'member',
    label: 'Member',
    description: 'Member loan, deposit, insurance, and recovery transactions.',
    permission: 'transactions.read',
    items: [
      {
        key: 'loan-paid-member',
        label: 'Loan Paid to Member',
        description: 'Disburse loan amounts to members.',
        voucherCategory: 'Loan Paid to Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cash / Cheque',
        documents: MEMBER_TRANSACTION_DOCUMENTS.loanPaidMember
      },
      {
        key: 'deposit-paid-member',
        label: 'Compulsory Deposit Paid to Member',
        description: 'Pay compulsory deposit amounts back to member accounts.',
        voucherCategory: 'Compulsory Deposit Paid to Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cash / Cheque',
        documents: MEMBER_TRANSACTION_DOCUMENTS.depositPaidMember
      },
      {
        key: 'insurance-paid-member',
        label: 'Insurance Premium Paid to Member',
        description: 'Record insurance premium disbursement entries.',
        voucherCategory: 'Insurance Premium Paid to Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cash / Cheque',
        documents: MEMBER_TRANSACTION_DOCUMENTS.insurancePaidMember
      },
      {
        key: 'ssa-paid-member',
        label: 'SSA Paid To Member',
        description: 'Record SSA payout entries to members.',
        voucherCategory: 'SSA Paid To Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cash-in-Hand',
        documents: MEMBER_TRANSACTION_DOCUMENTS.ssaPaidMember
      },
      {
        key: 'recovery-member',
        label: 'Recovery From Member',
        description: 'Recover dues from member accounts.',
        voucherCategory: 'Recovery From Member',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Cash / Transfer',
        documents: MEMBER_TRANSACTION_DOCUMENTS.recoveryMember
      }
    ]
  },
  {
    key: 'bank',
    label: 'Bank',
    description: 'Bank cash movement, cheque, and transfer vouchers.',
    permission: 'bank-transactions.read',
    items: [
      {
        key: 'loan-recv-cash',
        label: 'Loan Received to Cash/Credit A/c',
        description: 'Receive loan proceeds through cash or credit settlement.',
        voucherCategory: 'Loan Received',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Cash / Credit',
        documents: BANK_TRANSACTION_DOCUMENTS['loan-recv-cash']
      },
      {
        key: 'loan-recv-saving',
        label: 'Loan Received to Saving A/c',
        description: 'Receive loan proceeds into saving account.',
        voucherCategory: 'Loan Received to Saving A/c',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Saving A/c',
        documents: BANK_TRANSACTION_DOCUMENTS['loan-recv-saving']
      },
      {
        key: 'deposit-in-bank',
        label: 'Deposit in Bank',
        description: 'Move cash or settlement into bank account.',
        voucherCategory: 'Deposit in Bank',
        transactionType: 'transfer',
        accent: 'amber',
        mode: 'Bank Deposit',
        documents: BANK_TRANSACTION_DOCUMENTS['deposit-in-bank']
      },
      {
        key: 'cheque-issue-saving',
        label: 'Cheque Issue With Bank (Saving A/c)',
        description: 'Issue cheque against savings account settlement.',
        voucherCategory: 'Cheque Issue With Bank (Saving A/c)',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cheque',
        documents: BANK_TRANSACTION_DOCUMENTS['cheque-issue-saving']
      },
      {
        key: 'cheque-issue-loan',
        label: 'Cheque Issue With Bank (Loan A/c)',
        description: 'Issue cheque against loan account settlement.',
        voucherCategory: 'Cheque Issue With Bank (Loan A/c)',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cheque',
        documents: BANK_TRANSACTION_DOCUMENTS['cheque-issue-loan']
      },
      {
        key: 'transfer-saving',
        label: 'Amount Transfer to Saving A/c',
        description: 'Transfer money to saving account ledger.',
        voucherCategory: 'Amount Transfer to Saving A/c',
        transactionType: 'transfer',
        accent: 'amber',
        mode: 'Transfer',
        documents: BANK_TRANSACTION_DOCUMENTS['transfer-saving']
      },
      {
        key: 'transfer-cashcredit',
        label: 'Amount Transfer to Cash-Credit A/c',
        description: 'Transfer money to cash-credit account ledger.',
        voucherCategory: 'Amount Transfer to Cash-Credit A/c',
        transactionType: 'transfer',
        accent: 'amber',
        mode: 'Transfer',
        documents: BANK_TRANSACTION_DOCUMENTS['transfer-cashcredit']
      }
    ]
  },
  {
    key: 'employee',
    label: 'Employee',
    description: 'Employee advance payment and recovery workflow.',
    permission: 'transactions.read',
    items: [
      {
        key: 'advance-paid-emp',
        label: 'Advance Paid by Cash/Cheque',
        description: 'Pay advance to employee through cash or cheque.',
        voucherCategory: 'Advance Paid by Cash/Cheque',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cash / Cheque',
        documents: EMPLOYEE_TRANSACTION_DOCUMENTS['advance-paid-emp']
      },
      {
        key: 'advance-recovery-emp',
        label: 'Advance Recovery by Cash/Transfer',
        description: 'Recover employee advance through cash or transfer.',
        voucherCategory: 'Advance Recovery by Cash/Transfer',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Cash / Transfer',
        documents: EMPLOYEE_TRANSACTION_DOCUMENTS['advance-recovery-emp']
      }
    ]
  },
  {
    key: 'transfer-voucher',
    label: 'Transfer Voucher',
    description: 'Inter-account transfer voucher movements.',
    permission: 'transactions.read',
    items: [
      {
        key: 'transfer-voucher-paid',
        label: 'Transfer Voucher Paid to Member',
        description: 'Transfer voucher paid out to member.',
        voucherCategory: 'Transfer Voucher Paid to Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Transfer',
        documents: [
          { key: 'transferAdvice', label: 'Transfer Advice', description: 'Transfer request or advice slip.' },
          { key: 'allocationSheet', label: 'Allocation Sheet', description: 'Member allocation breakdown sheet.' },
          { key: 'memberAcknowledgement', label: 'Member Acknowledgement', description: 'Signed acknowledgement from member.' }
        ]
      },
      {
        key: 'transfer-voucher-recover',
        label: 'Transfer Voucher Recover From Member',
        description: 'Recover transfer voucher amount from member.',
        voucherCategory: 'Transfer Voucher Recover From Member',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Transfer',
        documents: [
          { key: 'recoveryAdvice', label: 'Recovery Advice', description: 'Recovery advice or internal note.' },
          { key: 'allocationSheet', label: 'Allocation Sheet', description: 'Member allocation breakdown sheet.' },
          { key: 'bankProof', label: 'Bank Proof', description: 'Bank proof or recovery confirmation.' }
        ]
      },
      {
        key: 'transfer-voucher-payment',
        label: 'Payment',
        description: 'Payment voucher entry under transfer voucher workspace.',
        voucherCategory: 'Payment',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Payment',
        documents: [
          { key: 'paymentVoucher', label: 'Payment Voucher', description: 'Primary transfer voucher payment copy.' },
          { key: 'ledgerAdvice', label: 'Ledger Advice', description: 'Ledger or account posting reference.' },
          { key: 'approvalNote', label: 'Approval Note', description: 'Approved note or sanction document.' }
        ]
      }
    ]
  },
  {
    key: 'receipt-interest',
    label: 'Receipt / Interest',
    description: 'Receipt vouchers, interest postings, and related member lists.',
    permission: ['transactions.read', 'no-interest-members.read'],
    items: [
      {
        key: 'receipt-voucher',
        label: 'Receipt',
        description: 'General receipt entry for the society.',
        voucherCategory: 'Receipt',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Receipt',
        documents: [
          { key: 'receiptVoucher', label: 'Receipt Voucher', description: 'Primary receipt voucher copy.' },
          { key: 'cashReceipt', label: 'Cash Receipt', description: 'Cash receipt or acknowledgment.' },
          { key: 'bankReceipt', label: 'Bank Receipt', description: 'Bank receipt or transfer confirmation.' }
        ]
      },
      {
        key: 'interest-paid-member',
        label: 'Interest Paid to Member',
        description: 'Post interest payout to member ledger.',
        voucherCategory: 'Interest Paid to Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Interest',
        documents: [
          { key: 'interestWorksheet', label: 'Interest Worksheet', description: 'Interest calculation worksheet.' },
          { key: 'sanctionNote', label: 'Sanction Note', description: 'Interest approval or sanction note.' },
          { key: 'bankAdvice', label: 'Bank Advice', description: 'Bank advice or payment reference.' },
          { key: 'receiptCopy', label: 'Receipt Copy', description: 'Receipt copy for interest payout.' }
        ]
      },
      {
        key: 'no-interest-members',
        label: 'No Interest Members',
        description: 'Members excluded from interest calculation.',
        voucherCategory: 'No Interest Members',
        transactionType: 'support',
        accent: 'amber',
        mode: 'Master Link',
        route: '/app/transactions/receipt-interest/no-interest-members'
      }
    ]
  },
  {
    key: 'supporting',
    label: 'Supporting',
    description: 'Demand entry helpers inside the transaction workspace.',
    permission: ['transactions.read'],
    items: [
      {
        key: 'demand-entry',
        label: 'Demand Entry',
        description: 'Create or review demand records from the transaction shell.',
        voucherCategory: 'Demand Entry',
        transactionType: 'support',
        accent: 'amber',
        mode: 'Demand'
      }
    ]
  }
];

async function getTransactionCatalog() {
  return clone(TRANSACTION_CATALOG);
}

function getDocumentFileIds(documents = {}) {
  return Object.values(documents || {})
    .map((item) => item?.fileId || item?.id || null)
    .filter(Boolean)
    .map((fileId) => String(fileId));
}

async function deleteDocumentFiles(documents = {}) {
  const fileIds = getDocumentFileIds(documents);
  if (!fileIds.length) return;
  await Promise.allSettled(fileIds.map((fileId) => deleteFileById(fileId)));
}

const RESOURCE_DEFS = {
  society: {
    model: Society,
    singleton: true,
    uniqueQuery: { key: 'default' },
    searchFields: ['name', 'prefix', 'regNo', 'email', 'address', 'branchCode'],
    normalize(data = {}) {
      return {
        key: 'default',
        name: cleanText(data.name, SOCIETY_SEED.name),
        prefix: cleanText(data.prefix, SOCIETY_SEED.prefix),
        regNo: cleanText(data.regNo, SOCIETY_SEED.regNo),
        email: cleanText(data.email, SOCIETY_SEED.email),
        address: cleanText(data.address, SOCIETY_SEED.address),
        branchCode: cleanUpper(data.branchCode, SOCIETY_SEED.branchCode),
        logoUrl: cleanText(data.logoUrl, ''),
        watermarkUrl: cleanText(data.watermarkUrl, ''),
        footerText: cleanText(data.footerText, SOCIETY_SEED.footerText),
        payload: toMixed(data.payload, {})
      };
    }
  },
  branches: {
    model: Branch,
    searchFields: ['code', 'label', 'place', 'address', 'district', 'phone'],
    normalize(data = {}) {
      const code = cleanUpper(data.code);
      const place = cleanText(data.place);
      return {
        code,
        label: cleanText(data.label || data.name || place || code),
        place,
        address: cleanText(data.address),
        district: cleanText(data.district),
        phone: cleanText(data.phone),
        isActive: toBool(data.isActive, true),
        payload: toMixed(data.payload, {})
      };
    }
  },
  committee: {
    model: Committee,
    singleton: true,
    uniqueQuery: { key: 'default' },
    searchFields: ['chairman', 'viceChairman', 'viceChairman2', 'directors'],
    normalize(data = {}) {
      return {
        key: 'default',
        chairman: cleanText(data.chairman),
        viceChairman: cleanText(data.viceChairman),
        viceChairman2: cleanText(data.viceChairman2),
        directors: toArray(data.directors).map((item) => cleanText(item)).filter(Boolean),
        payload: toMixed(data.payload, {})
      };
    }
  },
  managers: {
    model: Manager,
    searchFields: ['name', 'designation', 'branchCode'],
    normalize(data = {}) {
      return {
        name: cleanText(data.name),
        designation: cleanText(data.designation),
        branchCode: cleanUpper(data.branchCode),
        isActive: toBool(data.isActive, true),
        payload: toMixed(data.payload, {})
      };
    }
  },
  employees: {
    model: User,
    searchFields: ['code', 'fullName', 'name', 'username', 'email', 'designation', 'branchCode', 'phone', 'mobileNo', 'status'],
    normalize(data = {}) {
      return normalizeEmployeeUser(data);
    }
  },
  members: {
    model: Member,
    searchFields: ['code', 'name', 'fatherOrHusbandName', 'branchCode', 'membershipNo', 'mobileNo', 'status'],
    normalize(data = {}) {
      const balances = toMixed(data.balances, {});
      const depositBalance = toNumber(data.depositBalance, toNumber(balances.compulsoryDeposit, 0));
      const loanOutstanding = toNumber(data.loanOutstanding, 0);
      return {
        code: cleanUpper(data.code),
        name: cleanText(data.name),
        fatherOrHusbandName: cleanText(data.fatherOrHusbandName),
        branchCode: cleanUpper(data.branchCode),
        category: cleanText(data.category),
        caste: cleanText(data.caste),
        designation: cleanText(data.designation),
        serviceName1: cleanText(data.serviceName1),
        serviceName2: cleanText(data.serviceName2),
        dateOfBirth: cleanText(data.dateOfBirth),
        membershipDate: cleanText(data.membershipDate),
        appointmentDate: cleanText(data.appointmentDate),
        membershipNo: cleanText(data.membershipNo),
        address: cleanText(data.address),
        mobileNo: normalizePhone(data.mobileNo),
        openingBalance: toNumber(data.openingBalance, 0),
        balances: {
          share: toNumber(balances.share, 0),
          compulsoryDeposit: depositBalance,
          specialSaving: toNumber(balances.specialSaving, 0),
          providentFund: toNumber(balances.providentFund, 0),
          loanAgainstDeposit: toNumber(balances.loanAgainstDeposit, 0),
          insurancePremium: toNumber(balances.insurancePremium, 0)
        },
        loanOutstanding,
        depositBalance,
        nomineeName: cleanText(data.nomineeName),
        nomineeRelation: cleanText(data.nomineeRelation),
        photoUrl: cleanText(data.photoUrl),
        photoFileId: data.photoFileId || null,
        documentsFolderId: data.documentsFolderId || null,
        documents: toMixed(data.documents, {}),
        status: cleanText(data.status, 'Active'),
        payload: toMixed(data.payload, {})
      };
    }
  },
  ledgers: {
    model: Ledger,
    searchFields: ['code', 'name', 'nature', 'group'],
    normalize(data = {}) {
      return {
        code: cleanUpper(data.code),
        name: cleanText(data.name),
        nature: cleanUpper(data.nature),
        group: cleanUpper(data.group || 'GENERAL'),
        openingBalance: toNumber(data.openingBalance, 0),
        balanceSide: cleanUpper(data.balanceSide || 'DR'),
        isBankAccount: toBool(data.isBankAccount, false),
        isActive: toBool(data.isActive, true),
        payload: toMixed(data.payload, {})
      };
    }
  },
  rates: {
    model: Rate,
    searchFields: ['code', 'ledgerCode', 'ledgerName', 'category', 'effectiveFrom'],
    normalize(data = {}) {
      return {
        code: cleanUpper(data.code),
        ledgerCode: cleanUpper(data.ledgerCode),
        ledgerName: cleanText(data.ledgerName),
        category: cleanText(data.category),
        value: toNumber(data.value, 0),
        effectiveFrom: cleanText(data.effectiveFrom),
        payload: toMixed(data.payload, {})
      };
    }
  },
  bankAccounts: {
    model: BankAccount,
    searchFields: ['code', 'bankName', 'accountHolderName', 'accountNumber', 'ifsc', 'branch', 'accountType', 'status'],
    normalize(data = {}) {
      const openingBalance = toNumber(data.openingBalance, 0);
      const currentBalance = data.currentBalance === undefined ? openingBalance : toNumber(data.currentBalance, openingBalance);
      return {
        code: cleanUpper(data.code),
        bankName: cleanText(data.bankName),
        accountHolderName: cleanText(data.accountHolderName),
        accountNumber: cleanText(data.accountNumber),
        ifsc: cleanText(data.ifsc),
        branch: cleanText(data.branch),
        accountType: cleanText(data.accountType, 'Current'),
        upiId: cleanText(data.upiId),
        openingBalance,
        currentBalance,
        isPrimary: toBool(data.isPrimary, false),
        linkedLedgerCode: cleanUpper(data.linkedLedgerCode),
        status: cleanText(data.status, 'Active'),
        payload: toMixed(data.payload, {})
      };
    }
  },
  bankTransactions: {
    model: BankTransaction,
    searchFields: ['transactionNo', 'bankAccountCode', 'transactionType', 'branchCode', 'linkedClientCode', 'linkedProjectCode', 'linkedInvoiceNo', 'linkedExpenseCode', 'notes', 'voucherNo', 'status'],
    normalize(data = {}) {
      return {
        transactionNo: cleanUpper(data.transactionNo),
        date: cleanText(data.date),
        bankAccountCode: cleanUpper(data.bankAccountCode),
        transactionType: cleanText(data.transactionType),
        amount: toNumber(data.amount, 0),
        branchCode: cleanUpper(data.branchCode),
        linkedClientCode: cleanText(data.linkedClientCode),
        linkedProjectCode: cleanText(data.linkedProjectCode),
        linkedInvoiceNo: cleanText(data.linkedInvoiceNo),
        linkedExpenseCode: cleanText(data.linkedExpenseCode),
        notes: cleanText(data.notes),
        voucherNo: cleanUpper(data.voucherNo),
        status: cleanText(data.status, 'Posted'),
        payload: toMixed(data.payload, {})
      };
    }
  },
  demands: {
    model: Demand,
    searchFields: ['demandNo', 'month', 'branchCode', 'memberCode', 'status', 'remarks'],
    normalize(data = {}) {
      return {
        demandNo: cleanUpper(data.demandNo),
        month: cleanText(data.month),
        branchCode: cleanUpper(data.branchCode),
        memberCode: cleanUpper(data.memberCode),
        dueDate: cleanText(data.dueDate),
        total: toNumber(data.total, 0),
        recovered: toNumber(data.recovered, 0),
        status: cleanText(data.status, 'Pending'),
        remarks: cleanText(data.remarks),
        allocations: toArray(data.allocations).map((item) => ({
          memberCode: cleanUpper(item.memberCode),
          head: cleanText(item.head),
          amount: toNumber(item.amount, 0)
        })),
        payload: toMixed(data.payload, {})
      };
    }
  },
  noInterestMembers: {
    model: NoInterestMember,
    searchFields: ['code', 'memberCode', 'branchCode', 'reason', 'status'],
    normalize(data = {}) {
      return {
        code: cleanUpper(data.code),
        memberCode: cleanUpper(data.memberCode),
        branchCode: cleanUpper(data.branchCode),
        reason: cleanText(data.reason),
        fromDate: cleanText(data.fromDate),
        toDate: cleanText(data.toDate),
        status: cleanText(data.status, 'Active'),
        payload: toMixed(data.payload, {})
      };
    }
  },
  vouchers: {
    model: Voucher,
    searchFields: ['voucherNo', 'voucherCategory', 'transactionType', 'partyCode', 'partyType', 'mode', 'status', 'narration', 'referenceNo', 'instrumentNo', 'branchCode', 'fyCode'],
    normalize(data = {}) {
      return {
        voucherNo: cleanUpper(data.voucherNo),
        date: cleanText(data.date),
        voucherCategory: cleanText(data.voucherCategory),
        transactionType: cleanText(data.transactionType),
        accent: cleanText(data.accent, 'neutral'),
        partyCode: cleanUpper(data.partyCode),
        partyType: cleanText(data.partyType, 'ledger'),
        amount: toNumber(data.amount, 0),
        mode: cleanText(data.mode),
        status: cleanText(data.status, 'Draft'),
        narration: cleanText(data.narration),
        referenceNo: cleanText(data.referenceNo),
        instrumentNo: cleanText(data.instrumentNo),
        instrumentDate: cleanText(data.instrumentDate),
        branchCode: cleanUpper(data.branchCode),
        fyCode: cleanUpper(data.fyCode),
        reversalOf: cleanUpper(data.reversalOf),
        approvedBy: cleanText(data.approvedBy),
        createdBy: cleanText(data.createdBy),
        details: (() => {
          const details = toMixed(data.details, {});
          return {
            ...details,
            payMode: cleanText(details.payMode || data.mode || ''),
            fixedSettlement: cleanText(details.fixedSettlement || ''),
            sms: Boolean(details.sms)
          };
        })(),
        journalLines: toArray(data.journalLines).map((line) => ({
          ledgerCode: cleanUpper(line.ledgerCode || line.ledger),
          dr: toNumber(line.dr, 0),
          cr: toNumber(line.cr, 0),
          memo: cleanText(line.memo)
        }))
      };
    }
  }
};

function getResourceDef(resource) {
  const def = RESOURCE_DEFS[resource];
  if (!def) {
    throw new Error(`Unknown banking resource: ${resource}`);
  }
  return def;
}

function buildUpsertUpdate(filter, data) {
  const payload = clone(data);
  for (const key of Object.keys(filter || {})) {
    delete payload[key];
  }
  return {
    $set: payload,
    $setOnInsert: clone(filter || {})
  };
}

async function seedOne(model, filter, data) {
  await model.findOneAndUpdate(filter, buildUpsertUpdate(filter, data), { new: true, upsert: true, runValidators: true });
}

async function seedMany(model, filterFn, rows = []) {
  for (const row of rows) {
    const filter = filterFn(row);
    await seedOne(model, filter, row);
  }
}

async function seedBankingData() {
  await seedOne(Society, { key: 'default' }, SOCIETY_SEED);
  await seedOne(Committee, { key: 'default' }, COMMITTEE_SEED);
  await seedMany(Manager, (row) => ({ name: cleanText(row.name), designation: cleanText(row.designation), branchCode: cleanUpper(row.branchCode) }), MANAGER_SEEDS);
  await seedMany(Branch, (row) => ({ code: cleanUpper(row.code) }), BRANCH_SEEDS);
  await seedMany(Member, (row) => ({ code: cleanUpper(row.code) }), MEMBER_SEEDS);
  await seedMany(User, (row) => ({ code: cleanUpper(row.code) }), EMPLOYEE_SEEDS.map((row) => normalizeEmployeeUser({
    ...row,
    fullName: row.name,
    name: row.name,
    username: row.username || cleanLower(row.code),
    email: row.email || `${cleanLower(row.code)}@bank.local`,
    password: row.password || row.code || row.name,
    status: row.status || 'Active'
  })));
  await seedMany(Ledger, (row) => ({ code: cleanUpper(row.code) }), LEDGER_SEEDS);
  await seedMany(BankAccount, (row) => ({ code: cleanUpper(row.code) }), BANK_ACCOUNT_SEEDS);
  await seedMany(Demand, (row) => ({ demandNo: cleanUpper(row.demandNo) }), DEMAND_SEEDS);
  await seedMany(NoInterestMember, (row) => ({ code: cleanUpper(row.code) }), NO_INTEREST_MEMBER_SEEDS);
  await seedMany(Voucher, (row) => ({ voucherNo: cleanUpper(row.voucherNo) }), VOUCHER_SEEDS);
  await seedMany(BankTransaction, (row) => ({ transactionNo: cleanUpper(row.transactionNo) }), BANK_TRANSACTION_SEEDS);
  return true;
}

async function listResource(resource, search = '', user = {}) {
  const def = getResourceDef(resource);
  if (resource === 'employees') {
    const baseQuery = applyBranchScope({ code: { $ne: '' } }, resource, user);
    const searchQuery = buildSearchQuery(def.searchFields, search);
    const query = searchQuery.$or ? { $and: [baseQuery, searchQuery] } : baseQuery;
    const rows = await User.find(query)
      .sort({ updatedAt: -1 })
      .lean();
    return rows.map((row) => sanitizeEmployeeUserResponse(row));
  }
  const query = applyBranchScope(buildSearchQuery(def.searchFields, search), resource, user);
  const rows = await def.model.find(query).sort({ updatedAt: -1 }).lean();
  return rows.map((row) => (resource === 'members' ? sanitizeMemberResponse(row) : toResponse(row)));
}

async function getResource(resource, id, user = {}) {
  const def = getResourceDef(resource);
  if (resource === 'employees') {
    const record = await User.findOne({ _id: id, code: { $ne: '' } }).lean();
    if (!record || !canAccessBranchRecord(resource, record, user)) {
      return null;
    }
    return sanitizeEmployeeUserResponse(record);
  }
  if (def.singleton) {
    const record = await def.model.findOne({ key: 'default' }).lean();
    return record ? toResponse(record) : null;
  }

  const record = await def.model.findById(id).lean();
  if (!record || !canAccessBranchRecord(resource, record, user)) return null;
  return resource === 'members' ? sanitizeMemberResponse(record) : toResponse(record);
}

async function createResource(resource, data = {}, meta = {}) {
  const def = getResourceDef(resource);
  const actorUser = meta.actorUser || {};

  if (resource === 'branches' && getScopedBranchCode(actorUser)) {
    const error = new Error('Branch access denied');
    error.statusCode = 403;
    throw error;
  }

  if (resource === 'employees') {
    const payload = normalizeEmployeeUser(data);
    payload.branchCode = resolveBranchCode(actorUser, payload.branchCode);
    if (meta.actorUserId) {
      payload.createdByUserId = meta.actorUserId;
      payload.updatedByUserId = meta.actorUserId;
    }
    const record = await User.create(payload);
    await syncRecordDocumentsFolder(resource, record, meta.actorUserId || null);
    const response = sanitizeEmployeeUserResponse(record);
    await notifySafely(buildResourceNotificationPayload(resource, 'created', response, meta));
    return response;
  }

  const payload = def.normalize ? def.normalize(data) : clone(data);
  if (isBranchScopedResource(resource)) {
    payload.branchCode = resolveBranchCode(actorUser, payload.branchCode);
  }
  if (resource === 'members') {
    if (!payload.code) {
      payload.code = await generateNextMemberCode();
    }
    if (!payload.membershipNo) {
      payload.membershipNo = await generateNextMembershipNo();
    }
  }
  if (meta.actorUserId) {
    payload.createdByUserId = meta.actorUserId;
    payload.updatedByUserId = meta.actorUserId;
  }
  if (resource === 'members') {
    const record = await def.model.create(payload);
    await syncRecordDocumentsFolder(resource, record, meta.actorUserId || null);
    const response = sanitizeMemberResponse(record);
    await notifySafely(buildResourceNotificationPayload(resource, 'created', response, meta));
    return response;
  }
  if (def.singleton) {
    const record = await def.model.findOneAndUpdate(
      def.uniqueQuery || { key: 'default' },
      buildUpsertUpdate(def.uniqueQuery || { key: 'default' }, payload),
      { new: true, upsert: true, runValidators: true }
    ).lean();
    const response = record ? toResponse(record) : null;
    if (response) {
      await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
    }
    return response;
  }

  const record = await def.model.create(payload);
  const response = toResponse(record);
  await notifySafely(buildResourceNotificationPayload(resource, 'created', response, meta));
  return response;
}

async function updateResource(resource, id, data = {}, meta = {}) {
  const def = getResourceDef(resource);
  const actorUser = meta.actorUser || {};

  if (resource === 'branches' && getScopedBranchCode(actorUser)) {
    const error = new Error('Branch access denied');
    error.statusCode = 403;
    throw error;
  }

  if (resource === 'employees') {
    const current = await User.findOne({ _id: id, code: { $ne: '' } });
    if (!current || !canAccessBranchRecord(resource, current.toObject(), actorUser)) return null;
    const payload = normalizeEmployeeUser({
      ...current.toObject(),
      ...data,
      passwordHash: current.passwordHash
    });
    payload.branchCode = resolveBranchCode(actorUser, current.branchCode);
    if (meta.actorUserId) {
      payload.updatedByUserId = meta.actorUserId;
    }
    current.set(payload);
    await current.save();
    await syncRecordDocumentsFolder(resource, current, meta.actorUserId || null);
    const response = sanitizeEmployeeUserResponse(current);
    await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
    return response;
  }

  if (resource === 'members') {
    const current = await Member.findById(id);
    if (!current || !canAccessBranchRecord(resource, current.toObject(), actorUser)) return null;

    const previousPhotoFileId = current.photoFileId ? String(current.photoFileId) : '';
    const payload = def.normalize ? def.normalize({ ...current.toObject(), ...data }) : clone({ ...current.toObject(), ...data });
    payload.branchCode = resolveBranchCode(actorUser, current.branchCode);
    payload.code = payload.code || current.code || await generateNextMemberCode();
    payload.membershipNo = payload.membershipNo || current.membershipNo || await generateNextMembershipNo();
    if (meta.actorUserId) {
      payload.updatedByUserId = meta.actorUserId;
    }
    current.set(payload);
    await current.save();
    const nextPhotoFileId = payload.photoFileId ? String(payload.photoFileId) : '';
    if (previousPhotoFileId && previousPhotoFileId !== nextPhotoFileId) {
      await deleteFileById(previousPhotoFileId).catch(() => {});
    }
    await syncRecordDocumentsFolder(resource, current, meta.actorUserId || null);
    const response = sanitizeMemberResponse(current);
    await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
    return response;
  }

  if (def.singleton) {
    const payload = def.normalize ? def.normalize({ ...data, ...(def.singleton ? { key: 'default' } : {}) }) : clone(data);
    if (meta.actorUserId) {
      payload.updatedByUserId = meta.actorUserId;
    }
    const record = await def.model.findOneAndUpdate(
      def.uniqueQuery || { key: 'default' },
      buildUpsertUpdate(def.uniqueQuery || { key: 'default' }, payload),
      { new: true, upsert: true, runValidators: true }
    ).lean();
    const response = record ? (resource === 'members' ? sanitizeMemberResponse(record) : toResponse(record)) : null;
    if (response) {
      await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
    }
    return response;
  }

  const current = await def.model.findById(id);
  if (!current || !canAccessBranchRecord(resource, current.toObject(), actorUser)) return null;
  const payload = def.normalize ? def.normalize({ ...current.toObject(), ...data }) : clone({ ...current.toObject(), ...data });
  if (isBranchScopedResource(resource)) {
    payload.branchCode = resolveBranchCode(actorUser, current.branchCode);
  }
  if (meta.actorUserId) {
    payload.updatedByUserId = meta.actorUserId;
  }
  current.set(payload);
  await current.save();
  const record = current.toObject();
  const response = resource === 'members' ? sanitizeMemberResponse(record) : toResponse(record);
  await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
  return response;
}

async function deleteResource(resource, id, meta = {}) {
  const def = getResourceDef(resource);
  const actorUser = meta.actorUser || {};

  if (resource === 'branches' && getScopedBranchCode(actorUser)) {
    const error = new Error('Branch access denied');
    error.statusCode = 403;
    throw error;
  }

  if (resource === 'employees') {
    const record = await User.findOneAndDelete({ _id: id, code: { $ne: '' } }).lean();
    if (!record || !canAccessBranchRecord(resource, record, actorUser)) {
      return false;
    }
    await deleteDocumentFiles(record.documents || {});
    if (record.avatarFileId) {
      await deleteFileById(record.avatarFileId).catch(() => {});
    }
    if (record.documentsFolderId) {
      await deleteFolder(record.documentsFolderId).catch(() => {});
    }
    await notifySafely(buildResourceNotificationPayload(resource, 'deleted', sanitizeEmployeeUserResponse(record), meta));
    return true;
  }

  const current = await def.model.findById(id).lean();
  if (!current || !canAccessBranchRecord(resource, current, actorUser)) return false;
  if (resource === 'members') {
    await deleteDocumentFiles(current.documents || {});
    if (current.photoFileId) {
      await deleteFileById(current.photoFileId).catch(() => {});
    }
    if (current.documentsFolderId) {
      await deleteFolder(current.documentsFolderId).catch(() => {});
    }
  }
  await def.model.findByIdAndDelete(id);
  const response = resource === 'members' ? sanitizeMemberResponse(current) : toResponse(current);
  await notifySafely(buildResourceNotificationPayload(resource, 'deleted', response, meta));
  return true;
}

function normalizeResourcePayload(resource, data = {}) {
  const def = getResourceDef(resource);
  return def.normalize ? def.normalize(data) : clone(data);
}

function ledgerSnapshotFromDocuments(ledgers = [], vouchers = []) {
  const totals = new Map();
  for (const ledger of ledgers) {
    const code = cleanUpper(ledger.code);
    totals.set(code, {
      code,
      name: ledger.name,
      nature: cleanUpper(ledger.nature),
      group: cleanUpper(ledger.group),
      openingBalance: toNumber(ledger.openingBalance, 0),
      balanceSide: cleanUpper(ledger.balanceSide || 'DR'),
      totalDr: 0,
      totalCr: 0
    });
  }

  for (const voucher of vouchers) {
    for (const line of toArray(voucher.journalLines)) {
      const ledgerCode = cleanUpper(line.ledgerCode);
      if (!totals.has(ledgerCode)) {
        totals.set(ledgerCode, {
          code: ledgerCode,
          name: ledgerCode,
          nature: 'ASSET',
          group: 'GENERAL',
          openingBalance: 0,
          balanceSide: 'DR',
          totalDr: 0,
          totalCr: 0
        });
      }
      const row = totals.get(ledgerCode);
      row.totalDr += toNumber(line.dr, 0);
      row.totalCr += toNumber(line.cr, 0);
    }
  }

  return [...totals.values()].map((row) => {
    const openingDr = row.balanceSide === 'DR' ? row.openingBalance : 0;
    const openingCr = row.balanceSide === 'CR' ? row.openingBalance : 0;
    const debit = openingDr + row.totalDr;
    const credit = openingCr + row.totalCr;
    const closingSide = debit >= credit ? 'DR' : 'CR';
    const balance = Number(Math.abs(debit - credit).toFixed(2));

    return {
      ...row,
      opening: row.openingBalance,
      openingSide: row.balanceSide,
      balance,
      closing: balance,
      closingSide
    };
  }).sort((a, b) => a.code.localeCompare(b.code));
}

async function getLedgerSnapshots({ uptoDate = '', branchCode = '' } = {}) {
  const ledgers = await Ledger.find({}).lean();
  const query = { status: 'Posted' };
  if (uptoDate) {
    query.date = { $lte: uptoDate };
  }
  if (branchCode) {
    query.branchCode = cleanUpper(branchCode);
  }
  const vouchers = await Voucher.find(query).lean();
  return ledgerSnapshotFromDocuments(ledgers, vouchers);
}

async function getDashboardSummary({ user = {}, fyStart = '', fyEnd = '' } = {}) {
  const branchCode = resolveBranchCode(user);
  const branchQuery = branchCode ? { code: branchCode } : {};
  const userQuery = branchCode ? { code: { $ne: '' }, branchCode } : { code: { $ne: '' } };
  
  const voucherQuery = branchCode ? { branchCode } : {};
  const txQuery = branchCode ? { branchCode } : {};
  
  if (fyStart || fyEnd) {
    voucherQuery.date = {};
    txQuery.date = {};
    if (fyStart) {
      voucherQuery.date.$gte = cleanText(fyStart);
      txQuery.date.$gte = cleanText(fyStart);
    }
    if (fyEnd) {
      voucherQuery.date.$lte = cleanText(fyEnd);
      txQuery.date.$lte = cleanText(fyEnd);
    }
  }
  const [
    society,
    branches,
    members,
    employees,
    ledgers,
    rates,
    bankAccounts,
    demands,
    noInterestMembers,
    vouchers,
    bankTransactions
  ] = await Promise.all([
    Society.findOne({ key: 'default' }).lean(),
    Branch.countDocuments(branchQuery),
    Member.countDocuments(branchCode ? { branchCode } : {}),
    User.countDocuments(userQuery),
    Ledger.countDocuments({}),
    Rate.countDocuments({}),
    BankAccount.countDocuments({}),
    Demand.countDocuments(branchCode ? { branchCode } : {}),
    NoInterestMember.countDocuments(branchCode ? { branchCode } : {}),
    Voucher.find(voucherQuery).sort({ createdAt: -1 }).limit(10).lean(),
    BankTransaction.find(txQuery).sort({ createdAt: -1 }).limit(10).lean()
  ]);

  return {
    society: society ? toResponse(society) : null,
    headOffice: society ? toResponse(society) : null,
    counts: {
      branches,
      members,
      employees,
      ledgers,
      rates,
      bankAccounts,
      demands,
      noInterestMembers,
      vouchers: await Voucher.countDocuments(voucherQuery),
      bankTransactions: await BankTransaction.countDocuments(txQuery)
    },
    recentVouchers: vouchers.map((voucher) => toResponse(voucher)),
    recentBankTransactions: bankTransactions.map((transaction) => toResponse(transaction))
  };
}

async function getLookups(user = {}) {
    const [
      headOffice,
      branches,
      members,
      employees,
      ledgers,
      rates,
      bankAccounts,
      demands,
      noInterestMembers,
      ratesConfig
    ] = await Promise.all([
      getSingle('society'),
      listResource('branches', '', user),
      listResource('members', '', user),
      listResource('employees', '', user),
      listResource('ledgers'),
      listResource('rates'),
      listResource('bankAccounts'),
      listResource('demands', '', user),
      listResource('noInterestMembers', '', user),
      getGlobalRatesConfig()
    ]);
  
    return {
      headOffice,
      branches,
      members,
      employees,
      ledgers,
      rates,
      bankAccounts,
      demands,
      noInterestMembers,
      ratesConfig
    };
  }
  async function buildVoucherRows(filter = {}) {
  const query = {};
  if (filter.search) {
    Object.assign(query, buildSearchQuery(RESOURCE_DEFS.vouchers.searchFields, filter.search));
  }
  if (filter.status) {
    query.status = cleanText(filter.status);
  }
  if (filter.partyType) {
    query.partyType = cleanText(filter.partyType);
  }
  const branchCode = resolveBranchCode(filter.user, filter.branchCode);
  if (branchCode) {
    query.branchCode = branchCode;
  }
  if (filter.dateFrom || filter.dateTo) {
    query.date = {};
    if (filter.dateFrom) query.date.$gte = cleanText(filter.dateFrom);
    if (filter.dateTo) query.date.$lte = cleanText(filter.dateTo);
  }

  const vouchers = await Voucher.find(query).sort({ date: -1, createdAt: -1 }).lean();
  return vouchers.map((voucher) => toResponse(voucher));
}

async function buildBankTransactionRows(filter = {}) {
  const query = {};
  if (filter.search) {
    Object.assign(query, buildSearchQuery(RESOURCE_DEFS.bankTransactions.searchFields, filter.search));
  }
  if (filter.status) {
    query.status = cleanText(filter.status);
  }
  if (filter.bankAccountCode) {
    query.bankAccountCode = cleanUpper(filter.bankAccountCode);
  }
  const branchCode = resolveBranchCode(filter.user, filter.branchCode);
  if (branchCode) {
    query.branchCode = branchCode;
  }
  if (filter.dateFrom || filter.dateTo) {
    query.date = {};
    if (filter.dateFrom) query.date.$gte = cleanText(filter.dateFrom);
    if (filter.dateTo) query.date.$lte = cleanText(filter.dateTo);
  }

  const rows = await BankTransaction.find(query).sort({ date: -1, createdAt: -1 }).lean();
  return rows.map((row) => toResponse(row));
}

async function buildMemberLedgerReport({ memberCode, dateFrom = '', dateTo = '', user = {} } = {}) {
  const member = await Member.findOne({ code: cleanUpper(memberCode) }).lean();
  if (!member || !canAccessBranchRecord('members', member, user)) {
    return null;
  }

  const branchCode = resolveBranchCode(user, member.branchCode);
  const query = { status: 'Posted' };
  if (branchCode) {
    query.branchCode = branchCode;
  }
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = cleanText(dateFrom);
    if (dateTo) query.date.$lte = cleanText(dateTo);
  }

  const vouchers = await Voucher.find(query).sort({ date: 1, createdAt: 1 }).lean();
  const rows = [];
  let balance = 0;

  for (const voucher of vouchers) {
    const voucherMember = getPartyMemberCode(voucher);
    const recoveryLines = toArray(voucher.details?.recoveryLines);
    const isPartyMatch = voucherMember && voucherMember === member.code;
    const lineMatch = recoveryLines.find((line) => cleanUpper(line.member || line.memberCode) === member.code);

    if (!isPartyMatch && !lineMatch) {
      continue;
    }

    let debit = 0;
    let credit = 0;
    let particulars = voucher.voucherCategory || voucher.transactionType || voucher.narration || 'Voucher';

    if (lineMatch) {
      const lineTotal = toNumber(lineMatch.total, 0);
      credit = lineTotal;
      particulars = particulars + ' - Recovery';
    } else if (cleanLower(voucher.accent) === 'pink') {
      debit = voucher.amount;
    } else if (cleanLower(voucher.accent) === 'green') {
      credit = voucher.amount;
    } else if (cleanLower(voucher.transactionType) === 'payment') {
      debit = voucher.amount;
    } else {
      credit = voucher.amount;
    }

    balance += credit - debit;
    rows.push({
      voucherNo: voucher.voucherNo,
      date: voucher.date,
      particulars,
      debit,
      credit,
      balance: Number(balance.toFixed(2)),
      narration: voucher.narration || voucher.details?.narration || ''
    });
  }

  return {
    member: toResponse(member),
    balances: {
      share: toNumber(member.balances?.share, 0),
      compulsoryDeposit: toNumber(member.depositBalance, toNumber(member.balances?.compulsoryDeposit, 0)),
      specialSaving: toNumber(member.balances?.specialSaving, 0),
      providentFund: toNumber(member.balances?.providentFund, 0),
      loanAgainstDeposit: toNumber(member.balances?.loanAgainstDeposit, 0),
      insurancePremium: toNumber(member.balances?.insurancePremium, 0),
      loanOutstanding: toNumber(member.loanOutstanding, 0)
    },
    rows
  };
}

async function buildAccountStatementReport({ search = '', nature = '', uptoDate = '', user = {} } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate, branchCode: resolveBranchCode(user) });
  const filtered = snapshots.filter((row) => {
    const matchesNature = !nature || cleanUpper(row.nature) === cleanUpper(nature);
    const matchesSearch = !search || [row.code, row.name, row.group].some((value) => cleanLower(value).includes(cleanLower(search)));
    return matchesNature && matchesSearch;
  });

  return filtered.map((row) => ({
    ledgerCode: row.code,
    ledgerName: row.name,
    openingBalance: row.opening,
    openingSide: row.openingSide,
    totalCr: row.totalCr,
    totalDr: row.totalDr,
    balance: row.balance,
    balanceSide: row.closingSide
  }));
}

async function buildTrialBalanceReport({ uptoDate = '', user = {} } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate, branchCode: resolveBranchCode(user) });
  return snapshots.map((row) => ({
    ledgerCode: row.code,
    ledgerName: row.name,
    debit: row.closingSide === 'DR' ? row.closing : 0,
    credit: row.closingSide === 'CR' ? row.closing : 0
  }));
}

async function buildBalanceSheetReport({ uptoDate = '', user = {} } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate, branchCode: resolveBranchCode(user) });
  const liabilities = snapshots.filter((row) => row.nature === 'LIABILITY');
  const assets = snapshots.filter((row) => row.nature === 'ASSET');

  return {
    liabilities: liabilities.map((row) => ({ ledgerCode: row.code, ledgerName: row.name, amount: row.closing })),
    assets: assets.map((row) => ({ ledgerCode: row.code, ledgerName: row.name, amount: row.closing })),
    totalLiabilities: liabilities.reduce((sum, row) => sum + row.closing, 0),
    totalAssets: assets.reduce((sum, row) => sum + row.closing, 0)
  };
}

async function buildProfitLossReport({ uptoDate = '', user = {} } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate, branchCode: resolveBranchCode(user) });
  const income = snapshots.filter((row) => row.nature === 'INCOME');
  const expense = snapshots.filter((row) => row.nature === 'EXPENSE');

  return {
    income: income.map((row) => ({ ledgerCode: row.code, ledgerName: row.name, amount: row.closing })),
    expense: expense.map((row) => ({ ledgerCode: row.code, ledgerName: row.name, amount: row.closing })),
    totalIncome: income.reduce((sum, row) => sum + row.closing, 0),
    totalExpense: expense.reduce((sum, row) => sum + row.closing, 0)
  };
}

async function buildCashBookReport({ date = '', user = {} } = {}) {
  const query = date ? { status: 'Posted', date } : { status: 'Posted' };
  const branchCode = resolveBranchCode(user);
  if (branchCode) {
    query.branchCode = branchCode;
  }
  const vouchers = await Voucher.find(query).sort({ date: 1, createdAt: 1 }).lean();
  const rows = [];

  for (const voucher of vouchers) {
    for (const line of toArray(voucher.journalLines)) {
      if (cleanUpper(line.ledgerCode) === 'L001') {
        rows.push({
          voucherNo: voucher.voucherNo,
          date: voucher.date,
          particulars: voucher.voucherCategory || voucher.transactionType || 'Voucher',
          receipt: toNumber(line.dr, 0),
          payment: toNumber(line.cr, 0)
        });
      }
    }
  }

  return rows;
}

async function buildDayBookReport({ date = '', user = {} } = {}) {
  const query = date ? { status: 'Posted', date } : { status: 'Posted' };
  const branchCode = resolveBranchCode(user);
  if (branchCode) {
    query.branchCode = branchCode;
  }
  const vouchers = await Voucher.find(query).sort({ date: 1, createdAt: 1 }).lean();
  const rows = [];

  for (const voucher of vouchers) {
    for (const line of toArray(voucher.journalLines)) {
      rows.push({
        voucherNo: voucher.voucherNo,
        date: voucher.date,
        ledgerCode: cleanUpper(line.ledgerCode),
        particulars: line.memo || voucher.narration || voucher.voucherCategory || voucher.transactionType || 'Voucher',
        debit: toNumber(line.dr, 0),
        credit: toNumber(line.cr, 0)
      });
    }
  }

  return rows;
}

async function buildVoucherSummaryReport({ date = '', user = {} } = {}) {
  const query = date ? { status: 'Posted', date } : { status: 'Posted' };
  const branchCode = resolveBranchCode(user);
  if (branchCode) {
    query.branchCode = branchCode;
  }
  const vouchers = await Voucher.find(query).lean();
  const totals = new Map();

  for (const voucher of vouchers) {
    const key = cleanText(voucher.voucherCategory || voucher.transactionType || 'Voucher');
    totals.set(key, (totals.get(key) || 0) + toNumber(voucher.amount, 0));
  }

  return [...totals.entries()].map(([voucherCategory, amount]) => ({ voucherCategory, amount })).sort((a, b) => a.voucherCategory.localeCompare(b.voucherCategory));
}

async function buildMonthlySummaryReport({ branchCode = '', month = '', user = {} } = {}) {
  const query = { status: 'Posted' };
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  if (effectiveBranchCode) {
    query.branchCode = effectiveBranchCode;
  }
  const vouchers = await Voucher.find(query).lean();
  const totals = new Map();

  for (const voucher of vouchers) {
    if (month && cleanText(voucher.date).slice(0, 7) !== cleanText(month)) {
      continue;
    }
    const key = cleanText(voucher.voucherCategory || voucher.transactionType || 'Voucher');
    const row = totals.get(key) || { transactionType: key, count: 0, amount: 0 };
    row.count += 1;
    row.amount += toNumber(voucher.amount, 0);
    totals.set(key, row);
  }

  return [...totals.values()].sort((a, b) => a.transactionType.localeCompare(b.transactionType));
}

async function buildDemandListReport({ month = '', branchCode = '', user = {} } = {}) {
  const query = {};
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  if (month) {
    query.month = cleanText(month);
  }
  if (effectiveBranchCode) {
    query.branchCode = effectiveBranchCode;
  }
  const rows = await Demand.find(query).sort({ updatedAt: -1 }).lean();
  return rows.map((row) => ({
    demandNo: row.demandNo,
    memberCode: row.memberCode,
    month: row.month,
    total: toNumber(row.total, 0),
    recovered: toNumber(row.recovered, 0),
    pending: Math.max(0, toNumber(row.total, 0) - toNumber(row.recovered, 0)),
    status: row.status
  }));
}

async function buildAllMemberListReport({ branchCode = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const query = effectiveBranchCode ? { branchCode: effectiveBranchCode } : {};
  const rows = await Member.find(query).sort({ updatedAt: -1 }).lean();
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    branchCode: row.branchCode,
    category: row.category,
    membershipNo: row.membershipNo,
    status: row.status
  }));
}

async function buildPaymentReceiptStatementReport({ dateFrom = '', dateTo = '', branchCode = '', user = {} } = {}) {
  const query = { status: 'Posted' };
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  if (effectiveBranchCode) {
    query.branchCode = effectiveBranchCode;
  }
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = cleanText(dateFrom);
    if (dateTo) query.date.$lte = cleanText(dateTo);
  }

  const vouchers = await Voucher.find(query).sort({ date: 1, createdAt: 1 }).lean();
  return vouchers.map((voucher) => ({
    voucherNo: voucher.voucherNo,
    date: voucher.date,
    voucherCategory: voucher.voucherCategory,
    partyCode: voucher.partyCode,
    payment: cleanLower(voucher.accent) === 'pink' ? voucher.amount : 0,
    receipt: cleanLower(voucher.accent) === 'green' ? voucher.amount : 0
  }));
}

async function buildBranchListReport({ branchCode = '', user = {} } = {}) {
    const effectiveBranchCode = resolveBranchCode(user, branchCode);
    const query = effectiveBranchCode ? { code: effectiveBranchCode } : {};
    const rows = await Branch.find(query).sort({ code: 1 }).lean();
    return rows.map((row) => ({
      code: row.code,
      headOfficeCode: row.headOfficeCode || SOCIETY_SEED.code,
      place: row.place,
      district: row.district,
      phone: row.phone,
      address: row.address
    }));
  }
  async function buildDividendReport({ rate = 8, branchCode = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const query = effectiveBranchCode ? { branchCode: effectiveBranchCode } : {};
  const rows = await Member.find(query).sort({ code: 1 }).lean();
  return rows
    .filter((row) => row.status !== 'Exited')
    .map((row) => {
      const shareBalance = toNumber(row.balances?.share, 0);
      return {
        memberCode: row.code,
        memberName: row.name,
        shareBalance,
        dividendRate: rate,
        dividendAmount: Number((shareBalance * rate) / 100)
      };
    });
}

async function buildDashboardQuickSummary({ user = {}, fyStart = '', fyEnd = '' } = {}) {
  const summary = await getDashboardSummary({ user, fyStart, fyEnd });
  const reports = await Promise.all([
    buildAccountStatementReport({ user, uptoDate: fyEnd }),
    buildTrialBalanceReport({ user, uptoDate: fyEnd })
  ]);
  return {
    ...summary,
    reportHighlights: {
      accountStatementRows: reports[0].length,
      trialBalanceRows: reports[1].length
    }
  };
}

async function getNextVoucherNo(branchCode = '') {
  const query = branchCode ? { branchCode: cleanUpper(branchCode) } : {};
  const last = await Voucher.findOne(query).sort({ createdAt: -1 }).select('voucherNo').lean();
  if (!last?.voucherNo) return 'V-0001';
  const match = String(last.voucherNo).match(/(\d+)$/);
  if (!match) return 'V-0001';
  return `V-${String(Number(match[1]) + 1).padStart(4, '0')}`;
}

async function getNextTransactionNo(branchCode = '') {
  const query = branchCode ? { branchCode: cleanUpper(branchCode) } : {};
  const last = await BankTransaction.findOne(query).sort({ createdAt: -1 }).select('transactionNo').lean();
  if (!last?.transactionNo) return 'BT0001';
  const match = String(last.transactionNo).match(/(\d+)$/);
  if (!match) return 'BT0001';
  return `BT${String(Number(match[1]) + 1).padStart(4, '0')}`;
}

function getTransactionCatalogItemByKey(key = '') {
  const normalized = cleanText(key).toLowerCase();
  if (!normalized) return null;
  for (const section of TRANSACTION_CATALOG) {
    const match = (section.items || []).find((item) => cleanText(item.key).toLowerCase() === normalized);
    if (match) return match;
  }
  return null;
}
function normalizeVoucher(data = {}) {
  const details = toMixed(data.details, {});
  const catalogItem = getTransactionCatalogItemByKey(details.key || data.transactionKey || '');
  return {
    voucherNo: cleanText(data.voucherNo),
    date: cleanText(data.date),
    voucherCategory: cleanText(data.voucherCategory || catalogItem?.voucherCategory),
    transactionType: cleanText(data.transactionType || catalogItem?.transactionType),
    accent: cleanText(data.accent || catalogItem?.accent || 'neutral'),
    mode: cleanText(data.mode || catalogItem?.mode),
    partyType: cleanText(data.partyType || (catalogItem ? 'member' : 'ledger')),
    partyCode: cleanText(data.partyCode),
    partyName: cleanText(data.partyName),
    branchCode: cleanUpper(data.branchCode),
    amount: toNumber(data.amount, 0),
    narration: cleanText(data.narration),
    status: cleanText(data.status || 'Draft'),
    journalLines: toArray(data.journalLines),
    details,
    documents: toMixed(data.documents, {}),
    payload: toMixed(data.payload, {})
  };
}

function normalizeBankTransaction(data = {}) {
  return {
    transactionNo: cleanText(data.transactionNo),
    date: cleanText(data.date),
    voucherCategory: cleanText(data.voucherCategory),
    transactionType: cleanText(data.transactionType),
    accent: cleanText(data.accent),
    bankAccountCode: cleanUpper(data.bankAccountCode),
    branchCode: cleanUpper(data.branchCode),
    amount: toNumber(data.amount, 0),
    narration: cleanText(data.narration),
    status: cleanText(data.status || 'Draft'),
    documents: toMixed(data.documents, {}),
    payload: toMixed(data.payload, {})
  };
}

async function getSingle(resource) {
  const def = getResourceDef(resource);
  if (!def.singleton) {
    const error = new Error(`${resource} is not a singleton resource`);
    error.statusCode = 400;
    throw error;
  }
  const record = await def.model.findOne(def.uniqueQuery || { key: 'default' }).lean();
  return record ? toResponse(record) : null;
}

async function createVoucher(data = {}, meta = {}) {
  const branchCode = resolveBranchCode(meta.actorUser || {}, data.branchCode);
  const voucherNo = cleanText(data.voucherNo) || await getNextVoucherNo(branchCode);
  const payload = normalizeVoucher({ ...data, voucherNo, branchCode });
  if (meta.actorUserId) {
    payload.createdByUserId = meta.actorUserId;
    payload.updatedByUserId = meta.actorUserId;
  }
  const record = await Voucher.create(payload);
  const response = toResponse(record);
  await notifySafely(buildVoucherNotificationPayload('created', response, meta));
  return response;
}

async function updateVoucher(id, data = {}, meta = {}) {
  const current = await Voucher.findById(id);
  if (!current) return null;
  const payload = normalizeVoucher({ ...current.toObject(), ...data });
  payload.branchCode = resolveBranchCode(meta.actorUser || {}, current.branchCode);
  if (meta.actorUserId) {
    payload.updatedByUserId = meta.actorUserId;
  }
  current.set(payload);
  await current.save();
  const response = toResponse(current.toObject());
  await notifySafely(buildVoucherNotificationPayload('updated', response, meta));
  return response;
}

async function deleteVoucher(id) {
  const record = await Voucher.findByIdAndDelete(id).lean();
  if (!record) return false;
  await deleteDocumentFiles(record.documents || {});
  return true;
}

async function reverseVoucher(id, meta = {}) {
  const current = await Voucher.findById(id);
  if (!current) return null;
  if (current.status !== 'Posted') {
    const error = new Error('Only posted vouchers can be reversed');
    error.statusCode = 400;
    throw error;
  }
  current.status = 'Reversed';
  if (meta.actorUserId) current.updatedByUserId = meta.actorUserId;
  await current.save();
  const response = toResponse(current.toObject());
  await notifySafely(buildVoucherNotificationPayload('reversed', response, meta));
  return response;
}

async function createBankTransaction(data = {}, meta = {}) {
  const branchCode = resolveBranchCode(meta.actorUser || {}, data.branchCode);
  const transactionNo = cleanText(data.transactionNo) || await getNextTransactionNo(branchCode);
  const payload = normalizeBankTransaction({ ...data, transactionNo, branchCode });
  if (meta.actorUserId) {
    payload.createdByUserId = meta.actorUserId;
    payload.updatedByUserId = meta.actorUserId;
  }
  const record = await BankTransaction.create(payload);
  const response = toResponse(record);
  await notifySafely(buildBankTransactionNotificationPayload('created', response, meta));
  return response;
}

async function updateBankTransaction(id, data = {}, meta = {}) {
  const current = await BankTransaction.findById(id);
  if (!current) return null;
  const payload = normalizeBankTransaction({ ...current.toObject(), ...data });
  payload.branchCode = resolveBranchCode(meta.actorUser || {}, current.branchCode);
  if (meta.actorUserId) {
    payload.updatedByUserId = meta.actorUserId;
  }
  current.set(payload);
  await current.save();
  const response = toResponse(current.toObject());
  await notifySafely(buildBankTransactionNotificationPayload('updated', response, meta));
  return response;
}

async function deleteBankTransaction(id) {
  const record = await BankTransaction.findByIdAndDelete(id).lean();
  if (!record) return false;
  await deleteDocumentFiles(record.documents || {});
  return true;
}


module.exports = {
  getGlobalRatesConfig,
  updateGlobalRatesConfig,
  buildAccountStatementReport,
  buildAllMemberListReport,
  buildBalanceSheetReport,
  buildBankTransactionRows,
  buildBranchListReport,
  buildCashBookReport,
  buildDayBookReport,
  buildDashboardQuickSummary,
  buildDemandListReport,
  buildDividendReport,
  buildMonthlySummaryReport,
  buildMemberLedgerReport,
  buildPaymentReceiptStatementReport,
  buildProfitLossReport,
  buildTrialBalanceReport,
  buildVoucherRows,
  buildVoucherSummaryReport,
  createBankTransaction,
  createResource,
  createVoucher,
  deleteBankTransaction,
  deleteResource,
  deleteVoucher,
  getDashboardSummary,
  getLedgerSnapshots,
  getLookups,
  getNextTransactionNo,
  getNextVoucherNo,
  getTransactionCatalog,
  getResource,
  getSingle,
  listResource,
  normalizeResourcePayload,
  reverseVoucher,
  seedBankingData,
  updateBankTransaction,
  updateResource,
  updateVoucher
};


























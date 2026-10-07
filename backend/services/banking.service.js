const bcrypt = require('bcryptjs');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const {
  BANK_ACCOUNT_SEEDS,
  BANK_TRANSACTION_SEEDS,
  BRANCH_SEEDS,
  COMMITTEE_SEED,
  COMMITTEE_DIRECTOR_SEEDS,
  DEMAND_LIST_SEEDS,
  DEMAND_LINE_SEEDS,
  EMPLOYEE_SEEDS,
  LEDGER_SEEDS,
  MEMBER_SEEDS,
  MEMBER_DEMAND_DEFAULT_SEEDS,
  NO_INTEREST_MEMBER_SEEDS,
  RATE_SEEDS,
  RECOVERY_LINE_SEEDS,
  SOCIETY_SEED,
  VOUCHER_SEEDS
} = require('../config/bankingSeed');
const {
  BankAccount,
  BankTransaction,
  Branch,
  Committee,
  CommitteeDirector,
  Employee,
  DemandList,
  DemandLine,
  Ledger,
  Member,
  MemberDemandDefault,
  NoInterestMember,
  Rate,
  RecoveryLine,
  Society,
  Voucher,
  JournalLine,
  AuditLog
} = require('../models/banking.models');
const User = require('../models/user.model');
const {
  deleteFileById,
  deleteFolder,
  ensureEntityFolder
} = require('./file.service');
const { createNotification } = require('./notification.service');
const { DEFAULT_SETTINGS } = require('../config/defaultSettings');
const { BANK_VOUCHER_KEYS } = require('../config/transactionConstants');
const { getSettings, updateSettings, mergeDeep } = require('./settings.service');
const { toResponse } = require('../utils/response');
const { getNextSequenceValue, syncSequence } = require('./sequence.service');
const { buildFileViewUrl } = require('../utils/file-url');
const { withTransaction, restoreMainRow, initializeDatabase } = require('../config/postgres');
const { buildJournalLinesForVoucher } = require('./posting.service');
const rateHistory = require('../utils/rateHistory');
// The 'employees' resource here is a second, historically-unused entry point
// (no frontend caller) alongside the real one at /users — delegating to
// auth.service.js keeps employees<->users linking logic (creating/syncing the
// real Employee HR row, see syncLinkedEmployee) in one place instead of two
// divergent implementations.
const authService = require('./auth.service');

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

function toPaise(value) { return Math.round(Number(value || 0) * 100); }
function toRupees(value) { return Number((Number(value || 0) / 100).toFixed(2)); }
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
  'members',
  'demandLists',
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

function parseBalancesString(val) {
  if (typeof val === 'string') {
    try { 
      let parsed = JSON.parse(val);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return parsed || {};
    } catch(e) { return {}; }
  }
  return val || {};
}

function parseBalancesString(val) {
  if (typeof val === 'string') {
    try { 
      let parsed = JSON.parse(val);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return parsed || {};
    } catch(e) { return {}; }
  }
  return val || {};
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

const BANK_VOUCHER_KEY_SET = new Set(BANK_VOUCHER_KEYS);

function sanitizeBankVoucherDetails(value = {}) {
  const details = clone(toMixed(value, {}));
  if (BANK_VOUCHER_KEY_SET.has(cleanLower(details.key))) {
    delete details.fixedSettlement;
    delete details.fromAccount;
    delete details.toAccount;
    delete details.fixedFrom;
    delete details.fixedTo;
  }
  return details;
}

function sanitizeVoucherResponse(record = {}) {
  const response = toResponse(record);
  if (!response) return response;
  return {
    ...response,
    details: sanitizeBankVoucherDetails(response.details)
  };
}

const DEFAULT_RATES_CONFIG = clone(DEFAULT_SETTINGS.payload?.ratesConfig || {});

function normalizeRatesConfig(config = {}) {
  const source = config || {};
  const flatRates = {
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
  };
  // Before rate history existed the flat interestRates were the only record;
  // they become the opening period. Once history exists it is authoritative
  // and interestRates is just the set in force today.
  const interestRateHistory = rateHistory.normalizeRateHistory(source.interestRateHistory, flatRates);
  return {
    interestRates: rateHistory.ratesAsOf(interestRateHistory, rateHistory.todayIso()),
    interestRateHistory,
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

// Interest rate edits are recorded as a dated period rather than overwriting
// the rates, so reports keep using the old rate for days before the change.
// `effectiveFrom` defaults to today; an explicit '' corrects the opening
// period. `removeRatePeriod` deletes the period starting on that date.
async function updateGlobalRatesConfig(patch = {}) {
  const {
    interestRates,
    interestRateHistory: _ignoredHistory,
    effectiveFrom,
    rateNote = '',
    removeRatePeriod,
    ...rest
  } = patch || {};
  const current = await getGlobalRatesConfig();
  let history = current.interestRateHistory;
  try {
    if (removeRatePeriod) {
      history = rateHistory.removeRatePeriod(history, cleanText(removeRatePeriod));
    }
    if (interestRates) {
      history = rateHistory.applyRateChange(history, {
        rates: interestRates,
        effectiveFrom: effectiveFrom === undefined || effectiveFrom === null ? rateHistory.todayIso() : cleanText(effectiveFrom),
        note: cleanText(rateNote),
        recordedAt: new Date().toISOString()
      });
    }
  } catch (cause) {
    const error = new Error(cause.message);
    error.statusCode = 400;
    throw error;
  }
  const next = normalizeRatesConfig({ ...mergeDeep(current, rest), interestRateHistory: history });
  await updateSettings({
    payload: {
      ratesConfig: next
    }
  });
  return next;
}

// Member ledger interest columns -> rate heads on the Rates Dashboard.
const MEMBER_INTEREST_HEADS = {
  specialDeposit: ['paid', 'specialSaving'],
  compulsoryDeposit: ['paid', 'compulsoryDeposit'],
  loan: ['receive', 'loan'],
  loanAgainstDeposit: ['receive', 'loanAgainstDeposit']
};

// Per-head rate timelines for interest accrual, keyed the way each report
// names its columns: { columnKey: ['paid' | 'receive', rateKey] }.
async function getInterestRateTimelines(heads = {}) {
  const { interestRateHistory } = await getGlobalRatesConfig();
  return Object.fromEntries(Object.entries(heads).map(([column, [group, key]]) => (
    [column, rateHistory.rateTimeline(interestRateHistory, group, key)]
  )));
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
            : resource === 'demandLists'
              ? {
                  code: record.demandListNo || '',
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
    
    branches: {
      label: 'Branch',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/branches',
      detailUrl: (record) => `/app/master/branches/${record.id}`
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
    demandLists: {
      label: 'Demand List',
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
  const actionLabel = action === 'created' ? 'created' : action === 'deleted' ? 'deleted' : action === 'updated' ? 'updated' : action;
  const summary = summarizeRecord('vouchers', voucher);
  const actionUrl = action === 'deleted' ? '/app/transactions/overview' : getTransactionSectionUrl(voucher);
  const severity = action === 'deleted' ? 'high' : 'medium';

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
  const code = cleanUpper(data.code || '');

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

function sanitizeMemberResponse(doc) {
  const response = toResponse(doc);
  if (!response) return null;
  response.mobileNo = normalizePhone(response.mobileNo || '');
  response.photoFileId = response.photoFileId ? String(response.photoFileId) : null;
  response.documentsFolderId = response.documentsFolderId ? String(response.documentsFolderId) : null;
  response.photoUrl = buildFileViewUrl(response.photoFileId || response.photoUrl || '');
  return response;
}

// The society logo/watermark are stored as file-view URLs whose access token
// expires (FILE_VIEW_TOKEN_EXPIRES_IN, 2h by default) — re-sign them from the
// file id on every read, as members' photos are, so the images don't break.
function sanitizeSocietyResponse(doc) {
  const response = toResponse(doc);
  if (!response) return null;
  response.logoUrl = buildFileViewUrl(response.logoFileId || response.logoUrl || '');
  response.watermarkUrl = buildFileViewUrl(response.watermarkFileId || response.watermarkUrl || '');
  return response;
}

function sanitizeSingletonResponse(resource, doc) {
  return resource === 'society' ? sanitizeSocietyResponse(doc) : toResponse(doc);
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
      { key: 'loan-paid-member', label: 'Loan Paid to Member', description: 'Disburse loan amounts to members.', voucherCategory: 'Loan Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Cash / Cheque', documents: MEMBER_TRANSACTION_DOCUMENTS.loanPaidMember },
      { key: 'deposit-paid-member', label: 'Compulsory Deposit Paid to Member', description: 'Pay compulsory deposit amounts back to member accounts.', voucherCategory: 'Compulsory Deposit Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Cash / Cheque', documents: MEMBER_TRANSACTION_DOCUMENTS.depositPaidMember },
      { key: 'insurance-paid-member', label: 'Insurance Premium Paid to Member', description: 'Record insurance premium disbursement entries.', voucherCategory: 'Insurance Premium Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Cash / Cheque', documents: MEMBER_TRANSACTION_DOCUMENTS.insurancePaidMember },
      { key: 'ssa-paid-member', label: 'SSA Paid To Member', description: 'Record SSA payout entries to members.', voucherCategory: 'SSA Paid To Member', transactionType: 'payment', accent: 'pink', mode: 'Cash-in-Hand', documents: MEMBER_TRANSACTION_DOCUMENTS.ssaPaidMember },
      { key: 'recovery-member', label: 'Recovery From Member', description: 'Recover dues from member accounts.', voucherCategory: 'Recovery From Member', transactionType: 'receipt', accent: 'emerald', mode: 'Cash / Transfer', documents: MEMBER_TRANSACTION_DOCUMENTS.recoveryMember }
    ]
  },
  {
    key: 'bank',
    label: 'Bank',
    description: 'Bank cash movement, cheque, and transfer vouchers.',
    permission: 'bank-transactions.read',
    items: [
      { key: 'loan-recv-cash', label: 'Loan Received to Cash/Credit A/c', description: 'Receive loan proceeds through cash or credit settlement.', voucherCategory: 'Loan Received', transactionType: 'receipt', accent: 'emerald', mode: 'Cash / Credit', documents: BANK_TRANSACTION_DOCUMENTS['loan-recv-cash'] },
      { key: 'loan-recv-saving', label: 'Loan Received to Saving A/c', description: 'Receive loan proceeds into saving account.', voucherCategory: 'Loan Received to Saving A/c', transactionType: 'receipt', accent: 'emerald', mode: 'Saving A/c', documents: BANK_TRANSACTION_DOCUMENTS['loan-recv-saving'] },
      { key: 'deposit-in-bank', label: 'Deposit in Bank', description: 'Move cash or settlement into bank account.', voucherCategory: 'Deposit in Bank', transactionType: 'transfer', accent: 'amber', mode: 'Bank Deposit', documents: BANK_TRANSACTION_DOCUMENTS['deposit-in-bank'] },
      { key: 'cheque-issue-saving', label: 'Cheque Issue With Bank (Saving A/c)', description: 'Issue cheque against savings account settlement.', voucherCategory: 'Cheque Issue With Bank (Saving A/c)', transactionType: 'payment', accent: 'pink', mode: 'Cheque', documents: BANK_TRANSACTION_DOCUMENTS['cheque-issue-saving'] },
      { key: 'transfer-saving', label: 'Amount Transfer to Saving A/c', description: 'Transfer money to saving account ledger.', voucherCategory: 'Amount Transfer to Saving A/c', transactionType: 'transfer', accent: 'amber', mode: 'Transfer', documents: BANK_TRANSACTION_DOCUMENTS['transfer-saving'] },
      { key: 'transfer-cashcredit', label: 'Amount Transfer to Cash-Credit A/c', description: 'Transfer money to cash-credit account ledger.', voucherCategory: 'Amount Transfer to Cash-Credit A/c', transactionType: 'transfer', accent: 'amber', mode: 'Transfer', documents: BANK_TRANSACTION_DOCUMENTS['transfer-cashcredit'] }
    ]
  },
  {
    key: 'employee',
    label: 'Employee',
    description: 'Employee advance payment and recovery workflow.',
    permission: 'transactions.read',
    items: [
      { key: 'advance-paid-emp', label: 'Advance Paid by Cash/Cheque', description: 'Pay advance to employee through cash or cheque.', voucherCategory: 'Advance Paid by Cash/Cheque', transactionType: 'payment', accent: 'pink', mode: 'Cash / Cheque', documents: EMPLOYEE_TRANSACTION_DOCUMENTS['advance-paid-emp'] },
      { key: 'advance-recovery-emp', label: 'Advance Recovery by Cash/Transfer', description: 'Recover employee advance through cash or transfer.', voucherCategory: 'Advance Recovery by Cash/Transfer', transactionType: 'receipt', accent: 'emerald', mode: 'Cash / Transfer', documents: EMPLOYEE_TRANSACTION_DOCUMENTS['advance-recovery-emp'] }
    ]
  },
  {
    key: 'transfer-voucher',
    label: 'Transfer Voucher',
    description: 'Inter-account transfer voucher movements.',
    permission: 'transactions.read',
    items: [
      { key: 'transfer-voucher-paid', label: 'Transfer Voucher Paid to Member', description: 'Transfer voucher paid out to member.', voucherCategory: 'Transfer Voucher Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Transfer', documents: [] },
      { key: 'transfer-voucher-recover', label: 'Transfer Voucher Recover From Member', description: 'Recover transfer voucher amount from member.', voucherCategory: 'Transfer Voucher Recover From Member', transactionType: 'receipt', accent: 'emerald', mode: 'Transfer', documents: [] },
      { key: 'transfer-voucher-payment', label: 'Payment', description: 'Payment voucher entry under transfer voucher workspace.', voucherCategory: 'Payment', transactionType: 'payment', accent: 'pink', mode: 'Payment', documents: [] },
      { key: 'transfer-voucher-receipt', label: 'Receipt', description: 'Receipt voucher entry under transfer voucher workspace.', voucherCategory: 'Receipt', transactionType: 'receipt', accent: 'emerald', mode: 'Receipt', documents: [] }
    ]
  },
  {
    key: 'interest',
    label: 'Interest',
    description: 'Interest transactions.',
    permission: 'transactions.read',
    items: [
      { key: 'interest-paid-member', label: 'Interest Paid to Member', description: 'Post interest payout to member ledger.', voucherCategory: 'Interest Paid to Member', transactionType: 'payment', accent: 'pink', mode: 'Interest', documents: [] },
      { key: 'interest-recv-member', label: 'Interest Receive From Member', description: 'Receive interest from member.', voucherCategory: 'Interest Receive From Member', transactionType: 'receipt', accent: 'emerald', mode: 'Interest', documents: [] },
      { key: 'interest-recv-employee', label: 'Interest Receive From Employee', description: 'Receive interest from employee.', voucherCategory: 'Interest Receive From Employee', transactionType: 'receipt', accent: 'emerald', mode: 'Interest', documents: [] }
    ]
  },
  {
    key: 'other',
    label: 'Other Transactions',
    description: 'Other transactions and support forms.',
    permission: 'transactions.read',
    items: [
      { key: 'payment-voucher', label: 'Payment Voucher', description: 'General payment entry.', voucherCategory: 'Payment Voucher', transactionType: 'payment', accent: 'pink', mode: 'Payment', documents: [] },
      { key: 'receipt-voucher', label: 'Receipt Voucher', description: 'General receipt entry for the society.', voucherCategory: 'Receipt Voucher', transactionType: 'receipt', accent: 'emerald', mode: 'Receipt', documents: [] },
      { key: 'no-interest-members', label: 'No Interest Members', description: 'Members excluded from interest calculation.', voucherCategory: 'No Interest Members', transactionType: 'support', accent: 'amber', mode: 'Master Link', route: '/app/transactions/other/no-interest-members' },
      { key: 'demand-entry', label: 'Demand Entry', description: 'Create or review demand records from the transaction shell.', voucherCategory: 'Demand Entry', transactionType: 'support', accent: 'amber', mode: 'Demand', route: '/app/transactions/other/demand-entry' }
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
        code: cleanUpper(data.code, SOCIETY_SEED.code),
        name: cleanText(data.name, SOCIETY_SEED.name),
        prefix: cleanText(data.prefix, SOCIETY_SEED.prefix),
        place: cleanText(data.place, SOCIETY_SEED.place),
        regNo: cleanText(data.regNo, SOCIETY_SEED.regNo),
        gstNo: cleanText(data.gstNo, ''),
        email: cleanText(data.email, SOCIETY_SEED.email),
        phone: cleanText(data.phone, ''),
        address: cleanText(data.address, SOCIETY_SEED.address),
        branchCode: cleanUpper(data.branchCode, SOCIETY_SEED.branchCode),
        logoUrl: cleanText(data.logoUrl, ''),
        logoFileId: cleanText(data.logoFileId, ''),
        watermarkEnabled: Boolean(data.watermarkEnabled),
        watermarkUrl: cleanText(data.watermarkUrl, ''),
        watermarkFileId: cleanText(data.watermarkFileId, ''),
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
    searchFields: ['transactionNo', 'bankAccountCode', 'transactionType', 'branchCode', 'linkedClientCode', 'linkedProjectCode', 'linkedInvoiceNo', 'linkedExpenseCode', 'notes', 'voucherNo'],
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
        payload: toMixed(data.payload, {})
      };
    }
  },
  demandLists: {
    model: DemandList,
    searchFields: ['demandListNo', 'month', 'branchCode', 'status', 'remarks'],
    normalize(data = {}) {
      return {
        demandListNo: cleanUpper(data.demandListNo),
        demandListDate: cleanText(data.demandListDate),
        branchCode: cleanUpper(data.branchCode),
        month: cleanText(data.month),
        year: cleanText(data.year),
        status: cleanText(data.status, 'Pending'),
        remarks: cleanText(data.remarks),
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
    searchFields: ['voucherNo', 'voucherCategory', 'transactionType', 'partyCode', 'partyType', 'mode', 'narration', 'referenceNo', 'instrumentNo', 'branchCode', 'fyCode'],
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
        narration: cleanText(data.narration),
        referenceNo: cleanText(data.referenceNo),
        instrumentNo: cleanText(data.instrumentNo),
        instrumentDate: cleanText(data.instrumentDate),
        branchCode: cleanUpper(data.branchCode),
        fyCode: cleanUpper(data.fyCode),
        approvedBy: cleanText(data.approvedBy),
        createdBy: cleanText(data.createdBy),
        details: (() => {
          const details = sanitizeBankVoucherDetails(data.details);
          return sanitizeBankVoucherDetails({
            ...details,
            payMode: cleanText(details.payMode || data.mode || ''),
            sms: Boolean(details.sms)
          });
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

function isLegacyCutoverRow(row) {
  if (!row || !row.payload) return false;
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : row.payload;
  return payload?.sourceType === 'LEGACY_CUTOVER';
}

// Demo/bootstrap seed data (config/bankingSeed.js) must never touch a row
// that came from the real legacy migration (tagged payload.sourceType ===
// 'LEGACY_CUTOVER') — this bootstrap runs on every server startup, and a
// real branch/ledger/member can share the same code, or the same OTHER
// unique field (e.g. a ledger's semanticRole under a different code), as a
// demo seed row. Silently overwriting real financial data with placeholder
// demo data on every restart is exactly the kind of permanent, silent loss
// this whole soft-delete/audit effort was built to prevent — this guard is
// the seed-time half of that guarantee. `conflictFields` lists any OTHER
// unique columns (besides the filter) that could collide on insert.
async function seedOne(model, filter, data, { conflictFields = [] } = {}) {
  const existing = await model.findOne(filter).lean();
  if (existing) {
    if (isLegacyCutoverRow(existing)) return;
    await model.findOneAndUpdate(filter, buildUpsertUpdate(filter, data), { new: true, upsert: true, runValidators: true });
    return;
  }

  for (const field of conflictFields) {
    if (data[field] == null) continue;
    const conflict = await model.findOne({ [field]: data[field] }).lean();
    if (conflict) return;
  }

  await model.findOneAndUpdate(filter, buildUpsertUpdate(filter, data), { new: true, upsert: true, runValidators: true });
}

async function seedMany(model, filterFn, rows = [], options = {}) {
  for (const row of rows) {
    const filter = filterFn(row);
    await seedOne(model, filter, row, options);
  }
}

// Fixture rows from config/bankingSeed.js (demo branches/members/employees/
// ledgers/vouchers etc.) are intentionally NOT seeded here anymore — this DB
// holds real migrated legacy data and startup must not mix placeholder rows
// into it. This now only keeps auto-numbering sequences in sync with the
// migrated data's max codes.
async function seedBankingData() {
  // Synchronize sequences so that the next generated sequence is MAX(code) + 1
  await syncSequence('branches', 'code');
  await syncSequence('members', 'code');
  await syncSequence('members', 'membershipNo');
  await syncSequence('employees', 'code');
  await syncSequence('ledgers', 'code');
  await syncSequence('bank_accounts', 'code');
  await syncSequence('demand_lists', 'demandListNo');
  await syncSequence('no_interest_members', 'code');
  await syncSequence('vouchers', 'voucherNo');
  await syncSequence('bank_transactions', 'transactionNo');

  console.log('Default data seeding completed successfully');
  return true;
}

// A member "belongs" to a given FY if they'd already joined by its end and
// hadn't left before it started — mirrors how the legacy system naturally
// showed each FY's own membership roster (its own per-year MstAccountMaster
// copy), without needing to blank out any field to achieve it. Missing dates
// fail open (never hide a member for lack of data).
function isMemberVisibleInFY(member, fyStart, fyEnd) {
  if (!fyStart && !fyEnd) return true;
  const membershipDate = member.membershipDate ? String(member.membershipDate).slice(0, 10) : '';
  const dismemberedDate = member.dismemberedDate ? String(member.dismemberedDate).slice(0, 10) : '';
  if (membershipDate && fyEnd && membershipDate > fyEnd) return false;
  if (dismemberedDate && fyStart && dismemberedDate < fyStart) return false;
  return true;
}

async function listResource(resource, search = '', user = {}, options = {}) {
  const def = getResourceDef(resource);
  if (resource === 'employees') {
    const rows = await authService.listUsers(search);
    return rows.filter((row) => canAccessBranchRecord(resource, row, user));
  }
  const query = applyBranchScope(buildSearchQuery(def.searchFields, search), resource, user);
  const rows = await def.model.find(query).sort({ updatedAt: -1 }).lean();
  const filtered = resource === 'members'
    ? rows.filter((row) => isMemberVisibleInFY(row, cleanText(options.fyStart), cleanText(options.fyEnd)))
    : rows;
  return filtered.map((row) => {
    if (resource === 'members') return sanitizeMemberResponse(row);
    if (resource === 'society') return sanitizeSocietyResponse(row);
    if (resource === 'vouchers') return sanitizeVoucherResponse(row);
    return toResponse(row);
  });
}

async function getResource(resource, id, user = {}) {
  const def = getResourceDef(resource);
  if (resource === 'employees') {
    const record = await authService.buildAccessProfile(id);
    if (!record || !canAccessBranchRecord(resource, record, user)) {
      return null;
    }
    return record;
  }
  if (def.singleton) {
    const record = await def.model.findOne({ key: 'default' }).lean();
    return record ? sanitizeSingletonResponse(resource, record) : null;
  }

  const record = await def.model.findById(id).lean();
  if (!record || !canAccessBranchRecord(resource, record, user)) return null;
  if (resource === 'members') return sanitizeMemberResponse(record);
  if (resource === 'vouchers') return sanitizeVoucherResponse(record);
  return toResponse(record);
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
    return authService.createUser({ ...data, branchCode: resolveBranchCode(actorUser, data.branchCode) });
  }

  const payload = def.normalize ? def.normalize(data) : clone(data);
  if (isBranchScopedResource(resource)) {
    payload.branchCode = resolveBranchCode(actorUser, payload.branchCode);
  }
  
  const getSequenceField = () => {
    if (['members', 'employees', 'branches', 'ledgers', 'bankAccounts', 'noInterestMembers'].includes(resource)) return 'code';
    if (resource === 'vouchers') return 'voucherNo';
    if (resource === 'bankTransactions') return 'transactionNo';
    if (resource === 'demandLists') return 'demandListNo';
    return null;
  };
  
  const sequenceField = getSequenceField();
  if (sequenceField && !payload[sequenceField]) {
    const tableName = resource === 'bankAccounts' ? 'bank_accounts' 
                    : resource === 'bankTransactions' ? 'bank_transactions'
                    : resource === 'demandLists' ? 'demand_lists'
                    : resource === 'noInterestMembers' ? 'no_interest_members'
                    : resource;
    payload[sequenceField] = await getNextSequenceValue(tableName, sequenceField);
  }

  if (resource === 'members' && !payload.membershipNo) {
    payload.membershipNo = await getNextSequenceValue('members', 'membershipNo');
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
    const response = record ? sanitizeSingletonResponse(resource, record) : null;
    if (response) {
      await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
    }
    return response;
  }

  const record = await def.model.create(payload);
  const response = resource === 'vouchers' ? sanitizeVoucherResponse(record) : toResponse(record);
  await notifySafely(buildResourceNotificationPayload(resource, 'created', response, meta));
  return response;
}

// A recovered demand line is the record of what a saved recovery collected
// against; changing or deleting it would silently invalidate that recovery.
async function assertDemandNotRecovered(resource, id, { deleting = false } = {}) {
  if (resource === 'demandLines') {
    const line = await DemandLine.findById(id).lean();
    if (line && cleanUpper(line.recoveryStatus) === DEMAND_RECOVERED) {
      const ref = line?.payload?.recoveryVoucherNo ? ` (recovery voucher ${line.payload.recoveryVoucherNo})` : '';
      throw recoveryHttpError(`This demand has already been recovered${ref}. Edit or delete the linked recovery first.`, 409);
    }
  }
  if (resource === 'demandLists' && deleting) {
    const list = await DemandList.findById(id).lean();
    if (list) {
      const recovered = (await DemandLine.find({ demandListNo: list.demandListNo }).lean())
        .filter((line) => cleanUpper(line.postedBranch) === cleanUpper(list.branchCode) && cleanUpper(line.recoveryStatus) === DEMAND_RECOVERED);
      if (recovered.length) {
        throw recoveryHttpError(`This demand list has ${recovered.length} recovered member line(s). Edit or delete the linked recovery first.`, 409);
      }
    }
  }
}

async function updateResource(resource, id, data = {}, meta = {}) {
  const def = getResourceDef(resource);
  const actorUser = meta.actorUser || {};
  await assertDemandNotRecovered(resource, id);

  if (resource === 'branches' && getScopedBranchCode(actorUser)) {
    const error = new Error('Branch access denied');
    error.statusCode = 403;
    throw error;
  }

  if (resource === 'employees') {
    const current = await User.findById(id).lean();
    if (!current || !canAccessBranchRecord(resource, current, actorUser)) return null;
    return authService.updateUser(id, { ...data, branchCode: resolveBranchCode(actorUser, data.branchCode || current.branchCode) });
  }

  if (resource === 'members') {
    const current = await Member.findById(id);
    if (!current || !canAccessBranchRecord(resource, current.toObject(), actorUser)) return null;

    const previousPhotoFileId = current.photoFileId ? String(current.photoFileId) : '';
    const payload = def.normalize ? def.normalize({ ...current.toObject(), ...data }) : clone({ ...current.toObject(), ...data });
    payload.branchCode = resolveBranchCode(actorUser, current.branchCode);
    payload.code = payload.code || current.code;
    payload.membershipNo = payload.membershipNo || current.membershipNo;
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
    // Merge onto the existing row before normalizing — normalize() falls back
    // to seed defaults for any field it doesn't receive, so without this a
    // partial update (e.g. a page that only edits a handful of fields) would
    // silently reset every other field back to its seed value.
    const existing = await def.model.findOne(def.uniqueQuery || { key: 'default' }).lean();
    const merged = { ...(existing || {}), ...data };
    const payload = def.normalize ? def.normalize({ ...merged, key: 'default' }) : clone(merged);
    if (meta.actorUserId) {
      payload.updatedByUserId = meta.actorUserId;
    }
    const record = await def.model.findOneAndUpdate(
      def.uniqueQuery || { key: 'default' },
      buildUpsertUpdate(def.uniqueQuery || { key: 'default' }, payload),
      { new: true, upsert: true, runValidators: true }
    ).lean();
    const response = record ? sanitizeSingletonResponse(resource, record) : null;
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
  const response = resource === 'members'
    ? sanitizeMemberResponse(record)
    : resource === 'vouchers'
      ? sanitizeVoucherResponse(record)
      : toResponse(record);
  await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
  return response;
}

async function deleteResource(resource, id, meta = {}) {
  const def = getResourceDef(resource);
  const actorUser = meta.actorUser || {};
  await assertDemandNotRecovered(resource, id, { deleting: true });

  if (resource === 'branches' && getScopedBranchCode(actorUser)) {
    const error = new Error('Branch access denied');
    error.statusCode = 403;
    throw error;
  }

  if (resource === 'employees') {
    const record = await User.findById(id).lean();
    if (!record || !canAccessBranchRecord(resource, record, actorUser)) {
      return false;
    }
    return authService.deleteUser(id);
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

// Un-deletes a row soft-deleted by deleteResource (or by the generic
// deleteVoucher/deleteBankTransaction/deleteUser/deleteRole paths, which all
// route through the same deleteMainRow — see config/postgres.js). Mirrors
// deleteResource's shape/branch-access checks.
async function restoreResource(resource, id, meta = {}) {
  const def = getResourceDef(resource);
  const actorUser = meta.actorUser || {};

  if (resource === 'branches' && getScopedBranchCode(actorUser)) {
    const error = new Error('Branch access denied');
    error.statusCode = 403;
    throw error;
  }

  if (resource === 'employees') {
    const current = await User.findById(id).withDeleted().lean();
    if (!current || !current.deletedAt) return false;
    if (!canAccessBranchRecord(resource, current, actorUser)) return false;
    return authService.restoreUser(id);
  }

  const current = await def.model.findById(id).withDeleted().lean();
  if (!current || !current.deletedAt) return false;
  if (!canAccessBranchRecord(resource, current, actorUser)) return false;

  const restored = await restoreMainRow(def.model._tableName, id);
  if (!restored) return false;

  const response = resource === 'members' ? sanitizeMemberResponse(restored) : toResponse(restored);
  await notifySafely(buildResourceNotificationPayload(resource, 'restored', response, meta));
  return true;
}

async function listAuditLog({ tableName = '', recordId = '', dateFrom = '', dateTo = '', page = 1, pageSize = 50 } = {}) {
  const query = {};
  if (tableName) query.tableName = tableName;
  if (recordId) query.recordId = recordId;
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = cleanText(dateFrom);
    if (dateTo) query.createdAt.$lte = cleanText(dateTo);
  }

  const all = await AuditLog.find(query).sort({ createdAt: -1 }).lean();
  const safePage = Math.max(1, toNumber(page, 1));
  const safePageSize = Math.min(200, Math.max(1, toNumber(pageSize, 50)));
  const start = (safePage - 1) * safePageSize;
  const rows = all.slice(start, start + safePageSize).map((row) => ({
    ...toResponse(row),
    changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
  }));

  return { rows, total: all.length, page: safePage, pageSize: safePageSize };
}

function normalizeResourcePayload(resource, data = {}) {
  const def = getResourceDef(resource);
  return def.normalize ? def.normalize(data) : clone(data);
}

// Reads posted journal_lines (the validated, balanced output of the posting
// engine in posting.service.js) rather than voucher.journalLines — a separate
// JSON field that only ever holds whatever a client request body happened to
// send, which for every voucher created through the app's own forms is
// nothing. Reading that field meant trial balance/balance sheet/P&L never
// reflected real activity; only each ledger's static opening balance.
//
// `openingLines` (activity strictly before dateFrom) folds into each ledger's
// base opening balance/side; `journalLines` (the dateFrom..dateTo/uptoDate
// window) becomes the period totalDr/totalCr. Passing only `journalLines`
// (no dateFrom) reproduces the old single-point-in-time behavior.
function ledgerSnapshotFromDocuments(ledgers = [], journalLines = [], openingLines = []) {
  const totals = new Map();
  const ensureRow = (id, seed = {}) => {
    if (!totals.has(id)) {
      totals.set(id, {
        id,
        code: id,
        name: id,
        nature: 'ASSET',
        group: 'GENERAL',
        openingDr: 0,
        openingCr: 0,
        totalDr: 0,
        totalCr: 0,
        ...seed
      });
    }
    return totals.get(id);
  };

  for (const ledger of ledgers) {
    const id = String(ledger.id || ledger._id);
    const balanceSide = cleanUpper(ledger.balanceSide || 'DR');
    const opening = toNumber(ledger.openingBalance, 0);
    ensureRow(id, {
      code: cleanUpper(ledger.code),
      name: ledger.name,
      nature: cleanUpper(ledger.nature),
      group: cleanUpper(ledger.group),
      sortOrder: toNumber(ledger.sortOrder, 0),
      openingDr: balanceSide === 'DR' ? opening : 0,
      openingCr: balanceSide === 'CR' ? opening : 0
    });
  }

  for (const line of openingLines) {
    const row = ensureRow(String(line.ledgerId));
    row.openingDr += toNumber(line.debitAmount, 0);
    row.openingCr += toNumber(line.creditAmount, 0);
  }

  for (const line of journalLines) {
    const row = ensureRow(String(line.ledgerId));
    row.totalDr += toNumber(line.debitAmount, 0);
    row.totalCr += toNumber(line.creditAmount, 0);
  }

  return [...totals.values()].map((row) => {
    const openingBalance = Number(Math.abs(row.openingDr - row.openingCr).toFixed(2));
    const openingSide = row.openingDr >= row.openingCr ? 'DR' : 'CR';
    const debit = row.openingDr + row.totalDr;
    const credit = row.openingCr + row.totalCr;
    const closingSide = debit >= credit ? 'DR' : 'CR';
    const balance = Number(Math.abs(debit - credit).toFixed(2));

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      nature: row.nature,
      group: row.group,
      sortOrder: row.sortOrder || 0,
      opening: openingBalance,
      openingSide,
      totalDr: row.totalDr,
      totalCr: row.totalCr,
      balance,
      closing: balance,
      closingSide,
      // Credit-positive, the legacy vwLedgerBalance sign convention.
      signedBalance: Number((credit - debit).toFixed(2))
    };
  }).sort((a, b) => compareCodesNumerically(a.code, b.code));
}

// ---------------------------------------------------------------------------
// Closed legacy FYs (every JilaSahkariDB<yy><yy> before the cutover DB).
//
// Their vouchers live only in legacy_historical_vouchers (never posted to
// journal_lines), and `ledgers.openingBalance` is the cutover-FY figure, so
// the journal-line snapshot above can't see them. Instead this reproduces the
// legacy app's own vwLedgerBalance for that FY's database:
//   balance = MstAccountMaster.OpeningBal + SUM(Cr) + SUM(Dr)   (Cr +, Dr -)
// with Cr/Dr assigned per EntTrans row by the same rules as the legacy
// VwLedgerTransaction view (see legacyLedgerEntries). Verified ledger-by-ledger
// against every restored legacy FY database.
//
// The per-FY OpeningBal isn't migrated, but legacy's year-end carry-forward
// makes it derivable: Asset/Liability ledgers open each FY at the previous
// FY's closing, while Income/Expense/Primary open at 0. So walking back from
// the cutover FY's opening (payload.raw.OpeningBal):
//   opening(N) = opening(N+1) - movement(N)   for Asset/Liability ledgers.
// ---------------------------------------------------------------------------

const LEGACY_RESETTING_NATURES = new Set(['INCOME', 'EXPENSE', 'PRIMARY']);
const LEGACY_LEDGER_CACHE_TTL_MS = 10 * 60 * 1000;
let legacyLedgerEntriesCache = null;
let legacyLedgerEntriesLoadedAt = 0;

function legacyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// One EntTrans row -> [{ code, cr, dr, viaPayMode }] ledger entries (dr is
// negative), mirroring each UNION branch of legacy VwLedgerTransaction.
// viaPayMode marks the pay-mode side (cash / bank) of the voucher, which the
// legacy Cash Book leaves out of its particulars.
function legacyLedgerEntries(raw = {}, codeByAccId = new Map(), cashAccId = '') {
  const entries = [];
  const type = Number(raw.TransType);
  const isReceipt = String(raw.VoucherType).toUpperCase() === 'R';
  const isPayment = String(raw.VoucherType).toUpperCase() === 'P';
  const total = legacyNumber(raw.TotalAmt);
  const push = (code, cr, dr, viaPayMode = false) => {
    if (code && (cr || dr)) entries.push({ code, cr, dr, viaPayMode });
  };
  // "Normal" direction: receipt credits the account, payment debits it.
  const normal = (code, amount) => push(code, isReceipt ? amount : 0, isPayment ? -amount : 0);
  const codeOf = (accId) => codeByAccId.get(String(accId ?? '')) || '';

  // Cash pay mode: payment credits cash, receipt debits it.
  if (cashAccId && String(raw.PayModeAccID) === cashAccId) {
    push(codeOf(cashAccId), isPayment ? total : 0, isReceipt ? -total : 0, true);
  }
  const particular = codeOf(raw.ParticularAccID);
  if (particular && particular !== '2') normal(particular, total);
  if ([2, 20, 21, 22].includes(type)) normal(codeOf(raw.LedgerAccID), total);
  const payMode = codeOf(raw.PayModeAccID);
  if (legacyNumber(raw.PayModeAccID) > 0 && payMode && payMode !== '2') {
    push(payMode, isReceipt ? total : 0, isPayment ? -total : 0, true);
  }

  const component = (field, code, types) => {
    const amount = legacyNumber(raw[field]);
    if (amount !== 0 && types.includes(type)) normal(code, amount);
  };
  component('ShareAmt', '5', [5]);
  component('CDAmt', '6', [5]);
  component('SSAamt', '7', [5]);
  component('RLoanAmt', '8', [5]);
  component('DLoanAmt', '9', [5]);
  component('ShareAmt', '5', [14, 15]);
  component('CDAmt', '6', [14, 15]);
  component('SSAamt', '7', [14, 15, 1, 3]);
  component('RLoanAmt', '8', [14, 15, 1]);
  component('DLoanAmt', '9', [14, 15]);
  component('DLoanAmt', '9', [1]);
  component('AdmissionFee', '10', [5]);
  component('HomeLoan', '33', [12, 13]);
  component('VehicleLoan', '34', [12, 13]);
  component('GrainAdvance', '35', [12, 13]);
  return entries;
}

// Map of sourceDatabase -> [{ date, entries }], plus the cutover DB name.
// Archive tables are read-only, so this is cached like the party index.
async function loadLegacyLedgerEntries(ledgers = []) {
  const now = Date.now();
  if (legacyLedgerEntriesCache && (now - legacyLedgerEntriesLoadedAt) < LEGACY_LEDGER_CACHE_TTL_MS) {
    return legacyLedgerEntriesCache;
  }

  const codeByAccId = new Map();
  let cutoverDb = '';
  for (const ledger of ledgers) {
    const accId = ledger?.payload?.raw?.AccID;
    if (accId != null) codeByAccId.set(String(accId), cleanUpper(ledger.code));
    if (!cutoverDb && ledger?.payload?.sourceDatabase) cutoverDb = String(ledger.payload.sourceDatabase);
  }
  const cashLedger = ledgers.find((ledger) => cleanUpper(ledger.code) === '2');
  const cashAccId = cashLedger?.payload?.raw?.AccID != null ? String(cashLedger.payload.raw.AccID) : '';

  const database = await initializeDatabase();
  const result = await database.query(`SELECT "sourceDatabase", payload->'raw' AS raw FROM legacy_historical_vouchers`);
  const byDb = new Map();
  for (const row of result.rows) {
    const raw = row.raw || {};
    const list = byDb.get(row.sourceDatabase) || [];
    list.push({
      date: raw.VoucherDate ? String(raw.VoucherDate).slice(0, 10) : '',
      // Legacy Cash Book's Cash column = vouchers whose pay mode is Cash-In-Hand.
      isCash: Boolean(cashAccId) && String(raw.PayModeAccID) === cashAccId,
      entries: legacyLedgerEntries(raw, codeByAccId, cashAccId),
      // Voucher header fields the Day Book prints.
      voucher: {
        sourceDatabase: row.sourceDatabase,
        transNo: raw.TransNo != null ? String(raw.TransNo) : '',
        voucherNo: raw.VoucherNo != null ? String(raw.VoucherNo) : '',
        voucherType: cleanUpper(raw.VoucherType),
        transType: Number(raw.TransType),
        paymode: cleanText(raw.Paymode),
        chequeNo: cleanText(raw.ChequeNo),
        chequeDate: raw.ChequeDate ? String(raw.ChequeDate).slice(0, 10) : '',
        narration: cleanText(raw.Narration),
        particularAccId: raw.ParticularAccID != null ? String(raw.ParticularAccID) : '',
        total: legacyNumber(raw.TotalAmt)
      }
    });
    byDb.set(row.sourceDatabase, list);
  }

  legacyLedgerEntriesCache = { byDb, cutoverDb, cashCode: cashLedger ? cleanUpper(cashLedger.code) : '' };
  legacyLedgerEntriesLoadedAt = now;
  return legacyLedgerEntriesCache;
}

function fyStartYearOf(date = '') {
  const text = cleanText(date);
  const year = parseInt(text.slice(0, 4), 10);
  const month = parseInt(text.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return month >= 4 ? year : year - 1;
}

function legacyDbForFyStartYear(startYear) {
  return `JilaSahkariDB${deriveLegacySourceSuffix(`${startYear}-04-01`)}`;
}

function sumLegacyMovement(rows = [], include = () => true) {
  const totals = new Map();
  for (const row of rows) {
    if (!include(row)) continue;
    for (const { code, cr, dr } of row.entries) {
      const entry = totals.get(code) || { cr: 0, dr: 0 };
      entry.cr += cr;
      entry.dr += dr;
      totals.set(code, entry);
    }
  }
  return totals;
}

// Returns snapshot rows (same shape as ledgerSnapshotFromDocuments) for a
// closed legacy FY, or null when the window isn't one (current/cutover FY,
// or no archived data for that year) so the caller uses the live path.
// Legacy reports have no date filter at all — each FY is its own database —
// so a window covering the whole FY includes every row of that database,
// even ones whose VoucherDate is out of range; a partial window filters by
// VoucherDate.
async function getLegacyFyLedgerSnapshots({ dateFrom = '', periodEnd = '', ledgers = [] } = {}) {
  const startYear = fyStartYearOf(periodEnd || dateFrom);
  if (startYear == null) return null;

  const { byDb, cutoverDb } = await loadLegacyLedgerEntries(ledgers);
  const targetDb = legacyDbForFyStartYear(startYear);
  if (!cutoverDb || targetDb >= cutoverDb || !byDb.has(targetDb)) return null;

  // Opening for the target FY: walk back from the cutover FY's opening.
  const opening = new Map();
  for (const ledger of ledgers) {
    const code = cleanUpper(ledger.code);
    const resets = LEGACY_RESETTING_NATURES.has(cleanUpper(ledger.nature));
    opening.set(code, resets ? 0 : legacyNumber(ledger?.payload?.raw?.OpeningBal));
  }
  // "JilaSahkariDB2627" -> 2026.
  const cutoverStartYear = 2000 + parseInt(cutoverDb.slice(-4, -2), 10);
  for (let year = cutoverStartYear - 1; year >= startYear; year -= 1) {
    const movement = sumLegacyMovement(byDb.get(legacyDbForFyStartYear(year)) || []);
    for (const ledger of ledgers) {
      const code = cleanUpper(ledger.code);
      if (LEGACY_RESETTING_NATURES.has(cleanUpper(ledger.nature))) continue;
      const move = movement.get(code);
      if (move) opening.set(code, opening.get(code) - move.cr - move.dr);
    }
  }
  // The walk-back can't see profit appropriations legacy wrote straight into
  // a year's OpeningBal (no voucher), so the FY's own migrated OpeningBal
  // (payload.fyOpeningBal, see tools/legacy-migration extract) wins when present.
  const suffix = targetDb.slice(-4);
  for (const ledger of ledgers) {
    const own = ledger?.payload?.fyOpeningBal?.[suffix];
    if (own != null && Number.isFinite(Number(own))) opening.set(cleanUpper(ledger.code), Number(own));
  }

  const fyStart = `${startYear}-04-01`;
  const fyEnd = `${startYear + 1}-03-31`;
  const from = cleanText(dateFrom);
  const to = cleanText(periodEnd);
  const wholeYear = (!from || from <= fyStart) && (!to || to >= fyEnd);
  const rows = byDb.get(targetDb);
  const before = wholeYear ? new Map() : sumLegacyMovement(rows, (row) => row.date && from && row.date < from);
  const period = wholeYear
    ? sumLegacyMovement(rows)
    : sumLegacyMovement(rows, (row) => row.date && (!from || row.date >= from) && (!to || row.date <= to));

  const round = (value) => Number(value.toFixed(2));
  return ledgers.map((ledger) => {
    const code = cleanUpper(ledger.code);
    const pre = before.get(code) || { cr: 0, dr: 0 };
    const move = period.get(code) || { cr: 0, dr: 0 };
    const openingSigned = opening.get(code) + pre.cr + pre.dr;
    const closingSigned = openingSigned + move.cr + move.dr;
    return {
      id: String(ledger.id || ledger._id),
      code,
      // The name the ledger had in that FY's database (renamed since, e.g.
      // "CORPORATION BANK A/C NO. 01021060" is now "UNION BANK").
      name: cleanText(ledger?.payload?.fyAccountName?.[suffix]).replace(/\s+/g, ' ') || ledger.name,
      nature: cleanUpper(ledger.nature),
      group: cleanUpper(ledger.group),
      sortOrder: toNumber(ledger.sortOrder, 0),
      opening: round(Math.abs(openingSigned)),
      openingSide: openingSigned < 0 ? 'DR' : 'CR',
      totalDr: round(-move.dr),
      totalCr: round(move.cr),
      balance: round(Math.abs(closingSigned)),
      closing: round(Math.abs(closingSigned)),
      closingSide: closingSigned < 0 ? 'DR' : 'CR',
      signedBalance: round(closingSigned)
    };
  }).sort((a, b) => compareCodesNumerically(a.code, b.code));
}

// Ledger codes are numeric strings ("1", "10", "100"); without an explicit
// sort they come back in whatever order the cache happens to hold them,
// which reads as lexicographic ("1", "10", "100", "101", ..., "11") rather
// than the numeric order every report/list expects by default.
function compareCodesNumerically(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

async function getLedgerSnapshots({ dateFrom = '', dateTo = '', uptoDate = '', branchCode = '' } = {}) {
  const ledgers = (await Ledger.find({}).lean()).sort((a, b) => compareCodesNumerically(a.code, b.code));

  // A closed pre-cutover FY comes from the legacy archive. Ledgers aren't
  // branch-owned (society-wide GL), so this path isn't branch-filtered.
  const legacySnapshots = await getLegacyFyLedgerSnapshots({ dateFrom, periodEnd: dateTo || uptoDate, ledgers });
  if (legacySnapshots) return legacySnapshots;

  const branchFilter = {};
  if (branchCode) {
    branchFilter.branchCode = cleanUpper(branchCode);
  }

  const openingQuery = { ...branchFilter };
  const periodQuery = { ...branchFilter };
  const periodEnd = dateTo || uptoDate;

  if (dateFrom) {
    openingQuery.date = { $lt: dateFrom };
    periodQuery.date = { $gte: dateFrom };
    if (periodEnd) periodQuery.date.$lte = periodEnd;
  } else if (periodEnd) {
    periodQuery.date = { $lte: periodEnd };
  }

  const [openingVouchers, periodVouchers] = await Promise.all([
    dateFrom ? Voucher.find(openingQuery).lean() : Promise.resolve([]),
    Voucher.find(periodQuery).lean()
  ]);

  const openingVoucherIds = openingVouchers.map((v) => String(v.id || v._id));
  const periodVoucherIds = periodVouchers.map((v) => String(v.id || v._id));

  const [openingLines, journalLines] = await Promise.all([
    openingVoucherIds.length ? JournalLine.find({ voucherId: { $in: openingVoucherIds } }).lean() : Promise.resolve([]),
    periodVoucherIds.length ? JournalLine.find({ voucherId: { $in: periodVoucherIds } }).lean() : Promise.resolve([])
  ]);

  return ledgerSnapshotFromDocuments(ledgers, journalLines, openingLines);
}

// Transaction-level statement for a single ledger: an OPENING row (ledger's
// base opening balance plus all activity strictly before dateFrom) followed
// by one row per journal_line in [dateFrom, dateTo], with a running balance.
// Statement rows for a closed pre-cutover FY, from the legacy archive: the
// opening is the one Statement of Ledgers uses for that window (so the two
// reports agree), then one row per archived voucher touching the ledger.
// Returns Map(code -> rows), or null when the window isn't a legacy FY.
// Credit-positive signed balances, as getLegacyFyLedgerSnapshots.
async function buildLegacyLedgerStatements(ledgers, allLedgers, { dateFrom = '', dateTo = '' } = {}) {
  const snapshots = await getLegacyFyLedgerSnapshots({ dateFrom, periodEnd: dateTo, ledgers: allLedgers });
  if (!snapshots) return null;

  const { byDb } = await loadLegacyLedgerEntries(allLedgers);
  const startYear = fyStartYearOf(dateTo || dateFrom);
  const fyStart = `${startYear}-04-01`;
  const fyEnd = `${startYear + 1}-03-31`;
  const from = cleanText(dateFrom);
  const to = cleanText(dateTo);
  // Same window rule as the snapshot: a whole-FY window takes every row of
  // that FY's database, even ones dated outside it.
  const wholeYear = (!from || from <= fyStart) && (!to || to >= fyEnd);
  const inWindow = (row) => wholeYear || (row.date && (!from || row.date >= from) && (!to || row.date <= to));
  const legacyRows = (byDb.get(legacyDbForFyStartYear(startYear)) || []).filter(inWindow);

  const snapshotByCode = new Map(snapshots.map((row) => [row.code, row]));
  const wanted = new Set(ledgers.map((ledger) => cleanUpper(ledger.code)));
  const movesByCode = new Map();
  for (const row of legacyRows) {
    const net = new Map();
    for (const { code, cr, dr } of row.entries) {
      if (!wanted.has(code)) continue;
      const entry = net.get(code) || { cr: 0, dr: 0 };
      entry.cr += cr;
      entry.dr += dr;
      net.set(code, entry);
    }
    for (const [code, { cr, dr }] of net) {
      const list = movesByCode.get(code) || [];
      list.push({ row, credit: cr, debit: -dr });
      movesByCode.set(code, list);
    }
  }

  const round = (value) => Number(value.toFixed(2));
  const result = new Map();
  for (const ledger of ledgers) {
    const code = cleanUpper(ledger.code);
    const snap = snapshotByCode.get(code);
    let signed = snap ? (snap.openingSide === 'DR' ? -snap.opening : snap.opening) : 0;
    const rows = [{
      voucherNo: 'OPENING',
      voucherId: null,
      date: from || fyStart,
      debit: 0,
      credit: 0,
      balance: round(Math.abs(signed)),
      balanceSide: signed < 0 ? 'DR' : 'CR',
      narration: 'Opening Balance'
    }];
    const moves = (movesByCode.get(code) || []).sort((a, b) => (
      String(a.row.date).localeCompare(String(b.row.date))
      || compareCodesNumerically(a.row.voucher.voucherNo, b.row.voucher.voucherNo)
    ));
    for (const { row, credit, debit } of moves) {
      signed += credit - debit;
      rows.push({
        voucherNo: row.voucher.voucherNo,
        voucherId: null,
        date: row.date,
        debit: round(debit),
        credit: round(credit),
        balance: round(Math.abs(signed)),
        balanceSide: signed < 0 ? 'DR' : 'CR',
        narration: row.voucher.narration || ''
      });
    }
    result.set(code, rows);
  }
  return result;
}

// Statement of Account for every ledger (legacy's blank-Account print):
// alphabetical, and only ledgers with an opening balance or a movement in
// the window. Returns [{ ledgerCode, ledgerName, rows }].
async function buildAllLedgerStatements({ dateFrom = '', dateTo = '', branchCode = '' } = {}) {
  const allLedgers = await Ledger.find({}).lean();
  const ledgers = [...allLedgers].sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name), undefined, { sensitivity: 'base' }));
  const legacy = await buildLegacyLedgerStatements(ledgers, allLedgers, { dateFrom, dateTo });

  const statements = [];
  for (const ledger of ledgers) {
    const code = cleanUpper(ledger.code);
    const rows = legacy ? legacy.get(code) : await buildLedgerTransactionStatement(ledger, { dateFrom, dateTo, branchCode });
    const hasActivity = rows.length > 1 || Math.abs(Number(rows[0]?.balance || 0)) >= 0.005;
    if (hasActivity) statements.push({ ledgerCode: code, ledgerName: ledger.name, rows });
  }
  return statements;
}

async function buildLedgerTransactionStatement(ledger, { dateFrom = '', dateTo = '', branchCode = '' } = {}) {
  // A closed pre-cutover FY has no journal lines; its vouchers are archived.
  const allLedgers = await Ledger.find({}).lean();
  const legacy = await buildLegacyLedgerStatements([ledger], allLedgers, { dateFrom, dateTo });
  if (legacy) return legacy.get(cleanUpper(ledger.code)) || [];

  const ledgerId = String(ledger.id || ledger._id);
  const allLines = await JournalLine.find({ ledgerId }).lean();
  const relevantLines = branchCode
    ? allLines.filter((line) => cleanUpper(line.branchId) === cleanUpper(branchCode))
    : allLines;

  const voucherIds = [...new Set(relevantLines.map((line) => String(line.voucherId)))];
  const vouchers = voucherIds.length ? await Voucher.find({ id: { $in: voucherIds } }).lean() : [];
  const voucherById = new Map(vouchers.map((v) => [String(v.id || v._id), v]));

  const enriched = relevantLines
    .map((line) => ({ line, voucher: voucherById.get(String(line.voucherId)) }))
    .filter((entry) => entry.voucher)
    .sort((a, b) => {
      const dateCompare = String(a.voucher.date).localeCompare(String(b.voucher.date));
      if (dateCompare !== 0) return dateCompare;
      return toNumber(a.line.postingOrder, 0) - toNumber(b.line.postingOrder, 0);
    });

  const balanceSide = cleanUpper(ledger.balanceSide || 'DR');
  const openingAmount = toNumber(ledger.openingBalance, 0);
  let debitTotal = balanceSide === 'DR' ? openingAmount : 0;
  let creditTotal = balanceSide === 'CR' ? openingAmount : 0;

  const beforeRange = dateFrom ? enriched.filter((entry) => String(entry.voucher.date) < dateFrom) : [];
  for (const { line } of beforeRange) {
    debitTotal += toNumber(line.debitAmount, 0);
    creditTotal += toNumber(line.creditAmount, 0);
  }

  const rows = [{
    voucherNo: 'OPENING',
    voucherId: null,
    date: dateFrom || (enriched[0]?.voucher.date || ''),
    debit: 0,
    credit: 0,
    balance: Number(Math.abs(debitTotal - creditTotal).toFixed(2)),
    balanceSide: debitTotal >= creditTotal ? 'DR' : 'CR',
    narration: 'Opening Balance'
  }];

  const inRange = enriched.filter((entry) => {
    const d = String(entry.voucher.date);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  for (const { line, voucher } of inRange) {
    const debit = toNumber(line.debitAmount, 0);
    const credit = toNumber(line.creditAmount, 0);
    debitTotal += debit;
    creditTotal += credit;
    rows.push({
      voucherNo: voucher.voucherNo,
      voucherId: String(voucher.id || voucher._id),
      date: voucher.date,
      debit,
      credit,
      balance: Number(Math.abs(debitTotal - creditTotal).toFixed(2)),
      balanceSide: debitTotal >= creditTotal ? 'DR' : 'CR',
      narration: voucher.narration || line.description || ''
    });
  }

  return rows;
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
    DemandList.countDocuments(branchCode ? { branchCode } : {}),
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
    recentVouchers: vouchers.map((voucher) => sanitizeVoucherResponse(voucher)),
    recentBankTransactions: bankTransactions.map((transaction) => toResponse(transaction))
  };
}

// The transaction-side employee picker (advance-paid-emp/advance-recovery-emp
// vouchers) must source from the real Employee HR table — journal_lines and
// reports (buildEmployeeAccountStatement/buildEmployeeLedgerReport) are keyed
// off employees.code, not users.code. Sourcing this list from `users` (as it
// used to, via listResource('employees', ...)) meant a voucher posted through
// this picker could never be found by its own employee's ledger/statement report.
async function listEmployeesForLookup(user = {}) {
  const query = applyBranchScope({}, 'employees', user);
  const rows = await Employee.find(query).sort({ updatedAt: -1 }).lean();
  return rows.map((row) => toResponse(row));
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
      listEmployeesForLookup(user),
      listResource('ledgers'),
      listResource('rates'),
      listResource('bankAccounts'),
      listResource('demandLists', '', user),
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
// Legacy EntTrans TransType -> modern transaction catalog item, per
// docs/legacy-modern-transaction-map.md. `partyKind` says which entity table
// (member/employee/ledger) the row's `ParticularAccID` resolves against;
// TransType 5 (Recovery) never carries a usable ParticularAccID (legacy left
// it as "0") so its party is instead resolved via legacy_historical_recovery,
// joined on (sourceDatabase, TransNo) — see docs' "EntTransData required" note.
const LEGACY_VOUCHER_CATALOG_MAP = {
  '1': { section: 'member', item: 'loan-paid-member', partyKind: 'member' },
  '2': { section: 'member', item: 'deposit-paid-member', partyKind: 'member' },
  '3': { section: 'member', item: 'ssa-paid-member', partyKind: 'member' },
  '4': { section: 'member', item: 'insurance-paid-member', partyKind: 'member' },
  '5': { section: 'member', item: 'recovery-member', partyKind: 'member', viaRecoveryLink: true },
  '6': { section: 'bank', item: 'loan-recv-cash', partyKind: 'ledger' },
  '7': { section: 'bank', item: 'loan-recv-saving', partyKind: 'ledger' },
  '8': { section: 'bank', item: 'deposit-in-bank', partyKind: 'ledger' },
  '9': { section: 'bank', item: 'cheque-issue-saving', partyKind: 'ledger' },
  '10': { section: 'bank', item: 'transfer-saving', partyKind: 'ledger' },
  '11': { section: 'bank', item: 'transfer-cashcredit', partyKind: 'ledger' },
  '12': { section: 'employee', item: 'advance-paid-emp', partyKind: 'employee' },
  '13': { section: 'employee', item: 'advance-recovery-emp', partyKind: 'employee' },
  '14': { section: 'transfer-voucher', item: 'transfer-voucher-paid', partyKind: 'member' },
  '15': { section: 'transfer-voucher', item: 'transfer-voucher-recover', partyKind: 'member' },
  '16': { section: 'transfer-voucher', item: 'transfer-voucher-payment', partyKind: 'ledger' },
  '17': { section: 'transfer-voucher', item: 'transfer-voucher-receipt', partyKind: 'ledger' },
  '18': { section: 'other', item: 'payment-voucher', partyKind: 'ledger' },
  '19': { section: 'other', item: 'receipt-voucher', partyKind: 'ledger' },
  '20': { section: 'interest', item: 'interest-paid-member', partyKind: 'member' },
  '21': { section: 'interest', item: 'interest-recv-member', partyKind: 'member' },
  '22': { section: 'interest', item: 'interest-recv-employee', partyKind: 'employee' }
};

function findCatalogItem(sectionKey, itemKey) {
  const section = TRANSACTION_CATALOG.find((entry) => entry.key === sectionKey);
  return section?.items?.find((item) => item.key === itemKey) || null;
}

// legacy_historical_vouchers/_recovery are large, read-only archive tables
// (one row per migrated legacy transaction) — the party crosswalk they need
// (AccID -> member/employee/ledger code) is cheap to hold in memory and
// barely changes, so it's cached for a few minutes instead of rebuilt per request.
let legacyPartyIndexCache = null;
let legacyPartyIndexLoadedAt = 0;
const LEGACY_PARTY_INDEX_TTL_MS = 5 * 60 * 1000;

async function loadLegacyPartyIndex(database) {
  const now = Date.now();
  if (legacyPartyIndexCache && (now - legacyPartyIndexLoadedAt) < LEGACY_PARTY_INDEX_TTL_MS) {
    return legacyPartyIndexCache;
  }

  const [membersResult, employeesResult, ledgersResult, recoveryResult] = await Promise.all([
    database.query(`SELECT code, name, "branchCode", payload->'raw'->>'AccID' AS accid FROM members WHERE payload->'raw'->>'AccID' IS NOT NULL`),
    database.query(`SELECT code, name, "branchCode", payload->'raw'->>'AccID' AS accid FROM employees WHERE payload->'raw'->>'AccID' IS NOT NULL`),
    database.query(`SELECT code, name, payload->'raw'->>'AccID' AS accid FROM ledgers WHERE payload->'raw'->>'AccID' IS NOT NULL`),
    database.query(`SELECT DISTINCT ON ("sourceDatabase", payload->'raw'->>'TransNo') "sourceDatabase" AS source_db, payload->'raw'->>'TransNo' AS trans_no, "memberCode" FROM legacy_historical_recovery ORDER BY "sourceDatabase", payload->'raw'->>'TransNo'`)
  ]);

  const byKindAccId = new Map();
  const memberByCode = new Map();

  for (const row of membersResult.rows) {
    const party = { code: row.code, label: row.name, branchCode: row.branchCode || '' };
    byKindAccId.set(`member:${row.accid}`, party);
    memberByCode.set(row.code, party);
  }
  for (const row of employeesResult.rows) {
    byKindAccId.set(`employee:${row.accid}`, { code: row.code, label: row.name, branchCode: row.branchCode || '' });
  }
  for (const row of ledgersResult.rows) {
    byKindAccId.set(`ledger:${row.accid}`, { code: row.code, label: row.name, branchCode: '' });
  }

  const recoveryPartyByKey = new Map();
  for (const row of recoveryResult.rows) {
    const party = memberByCode.get(row.memberCode);
    if (party) {
      recoveryPartyByKey.set(`${row.source_db}:${row.trans_no}`, party);
    }
  }

  legacyPartyIndexCache = { byKindAccId, recoveryPartyByKey };
  legacyPartyIndexLoadedAt = now;
  return legacyPartyIndexCache;
}

// legacy_historical_vouchers.date is the migration run's timestamp, not the
// real transaction date (the real date lives in payload.raw.VoucherDate and
// is inconsistent — some rows are flagged "[OUT_OF_FY_DATE]"). The reliable
// signal for "which FY is this" is the source SQL-Server-per-FY database name
// itself (e.g. "JilaSahkariDB2425" for FY 2024-25), so the FY switcher in the
// header is honored by matching its year suffix instead of a date range.
function deriveLegacySourceSuffix(dateFromStr) {
  const startYear = parseInt(String(dateFromStr || '').slice(0, 4), 10);
  if (!Number.isFinite(startYear)) return null;
  const startShort = String(startYear).slice(-2).padStart(2, '0');
  const endShort = String(startYear + 1).slice(-2).padStart(2, '0');
  return `${startShort}${endShort}`;
}

// Shared by buildHistoricalVoucherRows (list) and getHistoricalVoucherById
// (single-record detail lookup) so both stay in sync with the category map.
// Returns null when the row's category has no catalog mapping, or when a
// branch-scoped caller isn't allowed to see it.
function mapLegacyVoucherRow(row, partyIndex, { branchCode, partyTypeFilter } = {}) {
  const map = LEGACY_VOUCHER_CATALOG_MAP[String(row.voucherCategory)];
  if (!map) return null;
  if (partyTypeFilter && partyTypeFilter !== map.partyKind) return null;

  const catalogItem = findCatalogItem(map.section, map.item);
  if (!catalogItem) return null;

  const raw = row.payload?.raw || {};
  const party = map.viaRecoveryLink
    ? partyIndex.recoveryPartyByKey.get(`${row.sourceDatabase}:${raw.TransNo}`) || null
    : partyIndex.byKindAccId.get(`${map.partyKind}:${raw.ParticularAccID}`) || null;

  // Ledgers aren't branch-owned, so bank/other-ledger rows stay visible to
  // every branch; member/employee rows are hidden from other branches.
  if (branchCode && map.partyKind !== 'ledger') {
    if (!party || party.branchCode !== branchCode) return null;
  }

  const voucherDate = raw.VoucherDate ? String(raw.VoucherDate).slice(0, 10) : null;

  return {
    id: `legacy:${row.id}`,
    voucherNo: `LGCY-${row.voucherNo}`,
    date: voucherDate,
    voucherCategory: catalogItem.label,
    transactionType: catalogItem.transactionType,
    partyCode: party?.code || '',
    partyLabel: party?.label || '',
    partyType: map.partyKind,
    branchCode: party?.branchCode || '',
    amount: Number(row.amount || raw.TotalAmt || 0),
    mode: raw.Paymode || '',
    narration: row.narration || raw.Narration || '',
    details: {
      key: catalogItem.key,
      isHistorical: true,
      legacySourceDatabase: row.sourceDatabase,
      legacyVoucherNo: row.voucherNo
    },
    status: 'Historical',
    isHistorical: true
  };
}

async function buildHistoricalVoucherRows(filter = {}) {
  const suffix = deriveLegacySourceSuffix(filter.dateFrom);
  if (!suffix) return [];

  const database = await initializeDatabase();
  const result = await database.query(
    `SELECT id, "voucherNo", "voucherCategory", amount, narration, "sourceDatabase", payload
     FROM legacy_historical_vouchers
     WHERE right("sourceDatabase", 4) = $1`,
    [suffix]
  );
  if (!result.rows.length) return [];

  const partyIndex = await loadLegacyPartyIndex(database);
  const branchCode = resolveBranchCode(filter.user, filter.branchCode);
  const partyTypeFilter = filter.partyType ? cleanText(filter.partyType) : '';

  const rows = [];
  for (const row of result.rows) {
    const mapped = mapLegacyVoucherRow(row, partyIndex, { branchCode, partyTypeFilter });
    if (mapped) rows.push(mapped);
  }

  return rows;
}

async function getHistoricalVoucherById(legacyId, user = {}) {
  const database = await initializeDatabase();
  const result = await database.query(
    `SELECT id, "voucherNo", "voucherCategory", amount, narration, "sourceDatabase", payload
     FROM legacy_historical_vouchers
     WHERE id = $1`,
    [legacyId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const partyIndex = await loadLegacyPartyIndex(database);
  const branchCode = resolveBranchCode(user);
  return mapLegacyVoucherRow(row, partyIndex, { branchCode });
}

async function buildVoucherRows(filter = {}) {
  const query = {};
  if (filter.search) {
    Object.assign(query, buildSearchQuery(RESOURCE_DEFS.vouchers.searchFields, filter.search));
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
  const liveRows = vouchers.map((voucher) => sanitizeVoucherResponse(voucher));
  const historicalRows = await buildHistoricalVoucherRows(filter);

  return [...liveRows, ...historicalRows].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
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
function getPartyMemberCode(voucher) {
  if (cleanLower(voucher.partyType) === 'member') {
    return cleanUpper(voucher.partyCode);
  }
  return '';
}
// Legacy loan/CD/SSA payments (TransType 1/2/3) carry the member's AccID
// directly on the voucher; Recovery (TransType 5) never does (legacy left it
// "0"), so its component amounts + date come from legacy_historical_recovery
// joined back to its parent voucher via (sourceDatabase, TransNo) — same
// crosswalk used for the transaction list/detail views.
async function getHistoricalMemberLedgerRows(member) {
  return (await getHistoricalMemberLedgerRowsBatch([member])).get(member.code) || [];
}

async function buildMemberLedgerReport({ memberCode, dateFrom = '', dateTo = '', user = {} } = {}) {
  const member = await Member.findOne({ code: cleanUpper(memberCode) }).lean();
  if (!member || !canAccessBranchRecord('members', member, user)) {
    return null;
  }

  // Not filtered by the member's branch: access is checked on the member
  // above, and a voucher only counts when it is this member's (party or a
  // recovery line). A Recovery From Member voucher carries lines for members
  // of many branches, so filtering by branch hid a member's recoveries.
  const query = {};
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = cleanText(dateFrom);
    if (dateTo) query.date.$lte = cleanText(dateTo);
  }

  const vouchers = await Voucher.find(query).sort({ date: 1, createdAt: 1 }).lean();
  const voucherIds = vouchers.map((v) => String(v._id || v.id));
  const voucherNos = vouchers.map((v) => v.voucherNo).filter(Boolean);
  
  const recoveryLinesAll = await RecoveryLine.find({ 
    memberCode: member.code, 
    $or: [{ voucherId: { $in: voucherIds } }, { voucherNo: { $in: voucherNos } }]
  }).lean();
  
  const balancesObj = typeof member.balances === 'string' ? JSON.parse(member.balances || '{}') : (member.balances || {});
  
  let shareBal = toPaise(balancesObj.share || 0);
  let specialDepositBal = toPaise(balancesObj.specialDeposit || balancesObj.ssa || 0);
  let cdBal = toPaise(balancesObj.compulsoryDeposit || balancesObj.cd || 0);
  let loanBal = toPaise(member.loanOutstanding || balancesObj.loanOutstanding || balancesObj.loan || balancesObj.regularLoan || 0);
  let ladBal = toPaise(member.loanAgainstDeposit || balancesObj.loanAgainstDeposit || balancesObj.lad || 0);

  let allRows = [];

  for (const voucher of vouchers) {
    const voucherMember = getPartyMemberCode(voucher);
    const isPartyMatch = voucherMember && voucherMember === member.code;
    const vId = String(voucher._id || voucher.id);
    const lineMatch = recoveryLinesAll.find((line) => line.voucherId === vId || (!line.voucherId && line.voucherNo === voucher.voucherNo));

    if (!isPartyMatch && !lineMatch) {
      continue;
    }

    const row = {
      voucherNo: voucher.voucherNo,
      date: voucher.date,
      share: { credit: 0, debit: 0, balance: 0 },
      specialDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
      compulsoryDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
      loan: { credit: 0, debit: 0, balance: 0, interest: 0 },
      loanAgainstDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
      isOpening: false,
      narration: voucher.narration || voucher.details?.narration || ''
    };

    if (lineMatch) {
      row.share.credit = toPaise(lineMatch.share);
      row.specialDeposit.credit = toPaise(lineMatch.specialDeposit || lineMatch.ssa);
      row.compulsoryDeposit.credit = toPaise(lineMatch.compulsoryDeposit);
      row.loan.credit = toPaise(lineMatch.regularLoan);
      row.loanAgainstDeposit.credit = toPaise(lineMatch.loanAgainstDeposit || lineMatch.depositLoan);
    } else {
      const components = voucher.details?.components || {};
      const key = voucher.details?.key || '';
      
      if (key === 'loan-paid-member') {
        row.loan.debit = toPaise(components.loanAmt);
        row.loanAgainstDeposit.debit = toPaise(components.lad);
      } else if (key === 'deposit-paid-member') {
        row.compulsoryDeposit.debit = toPaise(components.cd || voucher.amount);
      } else if (key === 'ssa-paid-member') {
        row.specialDeposit.debit = toPaise(components.specialDeposit || components.ssa || voucher.amount);
      } else if (key === 'share-paid-member') {
        row.share.debit = toPaise(components.share || voucher.amount);
      } else if (cleanLower(voucher.accent) === 'pink' || cleanLower(voucher.transactionType) === 'payment') {
        row.loan.debit = toPaise(voucher.amount);
      } else {
        row.loan.credit = toPaise(voucher.amount);
      }
    }

    allRows.push(row);
  }

  // Historical (pre-cutover) rows merge in here too. `member.balances` is the
  // reconciled CUTOVER SNAPSHOT — the balance AFTER every historical row and
  // BEFORE any live one — so it sits in the middle of this combined timeline,
  // not at the start. That means live rows can be applied forward from it as
  // before, but historical rows must be applied BACKWARD from it (undo each
  // row's effect walking from latest to earliest) to get the correct running
  // balance shown after each one; walking forward from the final balance
  // would double-count everything that already happened before cutover.
  const historicalRows = await getHistoricalMemberLedgerRows(member);
  allRows = historicalRows.concat(allRows);
  allRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Anchors are member.balances as migrated: signed credit-positive, so a
  // loan owed is negative and a repayment (credit) moves it toward zero.
  // Undoing a row is therefore the same for every bucket. (member.loanOutstanding
  // is Loan + D.Loan combined, so it can't anchor the Loan column alone.)
  const BALANCE_GROUPS = [
    { key: 'share', sign: 1, fallback: toPaise(balancesObj.share || 0) },
    { key: 'specialDeposit', sign: 1, fallback: toPaise(balancesObj.specialDeposit || balancesObj.ssa || 0) },
    { key: 'compulsoryDeposit', sign: 1, fallback: toPaise(balancesObj.compulsoryDeposit || balancesObj.cd || 0) },
    { key: 'loan', sign: -1, fallback: toPaise(balancesObj.loan || balancesObj.regularLoan || 0) },
    { key: 'loanAgainstDeposit', sign: -1, fallback: toPaise(balancesObj.loanAgainstDeposit || balancesObj.lad || 0) }
  ];
  for (const { key, fallback } of BALANCE_GROUPS) {
    let running = fallback;
    for (let i = allRows.length - 1; i >= 0; i -= 1) {
      const row = allRows[i];
      row[key].signed = running;
      row[key].balance = Math.abs(running);
      running -= row[key].credit - row[key].debit;
    }
  }

  // Per-transaction interest, as the legacy printout computes it (see
  // accrueMemberLedgerInterest). Each day accrues at the rate in force on that
  // day, so a later rate change leaves earlier spans alone.
  const rateTimelines = await getInterestRateTimelines(MEMBER_INTEREST_HEADS);
  accrueMemberLedgerInterest(allRows, rateTimelines, cleanText(dateTo));

  const fromDateStr = cleanText(dateFrom);
  const toDateStr = cleanText(dateTo);
  // That FY's legacy master row (designation etc. as legacy printed them).
  let memberExtras = {};
  const visibleRows = allRows.filter((r) => isInMemberWindow(r, fromDateStr, toDateStr));
  // The row immediately before visibleRows[0] in the FULL merged timeline —
  // not just "before fromDateStr" — carries the true balance the visible
  // window opens with, consistent with the backward computation above.
  const firstVisibleIndex = visibleRows.length ? allRows.indexOf(visibleRows[0]) : -1;

  const openingRow = {
    voucherNo: 'OPENING',
    date: fromDateStr || (visibleRows.length > 0 ? visibleRows[0].date : ''),
    isOpening: true
  };
  for (const { key, sign, fallback } of BALANCE_GROUPS) {
    let balance;
    if (firstVisibleIndex > 0) {
      balance = allRows[firstVisibleIndex - 1][key].balance;
    } else if (firstVisibleIndex === 0) {
      const first = visibleRows[0][key];
      balance = Math.abs(first.signed - (first.credit - first.debit));
    } else {
      balance = Math.abs(fallback);
    }
    // On the opening row, a Cr-nature balance (Share/Special Deposit/
    // Compulsory Deposit) is shown as an opening Credit equal to the balance
    // itself, matching the legacy printout. Loan/LoanAgainstDeposit are
    // Dr-nature and the legacy printout leaves their opening Credit/Debit
    // blank (balance-only), so that's left untouched here.
    // Loan/LoanAgainstDeposit (Dr-nature) show it as an opening Debit, as the
    // legacy printout does, so TOTAL Credit/Debit include the opening.
    openingRow[key] = { credit: sign > 0 ? balance : 0, debit: sign < 0 ? balance : 0, balance, interest: 0 };
  }

  // A full FY legacy has closed: make each bucket's FY interest equal
  // legacy's own MbrCBlnc figure, which the desktop app computed and the
  // archive keeps. The rules above reproduce it exactly for most members; the
  // rest differ by a rupee of rounding, by legacy closing a year late (FY
  // 2025-26 accrued ~16 days into April) or by a member legacy paid no
  // interest. The difference goes on the bucket's last movement, where legacy
  // puts its year-end interest; a legacy total of 0 clears the bucket.
  if (fromDateStr && toDateStr === fyEndOf(fromDateStr) && fromDateStr === fyStartOf(fromDateStr)) {
    const legacyFy = await getLegacyFyAccountRows('member', [member.code], fromDateStr);
    const legacyInterest = legacyFy.closed ? legacyFy.rows.get(member.code)?.MbrCBlnc : null;
    if (legacyInterest) {
      const fields = { specialDeposit: 'MSSAIntr', compulsoryDeposit: 'MContryIntr', loan: 'MRLoanIntr', loanAgainstDeposit: 'MDLoanIntr' };
      for (const [key, field] of Object.entries(fields)) {
        const target = toPaise(legacyInterest[field] || 0);
        const movers = visibleRows.filter((r) => r[key].credit || r[key].debit);
        if (!target) {
          movers.forEach((r) => { r[key].interest = 0; });
          continue;
        }
        const last = movers[movers.length - 1];
        if (last) last[key].interest += target - movers.reduce((total, r) => total + (r[key].interest || 0), 0);
      }
      memberExtras = legacyFy.rows.get(member.code) || {};
    }
  }

  let finalRows = [openingRow].concat(visibleRows);

  finalRows = finalRows.map((row) => ({
    ...row,
    share: { credit: toRupees(row.share.credit), debit: toRupees(row.share.debit), balance: toRupees(row.share.balance) },
    specialDeposit: { credit: toRupees(row.specialDeposit.credit), debit: toRupees(row.specialDeposit.debit), balance: toRupees(row.specialDeposit.balance), interest: toRupees(row.specialDeposit.interest || 0) },
    compulsoryDeposit: { credit: toRupees(row.compulsoryDeposit.credit), debit: toRupees(row.compulsoryDeposit.debit), balance: toRupees(row.compulsoryDeposit.balance), interest: toRupees(row.compulsoryDeposit.interest || 0) },
    loan: { credit: toRupees(row.loan.credit), debit: toRupees(row.loan.debit), balance: toRupees(row.loan.balance), interest: toRupees(row.loan.interest || 0) },
    loanAgainstDeposit: { credit: toRupees(row.loanAgainstDeposit.credit), debit: toRupees(row.loanAgainstDeposit.debit), balance: toRupees(row.loanAgainstDeposit.balance), interest: toRupees(row.loanAgainstDeposit.interest || 0) },
  }));

  if (!memberExtras.Designation && fromDateStr) {
    memberExtras = (await getLegacyFyAccountRows('member', [member.code], fromDateStr)).rows.get(member.code) || {};
  }
  // Contact fields the migration left in the legacy master row only.
  const raw = member.payload?.raw || {};
  const branch = member.branchCode ? await Branch.findOne({ code: member.branchCode }).lean() : null;
  const memberResponse = {
    ...toResponse(member),
    fatherOrHusbandName: member.fatherOrHusbandName || cleanText(memberExtras.FathersName || raw.FathersName),
    designation: member.designation || cleanText(memberExtras.Designation || raw.Designation),
    pfNo: member.pfNo || cleanText(raw.PFNo),
    mobileNo: cleanText(raw.MobileNo) || member.mobileNo || '',
    postedBranch: cleanText(memberExtras.PostedBranch || raw.PostedBranch) || branch?.place || branch?.label || member.branchCode || ''
  };

  return {
    member: memberResponse,
    asOnDate: toDateStr,
    balances: {
      share: Math.abs(shareBal / 100),
      compulsoryDeposit: Math.abs(cdBal / 100),
      specialSaving: Math.abs(specialDepositBal / 100),
      providentFund: toNumber(member.balances?.providentFund, 0),
      loanAgainstDeposit: Math.abs(ladBal / 100),
      insurancePremium: toNumber(member.balances?.insurancePremium, 0),
      loanOutstanding: Math.abs(loanBal / 100),
      cdInterest: toNumber(member.balances?.cdInterest, 0),
      ssaInterest: toNumber(member.balances?.ssaInterest, 0),
      regularLoanInterest: toNumber(member.balances?.regularLoanInterest, 0),
      ladInterest: toNumber(member.balances?.ladInterest, 0)
    },
    rows: finalRows
  };
}
async function buildAccountStatementReport({ type = 'ledger', ledgerId = '', memberId = '', employeeId = '', dateFrom = '', dateTo = '', uptoDate = '', search = '', nature = '', user = {} } = {}) {
  const branchCode = resolveBranchCode(user);
  
  if (type === 'member') {
    const targetMember = memberId || ledgerId;
    if (targetMember) return await buildMemberAccountStatement({ memberId: targetMember, dateFrom, dateTo, user });
    return await buildMemberAccountStatementList({ branchCode, search, dateFrom, dateTo, user });
  }
  if (type === 'employee') {
    const targetEmployee = employeeId || ledgerId;
    if (targetEmployee) return await buildEmployeeAccountStatement({ employeeId: targetEmployee, dateFrom, dateTo, user });
    return await buildEmployeeAccountStatementList({ branchCode, search, dateFrom, dateTo, user });
  }
  if (type === 'members-opening-balance') {
    return await buildMembersOpeningBalanceReport({ branchCode, dateFrom, user });
  }
  if (type === 'members-closing-balance') {
    return await buildMembersClosingBalanceReport({ branchCode, dateFrom, dateTo, user });
  }
  if (type === 'statement-of-member-ledger') {
    return await buildStatementOfMemberLedgerReport({ dateFrom, dateTo, user });
  }
  if (type === 'ledger-statements') {
    return await buildAllLedgerStatements({ dateFrom, dateTo, branchCode });
  }

  if (ledgerId) {
    const ledger = (await Ledger.findById(ledgerId).lean()) || (await Ledger.findOne({ code: cleanUpper(ledgerId) }).lean());
    if (!ledger) return [];
    return buildLedgerTransactionStatement(ledger, { dateFrom, dateTo, branchCode });
  }

  const snapshots = await getLedgerSnapshots({ dateFrom, dateTo, uptoDate, branchCode });
  const filtered = snapshots.filter((row) => {
    const matchesNature = !nature || cleanUpper(row.nature) === cleanUpper(nature);
    const matchesSearch = !search || [row.code, row.name, row.group].some((value) => cleanLower(value).includes(cleanLower(search)));
    return matchesNature && matchesSearch;
  });

  return filtered.map((row) => ({
    ledgerCode: row.code,
    ledgerName: row.name,
    nature: row.nature,
    openingBalance: row.opening,
    openingSide: row.openingSide,
    totalCr: row.totalCr,
    totalDr: row.totalDr,
    balance: row.closing,
    balanceSide: row.closingSide
  }));
}

// Account Statement View's MEMBER type: one row per member (the grid view,
// not the single-member drill-down buildMemberAccountStatement above), with
// the full legacy column set (Share/CD/SSA/Loan/DLoan + their interest,
// Premium, Dismembered), mirroring legacy's VwMemberBalance. Balances are as at
// the end of the selected FY from the shared member balance walk, signed
// credit-positive like legacy (a loan owed is negative).
// Interest: for a FY legacy has closed, legacy's own figure (MbrCBlnc, which
// the desktop app computed — not reproducible from SQL) from the openings
// archive, so it matches legacy to the rupee; for the open FY, our accrual.
// Share interest and Premium have no transaction history to walk, so those
// two still come from the migrated snapshot.
async function buildMemberAccountStatementList({ branchCode = '', search = '', dateFrom = '', dateTo = '', user = {} } = {}) {
  const members = await findMembersForReport({ branchCode, search, user });
  const [periods, branches, legacyFy] = await Promise.all([
    computeMemberPeriodBalances({ members, dateFrom, dateTo, user }),
    Branch.find({}).lean(),
    getLegacyFyAccountRows('member', members.map((m) => m.code), dateFrom)
  ]);
  const branchByCode = new Map(branches.map((b) => [cleanUpper(b.code), b]));
  // Newest members first: highest member code at the top.
  const byCodeDesc = [...periods].sort((a, b) => String(b.member.code || '').localeCompare(String(a.member.code || ''), undefined, { numeric: true }));

  return byCodeDesc.map(({ member: row, buckets }) => {
    const b = typeof row.balances === 'string' ? JSON.parse(row.balances || '{}') : (row.balances || {});
    const branch = branchByCode.get(cleanUpper(row.branchCode)) || {};
    const raw = row.payload?.raw || {};
    const fyRaw = legacyFy.rows.get(row.code) || {};
    const legacyInterest = legacyFy.closed ? fyRaw.MbrCBlnc : null;
    const interest = (bucket, legacyField) => (legacyInterest
      ? toNumber(legacyInterest[legacyField], 0)
      : toRupees(buckets[bucket].interest));
    return {
      memberCode: row.code,
      memberName: row.name,
      branchCode: row.branchCode || '',
      branchName: branch.label || branch.place || row.branchCode || '',
      // Legacy's PostedBranch is the member's own free-text posting (e.g.
      // HATHBAND), not the branch master's name.
      postedBranch: cleanText(fyRaw.PostedBranch || raw.PostedBranch) || branch.label || branch.place || '',
      designation: row.designation || cleanText(fyRaw.Designation || raw.Designation),
      fhName: row.fatherOrHusbandName || cleanText(fyRaw.FathersName || raw.FathersName),
      share: toRupees(buckets.share.closing),
      shareInt: toNumber(b.shareInterest, 0),
      cdAmt: toRupees(buckets.compulsoryDeposit.closing),
      cdInt: interest('compulsoryDeposit', 'MContryIntr'),
      ssa: toRupees(buckets.specialDeposit.closing),
      ssaInt: interest('specialDeposit', 'MSSAIntr'),
      loan: toRupees(buckets.loan.closing),
      loanInt: interest('loan', 'MRLoanIntr'),
      dloan: toRupees(buckets.loanAgainstDeposit.closing),
      dloanInt: interest('loanAgainstDeposit', 'MDLoanIntr'),
      premium: toNumber(b.insurancePremium, 0),
      dismembered: !!row.dismembered
    };
  });
}

// Account Statement View's EMPLOYEE type, mirroring legacy's VwEmployeeBalance:
// closing balances as at the end of the selected FY, signed credit-positive (a
// loan owed is negative). Like members, legacy rolls each FY's interest into
// the next FY's employee opening with no voucher, so a walk across FY
// boundaries drifts; for a FY legacy holds, the closing is that FY's archived
// legacy opening plus the FY's own movements from the employee ledger walk
// (otherwise the walk alone). Interest is legacy's
// own EmpCBlnc figure for that FY, shown negated as VwEmployeeBalance does
// (interest due on a loan is a debit). Falls back to the migrated snapshot
// when the FY was never in legacy.
async function buildEmployeeAccountStatementList({ branchCode = '', search = '', dateFrom = '', dateTo = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const query = effectiveBranchCode ? { branchCode: effectiveBranchCode } : {};
  const rows = (await Employee.find(query).lean())
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true }));

  const filtered = search
    ? rows.filter((row) => [row.code, row.name].some((value) => cleanLower(value).includes(cleanLower(search))))
    : rows;

  const legacyFy = await getLegacyFyAccountRows('employee', filtered.map((row) => row.code), dateFrom);
  const ledgers = await Promise.all(filtered.map((row) => buildEmployeeLedgerReport({ employeeCode: row.code, dateFrom, dateTo, user })));

  return filtered.map((row, index) => {
    const raw = row.payload?.raw || {};
    const fyRaw = legacyFy.rows.get(row.code) || {};
    const ledger = ledgers[index] || {};
    const closing = (key) => {
      const walked = toNumber(ledger.signedBalances?.[key], 0);
      if (!fyRaw.opening) return walked;
      return Number((fyRaw.opening[key] + walked - toNumber(ledger.signedOpening?.[key], 0)).toFixed(2));
    };
    const legacyInterest = fyRaw.EmpCBlnc;
    return {
      employeeCode: row.code,
      employeeName: row.name,
      branchCode: row.branchCode || '',
      designation: row.designation || cleanText(fyRaw.Designation || raw.Designation),
      fhName: row.fatherName || cleanText(fyRaw.FathersName || raw.FathersName),
      housingLoan: closing('housingLoan'),
      housingLoanInt: -toNumber(legacyInterest ? legacyInterest.HLoanIntr : row.homeLoanInterest, 0),
      vehicleLoan: closing('vehicleLoan'),
      vehicleLoanInt: -toNumber(legacyInterest ? legacyInterest.VLoanIntr : row.vehicleLoanInterest, 0),
      retired: !!row.retired
    };
  });
}

// One legacy FY's archived master rows (legacy_historical_member_openings /
// legacy_historical_employee_openings payload.raw) for the FY starting on
// fyStart, keyed by member/employee code; employee rows also carry that FY's
// legacy opening balances (`opening`, rupees, credit-positive). `closed` is
// true once legacy holds a later FY too — only then is that FY's interest final.
async function getLegacyFyAccountRows(kind, codes = [], fyStart = '') {
  const empty = { rows: new Map(), closed: false };
  const start = cleanText(fyStart);
  if (!codes.length || !start) return empty;
  const table = kind === 'employee' ? 'legacy_historical_employee_openings' : 'legacy_historical_member_openings';
  const codeColumn = kind === 'employee' ? '"employeeCode"' : '"memberCode"';
  const database = await initializeDatabase();
  try {
    const [result, later] = await Promise.all([
      database.query(`SELECT * FROM ${table} WHERE "fyStart" = $1 AND ${codeColumn} = ANY($2)`, [start, codes]),
      database.query(`SELECT 1 FROM ${table} WHERE "fyStart" > $1 LIMIT 1`, [start])
    ]);
    return {
      rows: new Map(result.rows.map((r) => {
        const raw = { ...(r.payload?.raw || {}) };
        if (kind === 'employee') {
          raw.opening = { housingLoan: toNumber(r.housingLoan, 0), vehicleLoan: toNumber(r.vehicleLoan, 0), grainAdvance: toNumber(r.grainAdvance, 0) };
        }
        return [kind === 'employee' ? r.employeeCode : r.memberCode, raw];
      })),
      closed: later.rows.length > 0
    };
  } catch (error) {
    // Not loaded yet (tools/legacy-migration/src/load-member-openings.js).
    if (error.code === '42P01') return empty;
    throw error;
  }
}

// Legacy "Member's Opening Balance": one row per member, no per-member
// selection — legacy's own Code/Member filter on this report is ignored in
// practice (verified against a real capture), so this intentionally always
// returns every member rather than reproducing that as a feature. The balance
// is what each bucket stood at just before the selected FY's 1 April, from the
// shared member balance walk (for the cutover FY that is the migrated
// `member.balances` snapshot itself).
// Balances are credit-positive (a loan owed is negative): positive is CR,
// negative DR, and a nil balance prints on the head's own side as legacy does
// (deposits CR, loans DR).
function balanceSide(amount, naturalSide = 'CR') {
  if (amount > 0) return 'CR';
  if (amount < 0) return 'DR';
  return naturalSide;
}

// Legacy lists only the members present in that FY's database; members who
// left earlier (some still carry a few paise) are left out the same way.
function inLegacyFy(periods, legacyFy) {
  return legacyFy.rows.size ? periods.filter(({ member }) => legacyFy.rows.has(member.code)) : periods;
}

async function buildMembersOpeningBalanceReport({ branchCode = '', dateFrom = '', user = {} } = {}) {
  const members = await findMembersForReport({ branchCode, user });
  // Walk only what happened before the FY starts, so this equals the previous
  // FY's closing balance exactly.
  const [periods, legacyFy] = await Promise.all([
    computeMemberPeriodBalances({ members, dateFrom, dateTo: previousDay(dateFrom), user }),
    getLegacyFyAccountRows('member', members.map((m) => m.code), dateFrom)
  ]);

  return inLegacyFy(periods, legacyFy).map(({ member: row, buckets }) => {
    // No FY given -> the migrated snapshot (closing with no dateTo), as before.
    const opening = (key) => toRupees(dateFrom ? buckets[key].opening : buckets[key].closing);
    const share = opening('share');
    const specialDeposit = opening('specialDeposit');
    const compulsoryDeposit = opening('compulsoryDeposit');
    const loan = opening('loan');
    const loanAgainstDeposit = opening('loanAgainstDeposit');
    return {
      memberCode: row.code,
      memberName: row.name,
      share: { amount: Math.abs(share), side: balanceSide(share) },
      specialDeposit: { amount: Math.abs(specialDeposit), side: balanceSide(specialDeposit) },
      compulsoryDeposit: { amount: Math.abs(compulsoryDeposit), side: balanceSide(compulsoryDeposit) },
      loan: { amount: Math.abs(loan), side: balanceSide(loan, 'DR') },
      loanAgainstDeposit: { amount: Math.abs(loanAgainstDeposit), side: balanceSide(loanAgainstDeposit, 'DR') }
    };
  });
}

// Legacy "Member's Closing Balance": one row per member, no per-member
// selection. Balance is as at the selected FY's 31 March from the shared
// member balance walk; interest is legacy's own MbrCBlnc figure for a FY
// legacy has closed (as Account Statement View), otherwise that FY's accrual.
// Total = balance + interest. Like legacy, only members with a non-zero
// balance in some head are listed (an interest-only row is left out), and
// their interest is printed whatever their status — a member dismembered
// mid-year who still owes a loan keeps the year's interest (FY 2025-26
// member 826). Matches legacy's FY 2024-25 and 2025-26 printouts.
async function buildMembersClosingBalanceReport({ branchCode = '', dateFrom = '', dateTo = '', user = {} } = {}) {
  const members = await findMembersForReport({ branchCode, user });
  const [periods, legacyFy] = await Promise.all([
    computeMemberPeriodBalances({ members, dateFrom, dateTo, user }),
    getLegacyFyAccountRows('member', members.map((m) => m.code), dateFrom)
  ]);
  const legacyField = { specialDeposit: 'MSSAIntr', compulsoryDeposit: 'MContryIntr', loan: 'MRLoanIntr', loanAgainstDeposit: 'MDLoanIntr' };

  const hasBalance = ({ buckets }) => MEMBER_BALANCE_BUCKETS.some((key) => Math.abs(toRupees(buckets[key].closing)) >= 0.005);
  return inLegacyFy(periods, legacyFy).filter(hasBalance).map(({ member: row, buckets }) => {
    const share = toRupees(buckets.share.closing);
    const legacyRow = legacyFy.rows.get(row.code);
    const legacyInterest = legacyFy.closed && legacyRow ? (legacyRow.MbrCBlnc || {}) : null;
    // Legacy's MbrCBlnc interest keeps its sign (a few are negative, e.g.
    // FY 2025-26 member 1623's LAD -2): it prints unsigned, but Total and the
    // footer add it signed (2.00 DR + -2 = 0.00), so it is passed on signed.
    const closingBucket = (key, naturalSide = 'CR') => {
      const amount = toRupees(buckets[key].closing);
      const interest = legacyInterest ? toNumber(legacyInterest[legacyField[key]], 0) : Math.abs(toRupees(buckets[key].interest));
      return { balance: Math.abs(amount), side: balanceSide(amount, naturalSide), interest, total: Number((Math.abs(amount) + interest).toFixed(2)) };
    };
    return {
      memberCode: row.code,
      memberName: row.name,
      share: { amount: Math.abs(share), side: balanceSide(share) },
      specialDeposit: closingBucket('specialDeposit'),
      compulsoryDeposit: closingBucket('compulsoryDeposit'),
      loan: closingBucket('loan', 'DR'),
      loanAgainstDeposit: closingBucket('loanAgainstDeposit', 'DR')
    };
  });
}

// Batched counterpart of getHistoricalMemberLedgerRows — same two source
// queries (legacy_historical_vouchers by ParticularAccID, legacy_historical_
// recovery by memberCode) but issued ONCE across every member with an IN/ANY
// filter instead of once per member, then grouped in memory. Bulk reports
// (all ~1000 members) would otherwise run 2 queries per member.
async function getHistoricalMemberLedgerRowsBatch(members) {
  const database = await initializeDatabase();
  const accIdToCode = new Map();
  const codes = [];
  for (const m of members) {
    codes.push(m.code);
    const accId = m?.payload?.raw?.AccID != null ? String(m.payload.raw.AccID) : '';
    if (accId) accIdToCode.set(accId, m.code);
  }
  const rowsByMember = new Map(members.map((m) => [m.code, []]));

  const accIds = [...accIdToCode.keys()];
  if (accIds.length) {
    const directResult = await database.query(
      `SELECT "voucherNo", "voucherCategory", narration, payload, "sourceDatabase"
       FROM legacy_historical_vouchers
       WHERE "voucherCategory" IN ('1','2','3','14','15')
         AND payload->'raw'->>'ParticularAccID' = ANY($1)`,
      [accIds]
    );
    for (const v of directResult.rows) {
      const raw = v.payload?.raw || {};
      const memberCode = accIdToCode.get(String(raw.ParticularAccID));
      const list = memberCode ? rowsByMember.get(memberCode) : null;
      if (!list) continue;
      const date = bookedInLegacyFy(raw.VoucherDate, v.sourceDatabase);
      if (!date) continue;

      const row = {
        voucherNo: `LGCY-${v.voucherNo}`,
        date,
        share: { credit: 0, debit: 0, balance: 0 },
        specialDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
        compulsoryDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
        loan: { credit: 0, debit: 0, balance: 0, interest: 0 },
        loanAgainstDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
        isOpening: false,
        isHistorical: true,
        fyStart: legacyFyStart(v.sourceDatabase),
        narration: withLegacyDateNote(v.narration || raw.Narration || '', raw.VoucherDate, date)
      };

      if (v.voucherCategory === '1') {
        row.loan.debit = toPaise(raw.RLoanAmt);
        row.loanAgainstDeposit.debit = toPaise(raw.DLoanAmt);
      } else if (v.voucherCategory === '2') {
        row.compulsoryDeposit.debit = toPaise(raw.CDAmt);
      } else if (v.voucherCategory === '3') {
        row.specialDeposit.debit = toPaise(raw.SSAamt);
      } else if (v.voucherCategory === '14' || v.voucherCategory === '15') {
        const rowSide = v.voucherCategory === '14' ? 'debit' : 'credit';
        row.share[rowSide] = toPaise(raw.ShareAmt);
        row.compulsoryDeposit[rowSide] = toPaise(raw.CDAmt);
        row.specialDeposit[rowSide] = toPaise(raw.SSAamt);
        row.loan[rowSide] = toPaise(raw.RLoanAmt);
        row.loanAgainstDeposit[rowSide] = toPaise(raw.DLoanAmt);
      }

      list.push(row);
    }
  }

  if (codes.length) {
    const recoveryResult = await database.query(
      `SELECT r."memberCode" AS member_code, r."sourceDatabase" AS source_database, r.payload AS recovery_payload, v."voucherNo" AS parent_voucher_no, v.payload AS voucher_payload
       FROM legacy_historical_recovery r
       LEFT JOIN legacy_historical_vouchers v
         ON v."sourceDatabase" = r."sourceDatabase"
        AND v.payload->'raw'->>'TransNo' = r.payload->'raw'->>'TransNo'
        AND v."voucherCategory" = '5'
       WHERE r."memberCode" = ANY($1)`,
      [codes]
    );
    for (const r of recoveryResult.rows) {
      const list = rowsByMember.get(r.member_code);
      if (!list) continue;
      const rraw = r.recovery_payload?.raw || {};
      const vraw = r.voucher_payload?.raw || {};
      const date = bookedInLegacyFy(vraw.VoucherDate, r.source_database);
      if (!date) continue;

      list.push({
        voucherNo: r.parent_voucher_no ? `LGCY-${r.parent_voucher_no}` : 'LGCY-RECOVERY',
        date,
        share: { credit: toPaise(rraw.Share), debit: 0, balance: 0 },
        specialDeposit: { credit: toPaise(rraw.SSA), debit: 0, balance: 0, interest: 0 },
        compulsoryDeposit: { credit: toPaise(rraw.CD), debit: 0, balance: 0, interest: 0 },
        loan: { credit: toPaise(rraw.RLoan), debit: 0, balance: 0, interest: 0 },
        loanAgainstDeposit: { credit: toPaise(rraw.DLoan), debit: 0, balance: 0, interest: 0 },
        isOpening: false,
        isHistorical: true,
        fyStart: legacyFyStart(r.source_database),
        narration: withLegacyDateNote(vraw.Narration || '', vraw.VoucherDate, date)
      });
    }
  }

  const openingsByMember = await getLegacyMemberFyOpenings(codes);
  for (const [code, list] of rowsByMember) {
    list.push(...yearEndCarryForwardRows(list, openingsByMember.get(code)));
    // A carry-forward row opens its FY, so it goes ahead of anything else
    // dated that same 1 April.
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (b.isCarryForward ? 1 : 0) - (a.isCarryForward ? 1 : 0)));
  }
  return rowsByMember;
}

// 'JilaSahkariDB2425' -> '2024-04-01' (each legacy database is one FY).
function legacyFyStart(sourceDatabase = '') {
  const match = /(\d{2})(\d{2})$/.exec(cleanText(sourceDatabase));
  return match ? `20${match[1]}-04-01` : '';
}

// Rows a member report shows for [from, to]. A year-end carry-forward dated
// exactly `from` is part of that period's opening balance, not a movement in
// it — legacy's FY opening already includes the interest it carries.
function isInMemberWindow(row, fromDate, toDate) {
  if (fromDate && (row.date < fromDate || (row.date === fromDate && row.isCarryForward))) return false;
  return !toDate || row.date <= toDate;
}

// Each legacy database is one FY, and legacy counts a voucher in the FY whose
// database holds it whatever date was typed on it. The odd voucher dated
// outside its own FY (one in the whole archive: 24-02-2024 in the 2024-25
// database) is booked at the nearest edge of that FY so balances match legacy.
function bookedInLegacyFy(voucherDate, sourceDatabase) {
  const date = voucherDate ? String(voucherDate).slice(0, 10) : '';
  const fyStart = legacyFyStart(sourceDatabase);
  if (!date || !fyStart) return date || null;
  const fyEnd = `${Number(fyStart.slice(0, 4)) + 1}-03-31`;
  if (date < fyStart) return fyStart;
  if (date > fyEnd) return fyEnd;
  return date;
}

function withLegacyDateNote(narration, voucherDate, bookedDate) {
  const original = voucherDate ? String(voucherDate).slice(0, 10) : '';
  if (!original || original === bookedDate) return narration;
  const [y, m, d] = original.split('-');
  const note = `(dated ${d}-${m}-${y} in legacy)`;
  return narration ? `${narration} ${note}` : note;
}

// Every legacy FY's member opening balances (legacy_historical_member_openings),
// in paise, credit-positive signed like member.balances, oldest FY first.
async function getLegacyMemberFyOpenings(codes = []) {
  const byMember = new Map();
  if (!codes.length) return byMember;
  const database = await initializeDatabase();
  let result;
  try {
    result = await database.query(
      `SELECT "memberCode", "fyStart", share, "compulsoryDeposit", "specialDeposit", loan, "loanAgainstDeposit"
       FROM legacy_historical_member_openings
       WHERE "memberCode" = ANY($1)
       ORDER BY "fyStart"`,
      [codes]
    );
  } catch (error) {
    // Not loaded yet (tools/legacy-migration/src/load-member-openings.js):
    // reports fall back to the vouchers alone.
    if (error.code === '42P01') return byMember;
    throw error;
  }
  for (const row of result.rows) {
    if (!byMember.has(row.memberCode)) byMember.set(row.memberCode, []);
    byMember.get(row.memberCode).push({
      fyStart: row.fyStart,
      share: toPaise(row.share),
      compulsoryDeposit: toPaise(row.compulsoryDeposit),
      specialDeposit: toPaise(row.specialDeposit),
      loan: toPaise(row.loan),
      loanAgainstDeposit: toPaise(row.loanAgainstDeposit)
    });
  }
  return byMember;
}

// Legacy closes each FY by adding that year's computed interest (MbrCBlnc)
// straight into the next FY's opening balance — no voucher. Without it the
// balance history drifts by the accumulated interest for every earlier year.
// For each pair of consecutive FYs this adds one row on the later FY's 1 April
// carrying the difference between that FY's legacy opening and the earlier
// FY's opening plus its movements, so every FY opens exactly where legacy says.
// Because the gap is measured against the rows actually present, it also
// absorbs any legacy movement these rows don't model.
function yearEndCarryForwardRows(rows = [], openings = []) {
  const carryRows = [];
  for (let i = 1; i < openings.length; i += 1) {
    const previous = openings[i - 1];
    const current = openings[i];
    if (Number(current.fyStart.slice(0, 4)) - Number(previous.fyStart.slice(0, 4)) !== 1) continue;

    const row = {
      voucherNo: 'FY-CARRY-FORWARD',
      date: current.fyStart,
      share: { credit: 0, debit: 0, balance: 0 },
      specialDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
      compulsoryDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
      loan: { credit: 0, debit: 0, balance: 0, interest: 0 },
      loanAgainstDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
      isOpening: false,
      isHistorical: true,
      isCarryForward: true,
      fyStart: current.fyStart,
      narration: 'Year-end interest carried forward (legacy FY opening)'
    };
    let changed = false;
    for (const key of MEMBER_BALANCE_BUCKETS) {
      const movement = rows
        .filter((r) => r.fyStart === previous.fyStart)
        .reduce((total, r) => total + (r[key].credit || 0) - (r[key].debit || 0), 0);
      const gap = current[key] - (previous[key] + movement);
      if (gap > 0) row[key].credit = gap;
      if (gap < 0) row[key].debit = -gap;
      if (gap) changed = true;
    }
    if (changed) carryRows.push(row);
  }
  return carryRows;
}

const MEMBER_BALANCE_BUCKETS = ['share', 'specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'];

// '2024-11-07' -> FY '2024-04-01'..'2025-03-31'.
function fyStartOf(isoDate) {
  const year = Number(isoDate.slice(0, 4));
  return `${Number(isoDate.slice(5, 7)) >= 4 ? year : year - 1}-04-01`;
}
function fyEndOf(isoDate) {
  return `${Number(fyStartOf(isoDate).slice(0, 4)) + 1}-03-31`;
}

// Fills row[key].interest (paise) on a member's merged, date-sorted timeline
// the way the legacy member ledger printout does (verified to the rupee on
// member 1068, FY 2024-25, and on every member's FY total against MbrCBlnc):
//  - a bucket shows interest only on rows where that bucket itself moves,
//    accrued on its balance since its own previous movement;
//  - each FY starts afresh on 1 April (legacy keeps one database per FY);
//  - a bucket's last movement in a FY also earns interest from its date to
//    the FY end (or `asOnDate`, the report's as-on date, if earlier), added to
//    that row;
//  - every amount is rounded to the whole rupee.
// `toFyEnd: false` drops that year-end span, as legacy's Statement of Member
// Ledger does (interest only up to each head's last movement).
// Rows need row[key].signed/.balance set (balance walk) before this runs.
function accrueMemberLedgerInterest(allRows, rateTimelines, asOnDate = '', { toFyEnd = true } = {}) {
  const toRupeePaise = (paise) => Math.round((paise || 0) / 100) * 100;
  for (const key of Object.keys(rateTimelines)) {
    const timeline = rateTimelines[key];
    for (const row of allRows) row[key].interest = 0;
    const movers = allRows.filter((row) => row[key].credit || row[key].debit);
    if (!movers.length) continue;

    const first = movers[0][key];
    let priorBalance = Math.abs(first.signed - (first.credit - first.debit));
    let priorDate = fyStartOf(movers[0].date);
    movers.forEach((row, index) => {
      const fyStart = fyStartOf(row.date);
      const from = priorDate < fyStart ? fyStart : priorDate;
      row[key].interest = toRupeePaise(rateHistory.accrueInterest(priorBalance, from, row.date, timeline));
      priorBalance = row[key].balance;
      priorDate = row.date;

      const next = movers[index + 1];
      let tailEnd = fyEndOf(row.date);
      if (asOnDate && asOnDate < tailEnd) tailEnd = asOnDate;
      if (!toFyEnd || (!next && !asOnDate)) return;
      if (tailEnd > row.date && (!next || next.date > tailEnd)) {
        row[key].interest += toRupeePaise(rateHistory.accrueInterest(row[key].balance, row.date, tailEnd, timeline));
      }
    });
  }
}

// '2025-04-01' -> '2025-03-31'; '' stays ''.
function previousDay(isoDate = '') {
  const date = cleanText(isoDate);
  if (!date) return '';
  const time = new Date(`${date}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? new Date(time - 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
}

async function findMembersForReport({ branchCode = '', search = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const memberQuery = effectiveBranchCode ? { branchCode: effectiveBranchCode } : {};
  const members = (await Member.find(memberQuery).lean()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return search
    ? members.filter((row) => [row.code, row.name].some((value) => cleanLower(value).includes(cleanLower(search))))
    : members;
}

// Bulk counterpart of buildMemberLedgerReport — same balance-walk and simple-
// interest rules (see the comments there), run for every member against
// shared, pre-fetched vouchers/recovery-lines/historical rows instead of one
// member at a time. Returns, per member and bucket, the signed balance (paise,
// same sign convention as member.balances) just before dateFrom and at the end
// of dateTo, plus the period credit/debit/interest totals — which is what every
// FY-scoped member report (Statement of Member Ledger, Opening/Closing Balance,
// Account Statement member view) needs. Keep the per-row calculation here in
// sync with buildMemberLedgerReport.
// Interest the way legacy's Statement of Member Ledger computes it: its
// GetLedger procedure adds a nil row at every month end of the FY (30 April
// to the last month end before the as-on date — so 28 February for a full
// FY), and the desktop app accrues each head's balance across every row,
// movement or not. So a head with no movement still earns interest up to
// that last month end, and one that moved later in the year up to its last
// movement; never on to 31 March. Amounts are summed unrounded and the
// total rounded once. Verified member by member against legacy FY 2024-25.
function statementOfMemberLedgerInterest(rows, key, openingPaise, fromDate, toDate, timeline) {
  if (!fromDate || !toDate) return 0;
  const points = new Map();
  for (const row of rows) {
    const cell = row[key];
    if (!cell || (!cell.credit && !cell.debit)) continue;
    points.set(row.date, (points.get(row.date) || 0) + (cell.credit || 0) - (cell.debit || 0));
  }
  // Month ends whose next day is still on/before the as-on date.
  const start = new Date(`${fromDate}T00:00:00Z`);
  for (let n = 1; n <= 240; n += 1) {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + n, start.getUTCDate()));
    if (next.toISOString().slice(0, 10) > toDate) break;
    const monthEnd = new Date(next.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!points.has(monthEnd)) points.set(monthEnd, 0);
  }
  let signed = openingPaise;
  let prior = fromDate;
  let total = 0;
  for (const date of [...points.keys()].sort()) {
    if (date < fromDate || date > toDate) continue;
    total += rateHistory.accrueInterest(Math.abs(signed), prior, date, timeline);
    signed += points.get(date);
    prior = date;
  }
  return Math.round(total / 100) * 100;
}

async function computeMemberPeriodBalances({ members = [], dateFrom = '', dateTo = '', user = {}, interestToFyEnd = true, statementInterest = false } = {}) {
  const effectiveBranchCode = resolveBranchCode(user);
  const voucherQuery = {};
  if (effectiveBranchCode) voucherQuery.branchCode = effectiveBranchCode;
  if (dateTo) voucherQuery.date = { $lte: cleanText(dateTo) };
  const vouchers = await Voucher.find(voucherQuery).sort({ date: 1, createdAt: 1 }).lean();
  const voucherIds = vouchers.map((v) => String(v._id || v.id));
  const voucherNos = vouchers.map((v) => v.voucherNo).filter(Boolean);
  const recoveryLinesAll = (voucherIds.length || voucherNos.length)
    ? await RecoveryLine.find({ $or: [{ voucherId: { $in: voucherIds } }, { voucherNo: { $in: voucherNos } }] }).lean()
    : [];

  const historicalByMember = await getHistoricalMemberLedgerRowsBatch(members);
  const rateTimelines = await getInterestRateTimelines(MEMBER_INTEREST_HEADS);
  const fromDateStr = cleanText(dateFrom);
  const toDateStr = cleanText(dateTo);

  return members.map((member) => {
    const balancesObj = typeof member.balances === 'string' ? JSON.parse(member.balances || '{}') : (member.balances || {});
    const anchors = {
      share: toPaise(balancesObj.share || 0),
      specialDeposit: toPaise(balancesObj.specialDeposit || balancesObj.ssa || 0),
      compulsoryDeposit: toPaise(balancesObj.compulsoryDeposit || balancesObj.cd || 0),
      loan: toPaise(balancesObj.loan || balancesObj.regularLoan || 0),
      loanAgainstDeposit: toPaise(balancesObj.loanAgainstDeposit || balancesObj.lad || 0)
    };

    let allRows = [];
    for (const voucher of vouchers) {
      const voucherMember = getPartyMemberCode(voucher);
      const vId = String(voucher._id || voucher.id);
      const isPartyMatch = voucherMember && voucherMember === member.code;
      const lineMatch = recoveryLinesAll.find((line) => cleanUpper(line.memberCode) === cleanUpper(member.code)
        && (line.voucherId === vId || (!line.voucherId && line.voucherNo === voucher.voucherNo)));

      if (!isPartyMatch && !lineMatch) continue;

      const row = {
        date: voucher.date,
        share: { credit: 0, debit: 0, balance: 0 },
        specialDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
        compulsoryDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
        loan: { credit: 0, debit: 0, balance: 0, interest: 0 },
        loanAgainstDeposit: { credit: 0, debit: 0, balance: 0, interest: 0 },
        isOpening: false
      };

      if (lineMatch) {
        row.share.credit = toPaise(lineMatch.share);
        row.specialDeposit.credit = toPaise(lineMatch.specialDeposit || lineMatch.ssa);
        row.compulsoryDeposit.credit = toPaise(lineMatch.compulsoryDeposit);
        row.loan.credit = toPaise(lineMatch.regularLoan);
        row.loanAgainstDeposit.credit = toPaise(lineMatch.loanAgainstDeposit || lineMatch.depositLoan);
      } else {
        const components = voucher.details?.components || {};
        const key = voucher.details?.key || '';

        if (key === 'loan-paid-member') {
          row.loan.debit = toPaise(components.loanAmt);
          row.loanAgainstDeposit.debit = toPaise(components.lad);
        } else if (key === 'deposit-paid-member') {
          row.compulsoryDeposit.debit = toPaise(components.cd || voucher.amount);
        } else if (key === 'ssa-paid-member') {
          row.specialDeposit.debit = toPaise(components.specialDeposit || components.ssa || voucher.amount);
        } else if (key === 'share-paid-member') {
          row.share.debit = toPaise(components.share || voucher.amount);
        } else if (cleanLower(voucher.accent) === 'pink' || cleanLower(voucher.transactionType) === 'payment') {
          row.loan.debit = toPaise(voucher.amount);
        } else {
          row.loan.credit = toPaise(voucher.amount);
        }
      }

      allRows.push(row);
    }

    allRows = (historicalByMember.get(member.code) || []).concat(allRows);
    allRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Signed balance before the first row of the timeline, per bucket.
    // Anchors are credit-positive (a loan owed is negative), so undoing a row
    // is the same for every bucket.
    const balanceBeforeAll = {};
    for (const key of MEMBER_BALANCE_BUCKETS) {
      let running = anchors[key];
      for (let i = allRows.length - 1; i >= 0; i -= 1) {
        const row = allRows[i];
        row[key].signed = running;
        row[key].balance = Math.abs(running);
        running -= row[key].credit - row[key].debit;
      }
      balanceBeforeAll[key] = running;
    }

    accrueMemberLedgerInterest(allRows, rateTimelines, toDateStr, { toFyEnd: interestToFyEnd });

    const visibleRows = allRows.filter((r) => isInMemberWindow(r, fromDateStr, toDateStr));
    // Balance carried by the last row on/before a date. A window with no rows
    // of its own still has a real balance (whatever the previous row left),
    // so this looks across the full timeline, not just visibleRows.
    // An opening (inclusive = false) includes a year-end carry-forward dated
    // that same day, as legacy's FY opening does.
    const signedBalanceUpTo = (key, date, inclusive) => {
      for (let i = allRows.length - 1; i >= 0; i -= 1) {
        const row = allRows[i];
        if (inclusive ? row.date <= date : (row.date < date || (row.date === date && row.isCarryForward))) return row[key].signed;
      }
      return balanceBeforeAll[key];
    };

    const buckets = {};
    for (const key of MEMBER_BALANCE_BUCKETS) {
      buckets[key] = {
        opening: fromDateStr ? signedBalanceUpTo(key, fromDateStr, false) : balanceBeforeAll[key],
        closing: toDateStr ? signedBalanceUpTo(key, toDateStr, true) : anchors[key],
        credit: visibleRows.reduce((total, r) => total + (r[key].credit || 0), 0),
        debit: visibleRows.reduce((total, r) => total + (r[key].debit || 0), 0),
        interest: visibleRows.reduce((total, r) => total + (r[key].interest || 0), 0)
      };
      if (statementInterest && rateTimelines[key]) {
        buckets[key].statementInterest = statementOfMemberLedgerInterest(visibleRows, key, buckets[key].opening, fromDateStr, toDateStr, rateTimelines[key]);
      }
    }

    return { member, buckets };
  });
}

async function buildStatementOfMemberLedgerReport({ dateFrom = '', dateTo = '', user = {} } = {}) {
  const members = await findMembersForReport({ user });
  const [periods, legacyFy] = await Promise.all([
    computeMemberPeriodBalances({ members, dateFrom, dateTo, user, statementInterest: true }),
    getLegacyFyAccountRows('member', members.map((m) => m.code), dateFrom)
  ]);

  // Legacy lists only that FY's Active members here (members who left in
  // the year drop out, their balances already nil), and folds the opening
  // into the period columns: a credit (positive) opening into Credit, a debit
  // opening into Debit, so Credit - Debit is the closing balance and the
  // TOTAL line adds up. Verified against legacy FY 2024-25's TOTAL line.
  const active = inLegacyFy(periods, legacyFy)
    .filter(({ member }) => !legacyFy.rows.size || legacyFy.rows.get(member.code)?.Status === 'Active');
  // Interest is this report's own legacy calculation (see
  // statementOfMemberLedgerInterest), not the Member Ledger's MbrCBlnc figure;
  // a member on that FY's no-interest list (EntNoInterestMbr) gets none.
  //
  // Legacy's desktop app (VwReports.ShowMemberLedgerStatementS) reads the
  // no-interest flag (EndIntrstCal) from the FIRST row of the whole report —
  // the lowest-AccID Active member — and skips the accrual for EVERY member
  // when that one member is on the no-interest list. That is the case in FY
  // 2025-26 and 2026-27 (member 525), so those years' ledgers carry no accrued
  // interest at all, only interest posted by vouchers (below).
  const accrualOff = legacyAccrualSwitchedOff(legacyFy);
  // Interest posted by TransType 20 (paid to member) / 21 (received from
  // member) vouchers: in legacy's VwMbrTransData they fill only the interest
  // columns, signed so that paid-out deposit interest and collected loan
  // interest are negative. Legacy adds them to the accrued figure, prints the
  // sum unsigned and adds it signed to the balance for CLOSING BAL.
  const voucherInterest = await getLegacyVoucherInterestByMember(legacyFy, dateFrom || dateTo);
  return active.map(({ member, buckets }) => {
    const noInterest = !!legacyFy.rows.get(member.code)?.NoInterest;
    const posted = voucherInterest.get(member.code) || {};
    const bucket = (key, hasInterest) => {
      const opening = toRupees(buckets[key].opening);
      const closing = toRupees(buckets[key].closing);
      const accrued = noInterest || accrualOff ? 0 : toRupees(buckets[key].statementInterest || 0);
      const interest = Number((accrued + (posted[key] || 0)).toFixed(2));
      return {
        opening,
        credit: Number((toRupees(buckets[key].credit) + Math.max(opening, 0)).toFixed(2)),
        debit: Number((toRupees(buckets[key].debit) + Math.max(-opening, 0)).toFixed(2)),
        balance: Math.abs(closing),
        side: balanceSide(closing, key === 'loan' || key === 'loanAgainstDeposit' ? 'DR' : 'CR'),
        ...(hasInterest ? { interest } : {})
      };
    };

    return {
      memberCode: member.code,
      memberName: member.name,
      branchCode: member.branchCode,
      designation: member.designation || '',
      fhName: member.fatherOrHusbandName || '',
      share: bucket('share', false),
      specialDeposit: bucket('specialDeposit', true),
      compulsoryDeposit: bucket('compulsoryDeposit', true),
      loan: bucket('loan', true),
      loanAgainstDeposit: bucket('loanAgainstDeposit', true)
    };
  });
}

// See buildStatementOfMemberLedgerReport: true when that FY's lowest-AccID
// Active member is on the no-interest list, which turns off legacy's accrual
// for the whole Statement of Member Ledger.
function legacyAccrualSwitchedOff(legacyFy) {
  let first = null;
  for (const raw of legacyFy.rows.values()) {
    if (raw?.Status !== 'Active') continue;
    if (!first || Number(raw.AccID) < Number(first.AccID)) first = raw;
  }
  return !!first?.NoInterest;
}

// Member code -> { specialDeposit, compulsoryDeposit, loan, loanAgainstDeposit }
// interest (rupees, signed as legacy VwMbrTransData) from that FY's archived
// TransType 20/21 vouchers. Empty outside a legacy FY.
async function getLegacyVoucherInterestByMember(legacyFy, date) {
  const result = new Map();
  const startYear = fyStartYearOf(date);
  if (!legacyFy.rows.size || startYear == null) return result;
  const codeByAccId = new Map();
  for (const [code, raw] of legacyFy.rows) codeByAccId.set(String(raw.AccID), code);
  const database = await initializeDatabase();
  const { rows } = await database.query(
    `SELECT "voucherCategory", payload FROM legacy_historical_vouchers
     WHERE "sourceDatabase" = $1 AND "voucherCategory" IN ('20', '21')`,
    [legacyDbForFyStartYear(startYear)]
  );
  for (const { voucherCategory, payload } of rows) {
    const raw = payload?.raw || {};
    const code = codeByAccId.get(String(raw.ParticularAccID));
    if (!code) continue;
    // TransType 21, and the loan heads of 20, are always negated; deposit
    // heads of a 20 are negated on a payment voucher only.
    const depositSign = voucherCategory === '20' && cleanUpper(raw.VoucherType) !== 'P' ? 1 : -1;
    const entry = result.get(code) || { specialDeposit: 0, compulsoryDeposit: 0, loan: 0, loanAgainstDeposit: 0 };
    entry.specialDeposit += depositSign * legacyNumber(raw.SSAamt);
    entry.compulsoryDeposit += depositSign * legacyNumber(raw.CDAmt);
    entry.loan -= legacyNumber(raw.RLoanAmt);
    entry.loanAgainstDeposit -= legacyNumber(raw.DLoanAmt);
    result.set(code, entry);
  }
  return result;
}

// Legacy report order (MstAccountMaster.SortNo), then ledger code.
function sortBySortOrder(rows = []) {
  return [...rows].sort((a, b) => (toNumber(a.sortOrder, 0) - toNumber(b.sortOrder, 0)) || compareCodesNumerically(a.code, b.code));
}

// Credit-positive signed balance (legacy vwLedgerBalance convention) shown
// the way its own side reads it: liability/income as-is, asset/expense negated,
// so a contra balance comes out negative instead of silently flipping sides.
function sideAmount(row, creditSide) {
  const signed = toNumber(row.signedBalance, 0);
  return Number((creditSide ? signed : -signed).toFixed(2));
}

function sumAmounts(rows = []) {
  return Number(rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2));
}

// Net of Income + Expenses + the Profit & Loss A/c ledger (Primary), credit-
// positive. Zero once legacy's year-end voucher has moved the year's profit
// into the P&L A/c and appropriated it; otherwise it's the undistributed
// profit (CR) or loss (DR) that makes the balance sheet balance.
function profitAndLossNet(snapshots = []) {
  const net = snapshots
    .filter((row) => ['INCOME', 'EXPENSE', 'PRIMARY'].includes(row.nature))
    .reduce((sum, row) => sum + toNumber(row.signedBalance, 0), 0);
  return Number(net.toFixed(2));
}

// A trial balance is a point-in-time snapshot: each ledger's CLOSING balance
// shown in whichever column (debit/credit) it sits on — that's what makes the
// two column totals equal, which is the whole point of the report. It is NOT
// period transaction movement: most ledgers have an opening balance but few
// posted vouchers, and period-movement-only figures would drop real money.
// periodDebit/periodCredit are exposed alongside for callers that want the
// movement breakdown too. nature/sortOrder/signedBalance let the print match
// the legacy layout (Liabilities + "Adjusting Head Income" vs Assets +
// "Adjusting Head Expenses" + "Profit & Loss A/c").
async function buildTrialBalanceReport({ dateFrom = '', dateTo = '', uptoDate = '', user = {} } = {}) {
  const snapshots = await getLedgerSnapshots({ dateFrom, dateTo, uptoDate, branchCode: resolveBranchCode(user) });
  return sortBySortOrder(snapshots).map((row) => ({
    ledgerCode: row.code,
    ledgerName: row.name,
    nature: row.nature,
    sortOrder: row.sortOrder,
    opening: row.opening,
    openingSide: row.openingSide,
    periodDebit: row.totalDr,
    periodCredit: row.totalCr,
    debit: row.closingSide === 'DR' ? row.closing : 0,
    credit: row.closingSide === 'CR' ? row.closing : 0,
    closing: row.closing,
    closingSide: row.closingSide,
    signedBalance: row.signedBalance
  }));
}

// Legacy ReportData 'BALANCE SHEET': Liabilities and Assets ledgers by SortNo,
// plus the Profit & Loss A/c line (see profitAndLossNet), placed on the side
// that balances it.
async function buildBalanceSheetReport({ uptoDate = '', user = {} } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate, branchCode: resolveBranchCode(user) });
  const toRow = (row, creditSide) => ({ ledgerCode: row.code, ledgerName: row.name, amount: sideAmount(row, creditSide) });
  const liabilities = sortBySortOrder(snapshots.filter((row) => row.nature === 'LIABILITY')).map((row) => toRow(row, true));
  const assets = sortBySortOrder(snapshots.filter((row) => row.nature === 'ASSET')).map((row) => toRow(row, false));
  const net = profitAndLossNet(snapshots);
  const profitLoss = { ledgerName: 'Profit & Loss A/c', amount: Math.abs(net), side: net > 0 ? 'LIABILITY' : 'ASSET' };

  return {
    liabilities,
    assets,
    profitLoss,
    totalLiabilities: Number((sumAmounts(liabilities) + (profitLoss.side === 'LIABILITY' ? profitLoss.amount : 0)).toFixed(2)),
    totalAssets: Number((sumAmounts(assets) + (profitLoss.side === 'ASSET' ? profitLoss.amount : 0)).toFixed(2))
  };
}

// Legacy ReportData 'PROFIT LOSS': Income ledgers vs Expenses ledgers.
async function buildProfitLossReport({ uptoDate = '', user = {} } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate, branchCode: resolveBranchCode(user) });
  const toRow = (row, creditSide) => ({ ledgerCode: row.code, ledgerName: row.name, amount: sideAmount(row, creditSide) });
  const income = sortBySortOrder(snapshots.filter((row) => row.nature === 'INCOME')).map((row) => toRow(row, true));
  const expense = sortBySortOrder(snapshots.filter((row) => row.nature === 'EXPENSE')).map((row) => toRow(row, false));

  return {
    income,
    expense,
    totalIncome: sumAmounts(income),
    totalExpense: sumAmounts(expense)
  };
}

// Cash Book, in the legacy layout: every voucher of the day grouped by the
// ledger it hits (the "particulars"), credits under INCOME and debits under
// EXPENSES, each split into Cash (voucher paid through Cash-In-Hand) and
// Transfer (anything else), plus Opening/Closing Cash-In-Hand. Reconciled to
// the paisa against legacy printouts (e.g. 29-Jan-2025, 31-Mar-2025). Legacy
// has no SQL for this report (it's built inside the EXE); the rules were
// reverse-engineered from its output and VwLedgerTransaction:
//  - particulars = VwLedgerTransaction rows for the day, minus the pay-mode
//    (cash/bank) side and minus Cash-In-Hand itself; member/employee accounts
//    only show through their control ledgers (Loan to Members A/c etc.).
//  - Closing cash = opening + cash receipts - cash payments.
// Returns { rows, openingCash, closingCash, source }.
async function buildCashBookReport({ date = '', dateFrom = '', dateTo = '', user = {} } = {}) {
  const from = cleanText(dateFrom || date);
  const to = cleanText(dateTo || date || dateFrom);
  const ledgers = await Ledger.find({}).lean();

  const legacy = await buildLegacyCashBook({ from, to, ledgers });
  if (legacy) return legacy;
  return buildLiveCashBook({ from, to, ledgers, branchCode: resolveBranchCode(user) });
}

function cashBookAccumulator(ledgers = []) {
  const ledgerByCode = new Map(ledgers.map((ledger) => [cleanUpper(ledger.code), ledger]));
  const totals = new Map();
  const add = (code, credit, debit, isCash) => {
    const ledger = ledgerByCode.get(code);
    const row = totals.get(code) || {
      ledgerCode: code,
      ledgerName: ledger?.name || code,
      sortOrder: toNumber(ledger?.sortOrder, 0),
      crCash: 0, crTransfer: 0, drCash: 0, drTransfer: 0
    };
    if (isCash) { row.crCash += credit; row.drCash += debit; } else { row.crTransfer += credit; row.drTransfer += debit; }
    totals.set(code, row);
  };
  const rows = () => sortBySortOrder([...totals.values()].map((row) => ({ ...row, code: row.ledgerCode })))
    .map(({ code, ...row }) => ({
      ...row,
      crCash: Number(row.crCash.toFixed(2)),
      crTransfer: Number(row.crTransfer.toFixed(2)),
      drCash: Number(row.drCash.toFixed(2)),
      drTransfer: Number(row.drTransfer.toFixed(2))
    }));
  return { add, rows };
}

// Archived legacy dates (any FY database in legacy_historical_vouchers, up to
// the cutover date): that FY's rows dated from..to, plus Cash-In-Hand before
// and after them. Returns null when the dates aren't archived.
async function legacyCashWindow({ from, to, ledgers }) {
  const startYear = fyStartYearOf(to);
  if (startYear == null) return null;
  const { byDb, cutoverDb, cashCode } = await loadLegacyLedgerEntries(ledgers);
  const targetDb = legacyDbForFyStartYear(startYear);
  if (!byDb.has(targetDb) || !cashCode) return null;
  if (targetDb === cutoverDb) {
    const cutoverDate = cleanText(ledgers.find((l) => l?.payload?.cutoverDate)?.payload?.cutoverDate).slice(0, 10);
    if (!cutoverDate || to > cutoverDate) return null;
  }
  const cashLedger = ledgers.find((ledger) => cleanUpper(ledger.code) === cashCode);
  const fyOpening = cashLedger?.payload?.fyOpeningBal?.[targetDb.slice(-4)];
  if (fyOpening == null) return null;

  // Cash-In-Hand is an asset: legacy balances are credit-positive, so the
  // amount in hand is the negated signed balance.
  let cashSigned = legacyNumber(fyOpening);
  const cashMovement = (row) => row.entries
    .filter((entry) => entry.code === cashCode)
    .reduce((sum, entry) => sum + entry.cr + entry.dr, 0);

  const all = byDb.get(targetDb);
  for (const row of all) {
    if (row.date && row.date < from) cashSigned += cashMovement(row);
  }
  const openingCash = -cashSigned;
  const rows = all.filter((row) => row.date && row.date >= from && row.date <= to);
  for (const row of rows) cashSigned += cashMovement(row);

  return {
    rows,
    cashCode,
    openingCash: Number(openingCash.toFixed(2)),
    closingCash: Number((-cashSigned).toFixed(2))
  };
}

async function buildLegacyCashBook({ from, to, ledgers }) {
  const window = await legacyCashWindow({ from, to, ledgers });
  if (!window) return null;

  const book = cashBookAccumulator(ledgers);
  for (const row of window.rows) {
    for (const entry of row.entries) {
      if (entry.viaPayMode || entry.code === window.cashCode) continue;
      book.add(entry.code, entry.cr, -entry.dr, row.isCash);
    }
  }

  return {
    rows: book.rows(),
    openingCash: window.openingCash,
    closingCash: window.closingCash,
    source: 'legacy'
  };
}

// Live vouchers: same layout from posted journal_lines. Particulars are every
// non-cash line of the day's vouchers (credit -> INCOME, debit -> EXPENSES);
// a voucher counts as Cash when it has a Cash-In-Hand line.
async function buildLiveCashBook({ from, to, ledgers, branchCode = '' }) {
  const cashLedger = ledgers.find((ledger) => ledger.semanticRole === ACCOUNTING_ROLES.CASH);
  if (!cashLedger) return { rows: [], openingCash: 0, closingCash: 0, source: 'live' };
  const cashLedgerId = String(cashLedger.id || cashLedger._id);

  const statementRows = await buildLedgerTransactionStatement(cashLedger, { dateFrom: from, dateTo: to, branchCode });
  const inHand = (row) => (row ? (row.balanceSide === 'CR' ? -row.balance : row.balance) : 0);
  const openingCash = inHand(statementRows[0]);
  const closingCash = inHand(statementRows[statementRows.length - 1]);

  const voucherQuery = {};
  if (branchCode) voucherQuery.branchCode = branchCode;
  if (from || to) {
    voucherQuery.date = {};
    if (from) voucherQuery.date.$gte = from;
    if (to) voucherQuery.date.$lte = to;
  }
  const vouchers = await Voucher.find(voucherQuery).lean();
  const voucherIds = vouchers.map((v) => String(v.id || v._id));
  const lines = voucherIds.length ? await JournalLine.find({ voucherId: { $in: voucherIds } }).lean() : [];
  const ledgerById = new Map(ledgers.map((l) => [String(l.id || l._id), l]));
  const cashVoucherIds = new Set(lines.filter((line) => String(line.ledgerId) === cashLedgerId).map((line) => String(line.voucherId)));

  const book = cashBookAccumulator(ledgers);
  for (const line of lines) {
    if (String(line.ledgerId) === cashLedgerId) continue;
    const ledger = ledgerById.get(String(line.ledgerId));
    if (!ledger) continue;
    book.add(cleanUpper(ledger.code), toNumber(line.creditAmount, 0), toNumber(line.debitAmount, 0), cashVoucherIds.has(String(line.voucherId)));
  }

  return {
    rows: book.rows(),
    openingCash: Number(openingCash.toFixed(2)),
    closingCash: Number(closingCash.toFixed(2)),
    source: 'live'
  };
}

// Legacy MstTransType names (identical in every FY database).
const LEGACY_TRANS_TYPE_NAMES = {
  1: 'Loan Paid To Member', 2: 'CD Paid To Member', 3: 'SSA Paid To Member',
  4: 'Insurance Premium Paid To Member', 5: 'Recovery From Member', 6: 'Loan Receive By CCA',
  7: 'Loan Receive To SA', 8: 'Deposit In Bank', 9: 'Cheque Issue By SA', 10: 'Amount Transfer By SA',
  11: 'Amount Transfer To CCA', 12: 'Advance Paid To Employee', 13: 'Advance Recovery From Employee',
  14: 'Transfer Voucher (Paid To Member)', 15: 'Transfer Voucher (Receipt From Member)',
  16: 'Transfer Voucher (Payment)', 17: 'Transfer Voucher (Receipt)', 18: 'Payment Voucher',
  19: 'Receipt Voucher', 20: 'Interest Paid To Member', 21: 'Interest Receive From Member',
  22: 'Interest Receive From Employee'
};

function formatDmyDashed(isoDate = '') {
  const [year, month, day] = cleanText(isoDate).slice(0, 10).split('-');
  return year && month && day ? `${day}-${month}-${year}` : '';
}

// Day Book, in the legacy layout (CrDayBook.rpt): every voucher of the day,
// receipts (R) first then payments (P), each by voucher number. A voucher's
// full amount sits under Credit for a receipt and Debit for a payment. Its
// heading is the transaction type + pay mode ("SSA Paid To Member By Cash"),
// printed only when it changes from the previous voucher; its lines are the
// cheque date/number, the account (ledger name, or "code name" for a member/
// employee) and the narration; a recovery also lists its members. Footer:
// Total Income + B/F Cash-In-Hand = Grand Total against Total Expenses +
// C/F Cash-In-Hand = Grand Total.
// Returns { vouchers: [{ voucherNo, group, heading, lines, credit, debit }], openingCash, closingCash, source }.
async function buildDayBookReport({ date = '', dateFrom = '', dateTo = '', user = {} } = {}) {
  const from = cleanText(dateFrom || date);
  const to = cleanText(dateTo || date || dateFrom);
  const ledgers = await Ledger.find({}).lean();

  const legacy = await buildLegacyDayBook({ from, to, ledgers });
  if (legacy) return legacy;
  return buildLiveDayBook({ from, to, ledgers, branchCode: resolveBranchCode(user) });
}

// `group` (transaction type + pay mode) is kept on every voucher for the
// Voucher Summary; `heading` repeats it only where it changes, as printed.
function withDayBookHeadings(vouchers = []) {
  let previous = null;
  return vouchers.map((voucher) => {
    const heading = voucher.group !== previous ? voucher.group : '';
    previous = voucher.group;
    return { ...voucher, heading };
  });
}

async function buildLegacyDayBook({ from, to, ledgers }) {
  const window = await legacyCashWindow({ from, to, ledgers });
  if (!window) return null;

  const database = await initializeDatabase();
  const partyIndex = await loadLegacyPartyIndex(database);
  const partyOf = (accId) => partyIndex.byKindAccId.get(`ledger:${accId}`)
    || partyIndex.byKindAccId.get(`member:${accId}`)
    || partyIndex.byKindAccId.get(`employee:${accId}`)
    || null;
  const isLedger = (accId) => partyIndex.byKindAccId.has(`ledger:${accId}`);

  // Recovery (TransType 5) members come from legacy_historical_recovery.
  const recoveries = window.rows.filter((row) => row.voucher.transType === 5);
  const membersByTrans = new Map();
  if (recoveries.length) {
    const result = await database.query(
      `SELECT "sourceDatabase", "memberCode", payload->'raw'->>'TransNo' AS trans_no
       FROM legacy_historical_recovery
       WHERE "sourceDatabase" = $1 AND payload->'raw'->>'TransNo' = ANY($2)`,
      [recoveries[0].voucher.sourceDatabase, recoveries.map((row) => row.voucher.transNo)]
    );
    const codes = [...new Set(result.rows.map((r) => r.memberCode).filter(Boolean))];
    const members = codes.length ? await Member.find({ code: { $in: codes } }).lean() : [];
    const nameByCode = new Map(members.map((m) => [m.code, m.name]));
    for (const r of result.rows) {
      const list = membersByTrans.get(r.trans_no) || [];
      list.push(`${r.memberCode} ${nameByCode.get(r.memberCode) || ''}`.trim());
      membersByTrans.set(r.trans_no, list);
    }
  }

  const sorted = [...window.rows].sort((a, b) => {
    if (a.voucher.voucherType !== b.voucher.voucherType) return a.voucher.voucherType === 'R' ? -1 : 1;
    return compareCodesNumerically(a.voucher.voucherNo, b.voucher.voucherNo);
  });

  const vouchers = sorted.map((row) => {
    const v = row.voucher;
    const typeName = LEGACY_TRANS_TYPE_NAMES[v.transType] || 'Voucher';
    const group = `${typeName} ${row.isCash ? 'By Cash' : v.paymode}`.trim();
    const lines = [];
    if (!row.isCash && (v.chequeDate || v.chequeNo)) {
      lines.push([formatDmyDashed(v.chequeDate), v.chequeNo].filter(Boolean).join('/'));
    }
    const party = partyOf(v.particularAccId);
    if (party) lines.push(isLedger(v.particularAccId) ? party.label : `${party.code} ${party.label}`);
    if (v.transType === 5) lines.push(...(membersByTrans.get(v.transNo) || []));
    if (v.narration) lines.push(v.narration);
    return {
      voucherNo: v.voucherNo,
      date: row.date,
      group,
      lines,
      credit: v.voucherType === 'R' ? v.total : 0,
      debit: v.voucherType === 'P' ? v.total : 0
    };
  });

  return {
    vouchers: withDayBookHeadings(vouchers),
    openingCash: window.openingCash,
    closingCash: window.closingCash,
    source: 'legacy'
  };
}

// Live vouchers in the same layout. Receipt/payment comes from the voucher's
// transactionType; cash vs other pay mode from whether it has a Cash-In-Hand
// journal line.
async function buildLiveDayBook({ from, to, ledgers, branchCode = '' }) {
  const cashLedger = ledgers.find((ledger) => ledger.semanticRole === ACCOUNTING_ROLES.CASH);
  const cashLedgerId = cashLedger ? String(cashLedger.id || cashLedger._id) : '';

  let openingCash = 0;
  let closingCash = 0;
  if (cashLedger) {
    const statementRows = await buildLedgerTransactionStatement(cashLedger, { dateFrom: from, dateTo: to, branchCode });
    const inHand = (row) => (row ? (row.balanceSide === 'CR' ? -row.balance : row.balance) : 0);
    openingCash = inHand(statementRows[0]);
    closingCash = inHand(statementRows[statementRows.length - 1]);
  }

  const query = {};
  if (branchCode) query.branchCode = branchCode;
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }
  const vouchers = await Voucher.find(query).lean();
  const voucherIds = vouchers.map((v) => String(v.id || v._id));
  const cashLines = cashLedgerId && voucherIds.length
    ? await JournalLine.find({ voucherId: { $in: voucherIds }, ledgerId: cashLedgerId }).lean()
    : [];
  const cashVoucherIds = new Set(cashLines.map((line) => String(line.voucherId)));

  const isReceipt = (v) => cleanLower(v.transactionType) === 'receipt';
  const sorted = [...vouchers].sort((a, b) => {
    if (isReceipt(a) !== isReceipt(b)) return isReceipt(a) ? -1 : 1;
    return compareCodesNumerically(a.voucherNo, b.voucherNo);
  });

  const rows = sorted.map((voucher) => {
    const isCash = cashVoucherIds.has(String(voucher.id || voucher._id));
    const typeName = voucher.voucherCategory || titleCase(voucher.transactionType || '') || 'Voucher';
    const mode = isCash ? 'By Cash' : cleanText(voucher.mode);
    const lines = [];
    if (!isCash && (voucher.instrumentDate || voucher.instrumentNo)) {
      lines.push([formatDmyDashed(voucher.instrumentDate), voucher.instrumentNo].filter(Boolean).join('/'));
    }
    const party = [voucher.partyCode, voucher.partyName].filter(Boolean).join(' ');
    if (party) lines.push(party);
    if (voucher.narration) lines.push(voucher.narration);
    const amount = toNumber(voucher.amount, 0);
    return {
      voucherNo: voucher.voucherNo,
      date: voucher.date,
      group: `${typeName} ${mode}`.trim(),
      lines,
      credit: isReceipt(voucher) ? amount : 0,
      debit: isReceipt(voucher) ? 0 : amount
    };
  });

  return {
    vouchers: withDayBookHeadings(rows),
    openingCash: Number(openingCash.toFixed(2)),
    closingCash: Number(closingCash.toFixed(2)),
    source: 'live'
  };
}

// Voucher Summary, in the legacy layout (CrVchSummry.rpt): the Day Book's
// vouchers grouped by the same heading (transaction type + pay mode), in Day
// Book order, with the voucher count and the Credit (receipts) / Debit
// (payments) total per group, plus the same cash footer. Like the legacy
// report, a group is a run of consecutive vouchers — the same type appearing
// again after a different one starts a new row rather than merging into the
// earlier one (legacy 31-Mar-2025 lists "Transfer Voucher (Receipt) Cheque"
// four times). Matches the legacy captures for 11-Aug-2026 and 31-Mar-2025.
// Returns { rows: [{ voucherType, count, credit, debit }], openingCash, closingCash, source }.
async function buildVoucherSummaryReport({ date = '', dateFrom = '', dateTo = '', user = {} } = {}) {
  const dayBook = await buildDayBookReport({ date, dateFrom, dateTo, user });
  const groups = [];
  for (const voucher of dayBook.vouchers) {
    let row = groups[groups.length - 1];
    if (!row || voucher.heading) {
      row = { voucherType: voucher.group, count: 0, credit: 0, debit: 0 };
      groups.push(row);
    }
    row.count += 1;
    row.credit += toNumber(voucher.credit, 0);
    row.debit += toNumber(voucher.debit, 0);
  }
  return {
    rows: groups.map((row) => ({ ...row, credit: Number(row.credit.toFixed(2)), debit: Number(row.debit.toFixed(2)) })),
    openingCash: dayBook.openingCash,
    closingCash: dayBook.closingCash,
    source: dayBook.source
  };
}

async function buildMonthlySummaryReport({ branchCode = '', month = '', dateFrom = '', dateTo = '', user = {} } = {}) {
  const query = {};
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  if (effectiveBranchCode) {
    query.branchCode = effectiveBranchCode;
  }
  // No month picked -> the whole FY window instead of every voucher ever.
  if (!month && (dateFrom || dateTo)) {
    query.date = {};
    if (dateFrom) query.date.$gte = cleanText(dateFrom);
    if (dateTo) query.date.$lte = cleanText(dateTo);
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

// A demand list's month/year. Lists migrated from legacy keep the real
// DMonth/DYear only in payload.raw (their month column reads "1"), so the
// raw value wins when present.
function demandPeriod(list = {}, line = {}) {
  const raw = list?.payload?.raw || {};
  const lineRaw = line?.payload?.raw || {};
  const month = Number(firstDefined(lineRaw.DMonth, raw.DMonth, list.month)) || 0;
  const year = String(firstDefined(lineRaw.DYear, raw.DYear, list.year) || '');
  return { month, year };
}

// Recovery -> Add From Demand List: the PENDING demand lines of one branch
// and month, with the member's name/designation, for the selection grid.
// Only months inside the active FY are offered, so demand from a closed
// year never enters a current recovery.
async function buildRecoveryDemandCandidates({ branchCode = '', month = '', year = '', fyStart = '', fyEnd = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const monthNumber = Number(month) || 0;
  const lists = (await DemandList.find(effectiveBranchCode ? { branchCode: effectiveBranchCode } : {}).lean())
    .filter((list) => {
      const period = demandPeriod(list);
      if (monthNumber && period.month !== monthNumber) return false;
      if (cleanText(year) && period.year !== cleanText(year)) return false;
      if (fyStart && fyEnd && period.month && period.year) {
        const first = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
        if (first < cleanText(fyStart).slice(0, 10) || first > cleanText(fyEnd).slice(0, 10)) return false;
      }
      return true;
    });
  if (!lists.length) return [];
  const listByKey = new Map(lists.map((list) => [`${list.demandListNo}|${cleanUpper(list.branchCode)}`, list]));
  const lines = (await DemandLine.find({ demandListNo: { $in: [...new Set(lists.map((list) => list.demandListNo))] } }).lean())
    .filter((line) => cleanUpper(line.recoveryStatus) === DEMAND_PENDING && listByKey.has(`${line.demandListNo}|${cleanUpper(line.postedBranch)}`));
  const codes = [...new Set(lines.map((line) => cleanUpper(line.memberCode)))];
  const members = codes.length ? await Member.find({ code: { $in: codes } }).lean() : [];
  const memberByCode = new Map(members.map((member) => [cleanUpper(member.code), member]));
  const branches = await Branch.find({}).lean();
  const branchByCode = new Map(branches.map((branch) => [cleanUpper(branch.code), branch]));

  return lines.map((line) => {
    const list = listByKey.get(`${line.demandListNo}|${cleanUpper(line.postedBranch)}`);
    const member = memberByCode.get(cleanUpper(line.memberCode)) || {};
    const branch = branchByCode.get(cleanUpper(line.postedBranch)) || {};
    const period = demandPeriod(list, line);
    return {
      demandLineId: String(line.id || line._id),
      demandListNo: line.demandListNo,
      demandListDate: cleanText(list.demandListDate).slice(0, 10),
      month: period.month,
      year: period.year,
      memberCode: line.memberCode,
      memberName: member.name || line.memberName || '',
      designation: member.designation || member?.payload?.raw?.Designation || '',
      branchCode: line.postedBranch,
      branchName: branch.place || branch.label || line.postedBranch,
      compulsoryDeposit: toNumber(line.compulsoryDeposit, 0),
      specialDeposit: toNumber(line.specialDeposit, 0),
      regularLoan: toNumber(line.regularLoan, 0),
      loanAgainstDeposit: toNumber(line.loanAgainstDeposit, 0),
      insurancePremium: toNumber(line.insurancePremium, 0),
      other: toNumber(line.other, 0),
      totalAmount: toNumber(line.totalAmount, 0)
    };
  }).sort((a, b) => compareCodesNumerically(a.memberCode, b.memberCode));
}

// ---------------------------------------------------------------------------
// Demand Entry: one demand list (FY, branch, month, year, list no) with one
// line per member holding the demand heads — the same shape as the demand
// migrated from legacy. Share is not a demand head. A line's total is always
// derived from its heads (in paise); new lines are PENDING until a saved
// recovery collects them. Recovered lines are locked here: change or delete
// the recovery first.
// ---------------------------------------------------------------------------
const DEMAND_HEADS = ['compulsoryDeposit', 'specialDeposit', 'regularLoan', 'loanAgainstDeposit', 'insurancePremium', 'other'];

function demandLineTotalPaise(line = {}) {
  return DEMAND_HEADS.reduce((sum, key) => sum + toPaise(line[key] || 0), 0);
}

function demandListLinesOf(list, lines) {
  return lines.filter((line) => line.demandListNo === list.demandListNo && cleanUpper(line.postedBranch) === cleanUpper(list.branchCode));
}

function demandEntrySummary(list, lines, branchByCode = new Map()) {
  const period = demandPeriod(list);
  const own = demandListLinesOf(list, lines);
  const heads = Object.fromEntries(DEMAND_HEADS.map((key) => [key, toRupees(own.reduce((sum, line) => sum + toPaise(line[key] || 0), 0))]));
  const recovered = own.filter((line) => cleanUpper(line.recoveryStatus) === DEMAND_RECOVERED).length;
  const branch = branchByCode.get(cleanUpper(list.branchCode)) || {};
  return {
    id: String(list.id || list._id),
    demandListNo: list.demandListNo,
    demandListDate: cleanText(list.demandListDate).slice(0, 10),
    branchCode: list.branchCode,
    branchName: branch.place || branch.label || list.branchCode,
    month: period.month,
    year: period.year,
    fyCode: list?.payload?.fyCode || '',
    remarks: list.remarks || '',
    memberCount: own.length,
    ...heads,
    totalAmount: toRupees(own.reduce((sum, line) => sum + demandLineTotalPaise(line), 0)),
    pendingCount: own.length - recovered,
    recoveredCount: recovered,
    status: !own.length || !recovered ? DEMAND_PENDING : recovered === own.length ? DEMAND_RECOVERED : 'PARTIAL'
  };
}

async function listDemandEntries({ branchCode = '', fyStart = '', fyEnd = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const lists = (await DemandList.find(effectiveBranchCode ? { branchCode: effectiveBranchCode } : {}).lean()).filter((list) => {
    if (!fyStart || !fyEnd) return true;
    const period = demandPeriod(list);
    if (!period.month || !period.year) return true;
    const first = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    return first >= cleanText(fyStart).slice(0, 10) && first <= cleanText(fyEnd).slice(0, 10);
  });
  const listNos = [...new Set(lists.map((list) => list.demandListNo))];
  const lines = listNos.length ? await DemandLine.find({ demandListNo: { $in: listNos } }).lean() : [];
  const branchByCode = new Map((await Branch.find({}).lean()).map((branch) => [cleanUpper(branch.code), branch]));
  return lists.map((list) => demandEntrySummary(list, lines, branchByCode))
    .sort((a, b) => (`${b.year}-${String(b.month).padStart(2, '0')}`).localeCompare(`${a.year}-${String(a.month).padStart(2, '0')}`)
      || compareCodesNumerically(a.branchCode, b.branchCode));
}

async function getDemandEntry(id, { user = {} } = {}) {
  const list = await DemandList.findById(id).lean();
  if (!list || !canAccessBranchRecord('demandLists', list, user)) return null;
  const lines = demandListLinesOf(list, await DemandLine.find({ demandListNo: list.demandListNo }).lean());
  const members = lines.length ? await Member.find({ code: { $in: lines.map((line) => line.memberCode) } }).lean() : [];
  const memberByCode = new Map(members.map((member) => [cleanUpper(member.code), member]));
  const branchByCode = new Map((await Branch.find({}).lean()).map((branch) => [cleanUpper(branch.code), branch]));
  return {
    ...demandEntrySummary(list, lines, branchByCode),
    lines: lines.map((line) => {
      const member = memberByCode.get(cleanUpper(line.memberCode)) || {};
      return {
        id: String(line.id || line._id),
        memberCode: line.memberCode,
        memberName: member.name || line.memberName || '',
        designation: member.designation || member?.payload?.raw?.Designation || '',
        ...Object.fromEntries(DEMAND_HEADS.map((key) => [key, toNumber(line[key], 0)])),
        totalAmount: toRupees(demandLineTotalPaise(line)),
        recoveryStatus: cleanUpper(line.recoveryStatus) || DEMAND_PENDING,
        recoveryVoucherNo: line?.payload?.recoveryVoucherNo || ''
      };
    }).sort((a, b) => compareCodesNumerically(a.memberCode, b.memberCode))
  };
}

// Load Members: the branch's members with their configured demand split
// (member_demand_defaults) to start the grid from; every amount is editable.
async function getDemandEntryMembers({ branchCode = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  if (!effectiveBranchCode) throw recoveryHttpError('Choose a branch first.');
  const members = (await Member.find({ branchCode: effectiveBranchCode }).lean())
    .filter((member) => !member.dismembered && !cleanLower(member.status).startsWith('inact'));
  const defaults = members.length ? await MemberDemandDefault.find({ memberCode: { $in: members.map((member) => member.code) } }).lean() : [];
  const defaultByCode = new Map(defaults.map((row) => [cleanUpper(row.memberCode), row]));
  return members.map((member) => {
    const preset = defaultByCode.get(cleanUpper(member.code)) || {};
    return {
      memberCode: member.code,
      memberName: member.name || '',
      designation: member.designation || member?.payload?.raw?.Designation || '',
      ...Object.fromEntries(DEMAND_HEADS.map((key) => [key, toNumber(preset[key], 0)]))
    };
  }).sort((a, b) => compareCodesNumerically(a.memberCode, b.memberCode));
}

function demandHeaderFrom(data = {}, { fyStart = '', fyEnd = '' } = {}) {
  const header = {
    demandListNo: cleanUpper(data.demandListNo),
    demandListDate: cleanText(data.demandListDate).slice(0, 10),
    branchCode: cleanUpper(data.branchCode),
    month: Number(data.month) || 0,
    year: cleanText(data.year),
    remarks: cleanText(data.remarks),
    fyCode: cleanText(data.fyCode)
  };
  if (!header.demandListNo) throw recoveryHttpError('Enter the demand list number.');
  if (!header.branchCode) throw recoveryHttpError('Choose the branch.');
  if (header.month < 1 || header.month > 12) throw recoveryHttpError('Choose the demand month.');
  if (!/^\d{4}$/.test(header.year)) throw recoveryHttpError('Enter the demand year (e.g. 2026).');
  if (fyStart && fyEnd) {
    const first = `${header.year}-${String(header.month).padStart(2, '0')}-01`;
    if (first < cleanText(fyStart).slice(0, 10) || first > cleanText(fyEnd).slice(0, 10)) {
      throw recoveryHttpError('The demand month is outside the selected financial year.');
    }
  }
  return header;
}

// Member lines: heads must be numbers >= 0; total is derived; a member may
// appear once; a member with every head nil is left out.
function demandLinesFrom(lines = []) {
  const seen = new Set();
  const result = [];
  toArray(lines).forEach((line, index) => {
    const memberCode = cleanUpper(line.memberCode);
    if (!memberCode) throw recoveryHttpError(`Line ${index + 1}: member is required.`);
    if (seen.has(memberCode)) throw recoveryHttpError(`Member ${memberCode} is entered twice.`);
    seen.add(memberCode);
    const heads = {};
    for (const key of DEMAND_HEADS) {
      const paise = toPaise(line[key] || 0);
      if (!Number.isFinite(paise) || paise < 0) throw recoveryHttpError(`Member ${memberCode}: amounts must be zero or more.`);
      heads[key] = toRupees(paise);
    }
    const totalPaise = demandLineTotalPaise(heads);
    if (totalPaise > 0) result.push({ memberCode, ...heads, totalAmount: toRupees(totalPaise) });
  });
  return result;
}

async function saveDemandEntry(data = {}, { id = '', fyStart = '', fyEnd = '', user = {} } = {}) {
  const header = demandHeaderFrom(data, { fyStart, fyEnd });
  header.branchCode = resolveBranchCode(user, header.branchCode);
  if (!(await Branch.findOne({ code: header.branchCode }).lean())) throw recoveryHttpError(`Unknown branch ${header.branchCode}.`);
  const lines = demandLinesFrom(data.lines);
  if (!lines.length) throw recoveryHttpError('Enter a demand amount for at least one member.');
  const members = await Member.find({ code: { $in: lines.map((line) => line.memberCode) } }).lean();
  const memberByCode = new Map(members.map((member) => [cleanUpper(member.code), member]));
  const unknown = lines.filter((line) => !memberByCode.has(line.memberCode)).map((line) => line.memberCode);
  if (unknown.length) throw recoveryHttpError(`Unknown member code(s): ${unknown.join(', ')}.`);

  const current = id ? await DemandList.findById(id).lean() : null;
  if (id && !current) return null;
  const clash = (await DemandList.find({ demandListNo: header.demandListNo }).lean())
    .find((list) => cleanUpper(list.branchCode) === header.branchCode && String(list.id || list._id) !== String(id || ''));
  if (clash) throw recoveryHttpError(`Demand list ${header.demandListNo} already exists for branch ${header.branchCode}.`, 409);

  const existing = current ? demandListLinesOf(current, await DemandLine.find({ demandListNo: current.demandListNo }).lean()) : [];
  const recovered = existing.filter((line) => cleanUpper(line.recoveryStatus) === DEMAND_RECOVERED);
  if (recovered.length) {
    const period = demandPeriod(current);
    if (current.demandListNo !== header.demandListNo || cleanUpper(current.branchCode) !== header.branchCode
      || period.month !== header.month || period.year !== header.year) {
      throw recoveryHttpError('This demand list has recovered members, so its number, branch, month and year cannot change.', 409);
    }
    const submitted = new Map(lines.map((line) => [line.memberCode, line]));
    for (const line of recovered) {
      const next = submitted.get(cleanUpper(line.memberCode));
      if (!next || DEMAND_HEADS.some((key) => toPaise(next[key]) !== toPaise(line[key] || 0))) {
        throw recoveryHttpError(`Member ${line.memberCode}'s demand has already been recovered${line?.payload?.recoveryVoucherNo ? ` (recovery voucher ${line.payload.recoveryVoucherNo})` : ''}. Edit or delete the linked recovery first.`, 409);
      }
    }
  }

  const listDoc = {
    demandListNo: header.demandListNo,
    demandListDate: header.demandListDate,
    branchCode: header.branchCode,
    month: String(header.month),
    year: header.year,
    status: DEMAND_PENDING,
    remarks: header.remarks,
    // The real month/year live in the columns for lists entered here; only
    // migrated lists need payload.raw (see demandPeriod).
    payload: { ...(current?.payload || {}), fyCode: header.fyCode, raw: undefined }
  };
  delete listDoc.payload.raw;

  const listId = await withTransaction(async (tx) => {
    let savedId = id;
    if (current) {
      await DemandList.findByIdAndUpdate(id, listDoc, { new: true }).tx(tx);
    } else {
      const created = await DemandList.create(listDoc, { tx });
      savedId = String(created.id || created._id);
    }
    const existingByCode = new Map(existing.map((line) => [cleanUpper(line.memberCode), line]));
    for (const line of lines) {
      const before = existingByCode.get(line.memberCode);
      if (before && cleanUpper(before.recoveryStatus) === DEMAND_RECOVERED) continue;
      const doc = {
        demandListNo: header.demandListNo,
        memberCode: line.memberCode,
        memberName: memberByCode.get(line.memberCode).name || '',
        postedBranch: header.branchCode,
        ...Object.fromEntries(DEMAND_HEADS.map((key) => [key, line[key]])),
        totalAmount: line.totalAmount,
        recoveredAmount: 0,
        recoveryStatus: DEMAND_PENDING
      };
      // A pending line keeps its id, so a recovery draft that loaded it
      // still links to the same demand line.
      if (before) await DemandLine.findByIdAndUpdate(String(before.id || before._id), doc, { new: true }).tx(tx);
      else await DemandLine.create(doc, { tx });
    }
    const kept = new Set(lines.map((line) => line.memberCode));
    for (const line of existing) {
      if (!kept.has(cleanUpper(line.memberCode)) && cleanUpper(line.recoveryStatus) !== DEMAND_RECOVERED) {
        await DemandLine.findByIdAndDelete(String(line.id || line._id)).tx(tx);
      }
    }
    return savedId;
  });
  return getDemandEntry(listId, { user });
}

async function deleteDemandEntry(id, { user = {} } = {}) {
  const list = await DemandList.findById(id).lean();
  if (!list || !canAccessBranchRecord('demandLists', list, user)) return false;
  await assertDemandNotRecovered('demandLists', id, { deleting: true });
  const lines = demandListLinesOf(list, await DemandLine.find({ demandListNo: list.demandListNo }).lean());
  await withTransaction(async (tx) => {
    for (const line of lines) await DemandLine.findByIdAndDelete(String(line.id || line._id)).tx(tx);
    await DemandList.findByIdAndDelete(id).tx(tx);
  });
  return true;
}

async function buildDemandListReport({ month = '', year = '', date = '', fyStart = '', fyEnd = '', branchCode = '', user = {} } = {}) {
  const query = {};
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  if (effectiveBranchCode) {
    query.branchCode = effectiveBranchCode;
  }

  const monthNumber = month ? Number(month) : 0;
  // FY start year (1 April); Jan-Mar demand lists carry the following
  // calendar year.
  const fyStartYear = parseInt(cleanText(fyStart).slice(0, 4), 10);
  let effectiveYear = cleanText(year);
  if (!effectiveYear && date) {
    const parsedDate = new Date(cleanText(date));
    if (!isNaN(parsedDate.getTime())) effectiveYear = String(parsedDate.getFullYear());
  }
  if (!effectiveYear && monthNumber && Number.isFinite(fyStartYear)) {
    effectiveYear = String(monthNumber >= 4 ? fyStartYear : fyStartYear + 1);
  }

  // Join DemandList → DemandLine for member-level detail
  let lists = await DemandList.find(query).sort({ updatedAt: -1 }).lean();
  // demandPeriod: migrated lists keep their real month only in payload.raw.
  if (monthNumber) {
    lists = lists.filter((l) => demandPeriod(l).month === monthNumber);
  }
  if (effectiveYear) {
    lists = lists.filter((l) => demandPeriod(l).year === effectiveYear);
  } else if (Number.isFinite(fyStartYear)) {
    lists = lists.filter((l) => {
      const period = demandPeriod(l);
      return period.year === String(period.month >= 4 ? fyStartYear : fyStartYear + 1);
    });
  }

  if (lists.length === 0) {
    return [];
  }

  const listNos = [...new Set(lists.map((l) => l.demandListNo))];
  const lineQuery = { demandListNo: { $in: listNos } };
  if (effectiveBranchCode) {
    lineQuery.postedBranch = effectiveBranchCode;
  }
  const lines = await DemandLine.find(lineQuery).lean();
  const memberCodes = [...new Set(lines.map((line) => cleanUpper(line.memberCode)).filter(Boolean))];
  const members = memberCodes.length ? await Member.find({ code: { $in: memberCodes } }).lean() : [];
  const memberByCode = new Map(members.map((m) => [cleanUpper(m.code), m]));
  const listByKey = new Map(lists.map((l) => [`${l.demandListNo}|${l.branchCode}`, l]));

  return lines.map((line) => {
    const list = listByKey.get(`${line.demandListNo}|${line.postedBranch}`) || {};
    const member = memberByCode.get(cleanUpper(line.memberCode)) || {};
    return {
      demandListNo: line.demandListNo,
      memberCode: line.memberCode,
      memberName: line.memberName,
      designation: member.designation || '',
      branchCode: line.postedBranch || list.branchCode || '',
      month: demandPeriod(list, line).month || list.month || '',
      cd: toNumber(line.compulsoryDeposit, 0),
      ssa: toNumber(line.specialDeposit, 0),
      regularLoan: toNumber(line.regularLoan, 0),
      loanAgainstDeposit: toNumber(line.loanAgainstDeposit, 0),
      other: toNumber(line.other, 0) + toNumber(line.insurancePremium, 0),
      total: toNumber(line.totalAmount, 0),
      recovered: toNumber(line.recoveredAmount, 0),
      pending: Math.max(0, toNumber(line.totalAmount, 0) - toNumber(line.recoveredAmount, 0)),
      status: line.recoveryStatus,
      recoveryVoucherNo: line?.payload?.recoveryVoucherNo || ''
    };
  });
}

async function buildAllMemberListReport({ branchCode = '', uptoDate = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const query = effectiveBranchCode ? { branchCode: effectiveBranchCode } : {};
  const cutoff = cleanText(uptoDate);
  // Members who had not joined by the selected FY's end are left out. Only
  // ISO-dated membershipDate values are compared; anything else stays listed.
  const rows = (await Member.find(query).sort({ name: 1 }).lean()).filter((row) => {
    const joined = cleanText(row.membershipDate).slice(0, 10);
    return !cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(joined) || joined <= cutoff;
  });
  const branches = await Branch.find({}).lean();
  const branchByCode = new Map(branches.map((b) => [cleanUpper(b.code), b]));

  return rows.map((row) => {
    const branch = branchByCode.get(cleanUpper(row.branchCode)) || {};
    return {
      code: row.code,
      name: row.name,
      fatherOrHusbandName: row.fatherOrHusbandName || '',
      branchCode: row.branchCode,
      branchName: branch.label || branch.place || row.branchCode || '',
      designation: row.designation || '',
      caste: row.caste || '',
      district: branch.district || '',
      category: row.category,
      membershipNo: row.membershipNo,
      membershipDate: row.membershipDate,
      status: row.status
    };
  });
}

// Legacy ReportData 'INCOME AND EXPENSES' (printed as "Statement of Receipt
// And Payment Account"): every non-zero Liabilities + Income ledger on the
// receipt (INCOME) side and every non-zero Assets + Expenses ledger on the
// payment (EXPENDITURE) side, cumulative to the as-on date and sorted by name,
// with the Profit & Loss A/c ledger (Primary) last on the payment side —
// which is what makes the two sides agree (FY 2024-25: 261,080,744.42 both).
async function buildPaymentReceiptStatementReport({ dateFrom = '', dateTo = '', branchCode = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const uptoDate = dateTo || dateFrom || '';
  const snapshots = await getLedgerSnapshots({ uptoDate, branchCode: effectiveBranchCode });
  const isPrimary = (row) => row.nature === 'PRIMARY' || cleanUpper(row.group) === 'PRIMARY';
  const byName = (a, b) => String(a.ledgerName || '').localeCompare(String(b.ledgerName || ''), 'en', { sensitivity: 'base' });
  const toRow = (row, creditSide) => ({
    ledgerCode: row.code,
    ledgerName: row.name,
    group: row.group,
    amount: sideAmount(row, creditSide)
  });
  const nonZero = (row) => Math.abs(row.amount) >= 0.005;

  const receipts = snapshots
    .filter((row) => !isPrimary(row) && (row.nature === 'LIABILITY' || row.nature === 'INCOME'))
    .map((row) => toRow(row, true))
    .filter(nonZero)
    .sort(byName);
  const payments = snapshots
    .filter((row) => !isPrimary(row) && (row.nature === 'ASSET' || row.nature === 'EXPENSE'))
    .map((row) => toRow(row, false))
    .filter(nonZero)
    .sort(byName);
  const profitLossLedgers = snapshots.filter(isPrimary);
  const profitLoss = Number(profitLossLedgers.reduce((total, row) => total + sideAmount(row, false), 0).toFixed(2));
  if (Math.abs(profitLoss) >= 0.005) {
    payments.push({ ledgerCode: profitLossLedgers[0]?.code || '', ledgerName: 'Profit & Loss A/c', group: 'PRIMARY', amount: profitLoss });
  }

  return {
    asOnDate: uptoDate,
    receipts,
    payments,
    receiptTotal: sumAmounts(receipts),
    paymentTotal: sumAmounts(payments)
  };
}

// Legacy "LIST OF BRANCH" (ReportData 'BRANCH LIST'): branches grouped by
// their District text exactly as typed (legacy keeps "RAIPUR ( C . G . )" and
// "RAIPUR ( C .G . )" as separate groups), districts and branches by name.
async function buildBranchListReport({ branchCode = '', user = {} } = {}) {
  const effectiveBranchCode = resolveBranchCode(user, branchCode);
  const query = effectiveBranchCode ? { code: effectiveBranchCode } : {};
  const byText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'en', { sensitivity: 'base' });
  const rows = (await Branch.find(query).lean())
    .sort((a, b) => byText(a.district, b.district) || byText(a.place, b.place) || compareCodesNumerically(a.code, b.code));
  return rows.map((row) => ({
    code: row.code,
    headOfficeCode: row.headOfficeCode || SOCIETY_SEED.code,
    place: row.place,
    district: row.district || '',
    phone: cleanText(row.phone),
    address: cleanText(row.address)
  }));
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
  return await getNextSequenceValue('vouchers', 'voucherNo');
}

async function getNextTransactionNo(branchCode = '') {
  return await getNextSequenceValue('bank_transactions', 'transactionNo');
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
  const details = sanitizeBankVoucherDetails(data.details);
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
    referenceNo: cleanText(data.referenceNo),
    instrumentNo: cleanText(data.instrumentNo),
    instrumentDate: cleanText(data.instrumentDate),
    branchCode: cleanUpper(data.branchCode),
    fyCode: cleanUpper(data.fyCode),
    amount: toNumber(data.amount, 0),
    narration: cleanText(data.narration),
    approvedBy: cleanText(data.approvedBy),
    createdBy: cleanText(data.createdBy),
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

// ---------------------------------------------------------------------------
// Recovery From Member: draft lines -> recovery_lines, and Demand links.
//
// The entry screen keeps each member line as { member, heads: { share, cd,
// ssa, loan, lad, ins, admfee, suspense }, source, demandLineId, ... } (also
// the shape kept in voucher.details.recoveryLines so a saved voucher reopens
// in the same grid). Posting and recovery_lines use the column names below,
// so every line is converted here, totals recalculated in paise, before the
// voucher is saved. A line from Add From Demand List carries the exact
// demand_lines id it was loaded from; only that id is ever marked recovered.
// ---------------------------------------------------------------------------
const RECOVERY_KEY = 'recovery-member';
const DEMAND_PENDING = 'PENDING';
const DEMAND_RECOVERED = 'RECOVERED';

function recoveryHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function toRecoveryLine(line = {}, index = 0) {
  const heads = line.heads || {};
  const amount = (...values) => {
    const paise = toPaise(firstDefined(...values) || 0);
    if (!Number.isFinite(paise) || paise < 0) {
      throw recoveryHttpError(`Recovery line ${index + 1}: amounts must be zero or more.`);
    }
    return paise;
  };
  const paise = {
    share: amount(heads.share, line.share),
    compulsoryDeposit: amount(heads.cd, heads.compulsoryDeposit, line.compulsoryDeposit),
    specialDeposit: amount(heads.ssa, line.specialDeposit, line.ssa),
    regularLoan: amount(heads.loan, line.regularLoan),
    depositLoan: amount(heads.lad, line.depositLoan, line.loanAgainstDeposit),
    premium: amount(heads.ins, heads.insurance, line.premium, line.insurancePremium),
    admission: amount(heads.admfee, line.admission),
    suspense: amount(heads.suspense, line.suspense)
  };
  const totalPaise = Object.values(paise).reduce((sum, value) => sum + value, 0);
  const memberCode = cleanUpper(line.memberCode || line.member);
  if (!memberCode) throw recoveryHttpError(`Recovery line ${index + 1}: member is required.`);
  if (totalPaise <= 0) throw recoveryHttpError(`Recovery line ${index + 1} (${memberCode}): enter at least one recovered amount.`);
  return {
    memberCode,
    demandLineId: cleanText(line.demandLineId) || null,
    ...Object.fromEntries(Object.entries(paise).map(([key, value]) => [key, toRupees(value)])),
    total: toRupees(totalPaise),
    payload: {
      source: cleanUpper(line.source) || (line.demandLineId ? 'DEMAND' : 'MANUAL'),
      demandListNo: cleanText(line.demandListNo) || null,
      importBatchId: cleanText(line.importBatchId) || null,
      importRowId: cleanText(line.importRowId) || null
    }
  };
}

// Converts and validates a recovery voucher's lines: members must exist, a
// demand line may be used once. Returns the recovery_lines rows and the
// recalculated voucher amount; other vouchers pass through untouched.
async function prepareRecoveryLines(payload) {
  if (payload?.details?.key !== RECOVERY_KEY) return { lines: payload?.details?.recoveryLines || [], links: [] };
  const draftLines = toArray(payload.details.recoveryLines);
  if (!draftLines.length) throw recoveryHttpError('Add at least one member line before saving the recovery.');
  const lines = draftLines.map((line, index) => toRecoveryLine(line, index));

  const codes = [...new Set(lines.map((line) => line.memberCode))];
  const known = new Set((await Member.find({ code: { $in: codes } }).lean()).map((member) => cleanUpper(member.code)));
  const unknown = codes.filter((code) => !known.has(code));
  if (unknown.length) throw recoveryHttpError(`Unknown member code(s): ${unknown.join(', ')}.`);

  const links = lines.map((line) => line.demandLineId).filter(Boolean);
  const duplicate = links.find((id, index) => links.indexOf(id) !== index);
  if (duplicate) throw recoveryHttpError('The same demand line is added twice in this recovery. Remove the duplicate row.');

  payload.amount = toRupees(lines.reduce((sum, line) => sum + toPaise(line.total), 0));
  return { lines, links };
}

// Moves exactly the demand lines whose link changed, inside the voucher's
// own transaction: removed links back to PENDING, added links to RECOVERED.
// The RECOVERED update only succeeds on a line that is still PENDING, for the
// same member, so a line recovered meanwhile by someone else (or edited
// away) fails the whole save and everything rolls back.
async function reconcileDemandLinks(tx, { voucherId, voucherNo, oldLinks = [], newLinks = [], memberByLink = new Map() }) {
  const oldSet = new Set(oldLinks);
  const newSet = new Set(newLinks);
  const removed = [...oldSet].filter((id) => !newSet.has(id));
  const added = [...newSet].filter((id) => !oldSet.has(id));

  for (const id of removed) {
    await tx.query(
      `UPDATE demand_lines SET "recoveryStatus" = $2, "updatedAt" = NOW(),
         payload = COALESCE(payload, '{}'::jsonb) - 'recoveryVoucherId' - 'recoveryVoucherNo'
       WHERE id = $1 AND payload->>'recoveryVoucherId' = $3`,
      [id, DEMAND_PENDING, voucherId]
    );
  }
  for (const id of added) {
    const result = await tx.query(
      `UPDATE demand_lines SET "recoveryStatus" = $2, "updatedAt" = NOW(),
         payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('recoveryVoucherId', $3::text, 'recoveryVoucherNo', $4::text)
       WHERE id = $1 AND "deletedAt" IS NULL AND UPPER(COALESCE("recoveryStatus", '')) = $5
         AND UPPER(COALESCE("memberCode", '')) = $6
       RETURNING id`,
      [id, DEMAND_RECOVERED, voucherId, String(voucherNo || ''), DEMAND_PENDING, memberByLink.get(id) || '']
    );
    if (!result.rowCount) {
      throw recoveryHttpError('A demand line in this recovery is no longer pending (already recovered, removed, or for a different member). Reload the demand list and try again.', 409);
    }
  }
  return { removed, added };
}

function recoveryLineRows(lines, voucherId, voucherNo) {
  return lines.map((line) => ({ ...line, voucherId, voucherNo }));
}

// Fields every voucher form marks required (*): the date on all of them, the
// mode on the member forms. Without a date a voucher drops out of every
// date-based report (Day Book, Cash Book, ledgers), so it is refused here,
// whatever screen or API call sends it.
const MODE_REQUIRED_KEYS = new Set(['loan-paid-member', 'deposit-paid-member', 'insurance-paid-member', 'ssa-paid-member', RECOVERY_KEY]);

// `submitted` is the request as sent: normalizeVoucher fills an empty mode
// with the catalog's description ("Cash / Transfer", "Cash / Cheque"), which
// is not a payment mode — the form shows it as "Select mode" — so the mode is
// checked before that fallback.
function assertVoucherBasics(payload = {}, submitted = {}) {
  const date = cleanText(payload.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw recoveryHttpError('Enter the voucher date.');
  }
  const key = payload?.details?.key;
  if (MODE_REQUIRED_KEYS.has(key)) {
    const mode = cleanText(submitted.mode);
    if (!mode || mode === cleanText(getTransactionCatalogItemByKey(key)?.mode)) {
      throw recoveryHttpError('Choose the payment mode.');
    }
  }
}

async function createVoucher(data = {}, meta = {}) {
  return withTransaction(async (tx) => {
    const branchCode = resolveBranchCode(meta.actorUser || {}, data.branchCode);
    const voucherNo = cleanText(data.voucherNo) || await getNextVoucherNo(branchCode);
    const payload = normalizeVoucher({ ...data, voucherNo, branchCode });
    assertVoucherBasics(payload, data);
    if (meta.actorUserId) {
      payload.createdByUserId = meta.actorUserId;
      payload.updatedByUserId = meta.actorUserId;
    }
    
    const recovery = await prepareRecoveryLines(payload);
    const journalLines = await buildJournalLinesForVoucher(payload, { ...meta, tx, recoveryLines: recovery.lines });

    const record = await Voucher.create(payload, { tx });
    const recordId = String(record._id || record.id);

    if (recovery.lines.length > 0) {
      await RecoveryLine.insertMany(recoveryLineRows(recovery.lines, recordId, record.voucherNo), { tx });
    }
    if (recovery.links.length) {
      await reconcileDemandLinks(tx, {
        voucherId: recordId,
        voucherNo: record.voucherNo,
        newLinks: recovery.links,
        memberByLink: new Map(recovery.lines.filter((line) => line.demandLineId).map((line) => [line.demandLineId, line.memberCode]))
      });
    }

    const journalLinesToInsert = journalLines.map(line => ({
      ...line,
      voucherId: String(record._id || record.id),
      voucherNo: record.voucherNo
    }));
    await JournalLine.insertMany(journalLinesToInsert, { tx });

    const response = sanitizeVoucherResponse(record);
    await notifySafely(buildVoucherNotificationPayload('created', response, meta));
    return response;
  });
}

async function updateVoucher(id, data = {}, meta = {}) {
  return withTransaction(async (tx) => {
    const current = await Voucher.findById(id);
    if (!current) return null;
    const payload = normalizeVoucher({ ...current.toObject(), ...data });
    assertVoucherBasics(payload, { ...current.toObject(), ...data });
    payload.branchCode = resolveBranchCode(meta.actorUser || {}, current.branchCode);
    if (meta.actorUserId) {
      payload.updatedByUserId = meta.actorUserId;
    }
    
    const recovery = await prepareRecoveryLines(payload);
    const journalLines = await buildJournalLinesForVoucher(payload, { ...meta, tx, recoveryLines: recovery.lines });
    // Demand lines this voucher held before the edit (its own recovery_lines).
    const oldLinks = (await RecoveryLine.find({ voucherId: id }).lean())
      .map((line) => cleanText(line.demandLineId)).filter(Boolean);

    await Voucher.findByIdAndUpdate(id, payload, { new: true }).tx(tx);

    if (payload.details && payload.details.recoveryLines) {
      await RecoveryLine.deleteMany({ voucherId: id }, { tx });
      if (recovery.lines.length > 0) {
        await RecoveryLine.insertMany(recoveryLineRows(recovery.lines, id, payload.voucherNo || current.voucherNo), { tx });
      }
    }
    if (oldLinks.length || recovery.links.length) {
      await reconcileDemandLinks(tx, {
        voucherId: id,
        voucherNo: payload.voucherNo || current.voucherNo,
        oldLinks,
        newLinks: recovery.links,
        memberByLink: new Map(recovery.lines.filter((line) => line.demandLineId).map((line) => [line.demandLineId, line.memberCode]))
      });
    }
    
    await JournalLine.deleteMany({ voucherId: id }, { tx });
    const journalLinesToInsert = journalLines.map(line => ({
      ...line,
      voucherId: id,
      voucherNo: payload.voucherNo || current.voucherNo
    }));
    await JournalLine.insertMany(journalLinesToInsert, { tx });

    const response = sanitizeVoucherResponse({ ...current.toObject(), ...payload });
    await notifySafely(buildVoucherNotificationPayload('updated', response, meta));
    return response;
  });
}

async function deleteVoucher(id) {
  return withTransaction(async (tx) => {
    const oldLinks = (await RecoveryLine.find({ voucherId: id }).lean())
      .map((line) => cleanText(line.demandLineId)).filter(Boolean);
    const record = await Voucher.findByIdAndDelete(id).tx(tx);
    if (!record) return false;
    await RecoveryLine.deleteMany({ voucherId: id }, { tx });
    // Its demand lines go back to pending for the next recovery.
    if (oldLinks.length) await reconcileDemandLinks(tx, { voucherId: id, oldLinks, newLinks: [] });
    await JournalLine.deleteMany({ voucherId: id }, { tx });
    await deleteDocumentFiles(record.documents || {});
    return true;
  });
}

// Mirrors deleteVoucher's reach: restoring a voucher must also restore the
// recovery_lines/journal_lines it soft-deleted alongside it, or the voucher
// would come back with no journal entries / recovery breakdown.
async function restoreVoucher(id) {
  const voucher = await Voucher.findById(id).withDeleted().lean();
  if (!voucher || !voucher.deletedAt) return false;

  // Deleting returned its demand lines to pending; take them back first, and
  // refuse if another recovery has collected any of them since.
  const linked = (await RecoveryLine.find({ voucherId: id }).withDeleted().lean()).filter((line) => cleanText(line.demandLineId));
  if (linked.length) {
    await withTransaction((tx) => reconcileDemandLinks(tx, {
      voucherId: id,
      voucherNo: voucher.voucherNo,
      newLinks: linked.map((line) => cleanText(line.demandLineId)),
      memberByLink: new Map(linked.map((line) => [cleanText(line.demandLineId), cleanUpper(line.memberCode)]))
    }));
  }

  const restored = await restoreMainRow('vouchers', id);
  if (!restored) return false;

  const recoveryLines = await RecoveryLine.find({ voucherId: id }).withDeleted().lean();
  for (const line of recoveryLines) {
    if (line.deletedAt) await restoreMainRow('recovery_lines', line.id);
  }
  const journalLines = await JournalLine.find({ voucherId: id }).withDeleted().lean();
  for (const line of journalLines) {
    if (line.deletedAt) await restoreMainRow('journal_lines', line.id);
  }
  return true;
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



async function buildMemberAccountStatement({ memberId, dateFrom, dateTo, user }) {
  const member = await Member.findOne({ code: cleanUpper(memberId) }).lean();
  if (!member) return { member: null, statement: [] };

  const branchCode = resolveBranchCode(user);
  const query = {};
  if (branchCode) query.branchCode = branchCode;
  if (dateTo) query.date = { $lte: cleanText(dateTo) };

  const vouchers = await Voucher.find(query).sort({ date: 1, createdAt: 1 }).lean();
  const balancesObj = typeof member.balances === 'string' ? JSON.parse(member.balances || '{}') : (member.balances || {});

  let components = {
    share: { balance: toPaise(balancesObj.share || 0), dr: 0, cr: 0, opening: toPaise(balancesObj.share || 0) },
    specialDeposit: { balance: toPaise(balancesObj.specialDeposit || balancesObj.ssa || 0), dr: 0, cr: 0, opening: toPaise(balancesObj.specialDeposit || balancesObj.ssa || 0) },
    compulsoryDeposit: { balance: toPaise(balancesObj.compulsoryDeposit || balancesObj.cd || 0), dr: 0, cr: 0, opening: toPaise(balancesObj.compulsoryDeposit || balancesObj.cd || 0) },
    loan: { balance: toPaise(balancesObj.loan || balancesObj.regularLoan || 0), dr: 0, cr: 0, opening: toPaise(balancesObj.loan || balancesObj.regularLoan || 0) },
    loanAgainstDeposit: { balance: toPaise(balancesObj.loanAgainstDeposit || balancesObj.lad || 0), dr: 0, cr: 0, opening: toPaise(balancesObj.loanAgainstDeposit || balancesObj.lad || 0) }
  };

  const fromDateStr = cleanText(dateFrom);
  const voucherIds = vouchers.map(v => String(v._id || v.id));
  const voucherNos = vouchers.map(v => v.voucherNo).filter(Boolean);
  const recoveryLinesAll = await RecoveryLine.find({ 
    memberCode: member.code, 
    $or: [{ voucherId: { $in: voucherIds } }, { voucherNo: { $in: voucherNos } }]
  }).lean();

  for (const voucher of vouchers) {
    const voucherMember = getPartyMemberCode(voucher);
    const lineMatch = recoveryLinesAll.find((line) => line.voucherNo === String(voucher._id || voucher.id) || line.voucherNo === voucher.voucherNo);
    const isPartyMatch = voucherMember && voucherMember === member.code;

    if (!isPartyMatch && !lineMatch) continue;

    const isOpening = fromDateStr && voucher.date < fromDateStr;

    let dr = { share: 0, specialDeposit: 0, compulsoryDeposit: 0, loan: 0, loanAgainstDeposit: 0 };
    let cr = { share: 0, specialDeposit: 0, compulsoryDeposit: 0, loan: 0, loanAgainstDeposit: 0 };

    if (lineMatch) {
      cr.share = toPaise(lineMatch.share);
      cr.specialDeposit = toPaise(lineMatch.specialDeposit || lineMatch.ssa);
      cr.compulsoryDeposit = toPaise(lineMatch.compulsoryDeposit);
      cr.loan = toPaise(lineMatch.regularLoan);
      cr.loanAgainstDeposit = toPaise(lineMatch.loanAgainstDeposit || lineMatch.depositLoan);
    } else {
      const vc = voucher.details?.components || {};
      const key = voucher.details?.key || '';
      
      if (key === 'loan-paid-member') {
        dr.loan = toPaise(vc.loanAmt);
        dr.loanAgainstDeposit = toPaise(vc.lad);
      } else if (key === 'deposit-paid-member') {
        dr.compulsoryDeposit = toPaise(vc.cd || voucher.amount);
      } else if (key === 'ssa-paid-member') {
        dr.specialDeposit = toPaise(vc.specialDeposit || vc.ssa || voucher.amount);
      } else if (key === 'share-paid-member') {
        dr.share = toPaise(vc.share || voucher.amount);
      } else if (cleanLower(voucher.accent) === 'pink' || cleanLower(voucher.transactionType) === 'payment') {
        dr.loan = toPaise(voucher.amount);
      } else {
        cr.loan = toPaise(voucher.amount);
      }
    }

    // Apply to balance (Intentional Modernization: Loans are Assets, DR increases, CR decreases. Deposits are Liabilities, DR decreases, CR increases)
    // Actually, in the account statement UI, we usually just want absolute positive balances.
    components.share.balance += cr.share - dr.share;
    components.specialDeposit.balance += cr.specialDeposit - dr.specialDeposit;
    components.compulsoryDeposit.balance += cr.compulsoryDeposit - dr.compulsoryDeposit;
    components.loan.balance += dr.loan - cr.loan;
    components.loanAgainstDeposit.balance += dr.loanAgainstDeposit - cr.loanAgainstDeposit;

    if (isOpening) {
      components.share.opening = components.share.balance;
      components.specialDeposit.opening = components.specialDeposit.balance;
      components.compulsoryDeposit.opening = components.compulsoryDeposit.balance;
      components.loan.opening = components.loan.balance;
      components.loanAgainstDeposit.opening = components.loanAgainstDeposit.balance;
    } else {
      components.share.dr += dr.share; components.share.cr += cr.share;
      components.specialDeposit.dr += dr.specialDeposit; components.specialDeposit.cr += cr.specialDeposit;
      components.compulsoryDeposit.dr += dr.compulsoryDeposit; components.compulsoryDeposit.cr += cr.compulsoryDeposit;
      components.loan.dr += dr.loan; components.loan.cr += cr.loan;
      components.loanAgainstDeposit.dr += dr.loanAgainstDeposit; components.loanAgainstDeposit.cr += cr.loanAgainstDeposit;
    }
  }

  const labels = {
    share: 'Share',
    specialDeposit: 'Special Deposit',
    compulsoryDeposit: 'Compulsory Deposit',
    loan: 'Regular Loan',
    loanAgainstDeposit: 'Loan Against Deposit'
  };

  const results = Object.keys(components).map(key => ({
    head: labels[key],
    opening: Number((components[key].opening / 100).toFixed(2)),
    debit: Number((components[key].dr / 100).toFixed(2)),
    credit: Number((components[key].cr / 100).toFixed(2)),
    closing: Number((Math.abs(components[key].balance) / 100).toFixed(2))
  }));

  return { 
    member: { 
      code: member.code, 
      name: member.name, 
      dismembered: !!member.isDismembered,
      interest: 'pending' // Intentional modernization per requirements
    }, 
    statement: results 
  };
}

async function buildEmployeeAccountStatement({ employeeId, dateFrom, dateTo, user }) {
  const employee = await Employee.findOne({ code: cleanUpper(employeeId) }).lean();
  if (!employee) return { employee: null, statement: [] };

  const branchCode = resolveBranchCode(user);
  const query = {};
  if (branchCode) query.branchCode = branchCode;
  if (dateTo) query.date = { $lte: cleanText(dateTo) };

  const vouchers = await Voucher.find(query).sort({ date: 1, createdAt: 1 }).lean();
  
  let components = {
    house: { balance: toPaise(employee.homeLoanBalance || 0), dr: 0, cr: 0, opening: toPaise(employee.homeLoanBalance || 0) },
    vehicle: { balance: toPaise(employee.vehicleLoanBalance || 0), dr: 0, cr: 0, opening: toPaise(employee.vehicleLoanBalance || 0) },
    grain: { balance: toPaise(employee.grainAdvanceBalance || 0), dr: 0, cr: 0, opening: toPaise(employee.grainAdvanceBalance || 0) }
  };

  const fromDateStr = cleanText(dateFrom);

  for (const voucher of vouchers) {
    if (cleanUpper(voucher.partyCode) !== employee.code || cleanUpper(voucher.partyType) !== 'EMPLOYEE') continue;

    const isOpening = fromDateStr && voucher.date < fromDateStr;
    const vc = voucher.details?.components || {};
    const isRecovery = voucher.details?.key === 'advance-recovery-emp';

    let dr = { house: 0, vehicle: 0, grain: 0 };
    let cr = { house: 0, vehicle: 0, grain: 0 };

    if (isRecovery) {
      cr.house = toPaise(vc.house);
      cr.vehicle = toPaise(vc.vehicle);
      cr.grain = toPaise(vc.grain);
    } else {
      dr.house = toPaise(vc.house || (voucher.amount && !vc.vehicle && !vc.grain ? voucher.amount : 0));
      dr.vehicle = toPaise(vc.vehicle);
      dr.grain = toPaise(vc.grain);
    }

    // Intentional Modernization: Loans are Assets, DR increases, CR decreases
    components.house.balance += dr.house - cr.house;
    components.vehicle.balance += dr.vehicle - cr.vehicle;
    components.grain.balance += dr.grain - cr.grain;

    if (isOpening) {
      components.house.opening = components.house.balance;
      components.vehicle.opening = components.vehicle.balance;
      components.grain.opening = components.grain.balance;
    } else {
      components.house.dr += dr.house; components.house.cr += cr.house;
      components.vehicle.dr += dr.vehicle; components.vehicle.cr += cr.vehicle;
      components.grain.dr += dr.grain; components.grain.cr += cr.grain;
    }
  }

  const labels = {
    house: 'Housing Loan',
    vehicle: 'Vehicle Loan',
    grain: 'Grain Advance'
  };

  const results = Object.keys(components).map(key => ({
    head: labels[key],
    opening: Number((components[key].opening / 100).toFixed(2)),
    debit: Number((components[key].dr / 100).toFixed(2)),
    credit: Number((components[key].cr / 100).toFixed(2)),
    closing: Number((Math.abs(components[key].balance) / 100).toFixed(2))
  }));

  return { 
    employee: { 
      code: employee.code, 
      name: employee.name,
      retired: !!employee.isRetired,
      interest: 'pending' // Intentional modernization per requirements
    }, 
    statement: results 
  };
}
// Legacy employee rows, per its VwEmpTransData view: TransType 12 (Advance
// Paid To Employee) debits Housing/Vehicle/Grain, 13 (Advance Recovery From
// Employee) credits them, and 22 (Interest Receive From Employee) moves only
// the interest heads — except Grain Advance, which the view credits like a
// recovery. All three key ParticularAccID to the employee's own AccID.
// Amounts are in paise, as buildEmployeeLedgerReport works in paise.
async function getHistoricalEmployeeLedgerRows(employee) {
  const accId = employee?.payload?.raw?.AccID != null ? String(employee.payload.raw.AccID) : '';
  if (!accId) return [];

  const database = await initializeDatabase();
  const result = await database.query(
    `SELECT "voucherNo", "voucherCategory", narration, payload
     FROM legacy_historical_vouchers
     WHERE "voucherCategory" IN ('12','13','22')
       AND payload->'raw'->>'ParticularAccID' = $1`,
    [accId]
  );

  const rows = [];
  for (const v of result.rows) {
    const raw = v.payload?.raw || {};
    const date = raw.VoucherDate ? String(raw.VoucherDate).slice(0, 10) : null;
    if (!date) continue;

    const row = {
      voucherNo: `LGCY-${v.voucherNo}`,
      date,
      housingLoan: { credit: 0, debit: 0, balance: 0 },
      vehicleLoan: { credit: 0, debit: 0, balance: 0 },
      grainAdvance: { credit: 0, debit: 0, balance: 0 },
      isOpening: false,
      isHistorical: true,
      narration: v.narration || raw.Narration || ''
    };
    if (v.voucherCategory === '12') {
      row.housingLoan.debit = toPaise(raw.HomeLoan);
      row.vehicleLoan.debit = toPaise(raw.VehicleLoan);
      row.grainAdvance.debit = toPaise(raw.GrainAdvance);
    } else if (v.voucherCategory === '13') {
      row.housingLoan.credit = toPaise(raw.HomeLoan);
      row.vehicleLoan.credit = toPaise(raw.VehicleLoan);
      row.grainAdvance.credit = toPaise(raw.GrainAdvance);
    } else {
      row.grainAdvance.credit = toPaise(raw.GrainAdvance);
      // Printed in the Intrst column (in brackets), not in the balance.
      row.housingLoan.interestReceived = toPaise(raw.HomeLoan);
      row.vehicleLoan.interestReceived = toPaise(raw.VehicleLoan);
    }
    rows.push(row);
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : compareCodesNumerically(a.voucherNo, b.voucherNo)));
  return rows;
}

async function buildEmployeeLedgerReport({ employeeCode, dateFrom = '', dateTo = '', user = {} } = {}) {
  const employee = await Employee.findOne({ code: cleanUpper(employeeCode) }).lean();
  if (!employee) return null;

  const branchCode = resolveBranchCode(user);
  const query = {};
  if (branchCode) query.branchCode = branchCode;
  if (dateTo) query.date = { $lte: cleanText(dateTo) };

  const vouchers = await Voucher.find(query).sort({ date: 1, createdAt: 1 }).lean();
  const voucherIds = vouchers.map((v) => String(v._id || v.id));
  const voucherNos = vouchers.map((v) => v.voucherNo).filter(Boolean);
  const allRecoveryLines = await RecoveryLine.find({ $or: [{ voucherId: { $in: voucherIds } }, { voucherNo: { $in: voucherNos } }] }).lean();
  const recoveryLinesByVoucher = allRecoveryLines.reduce((acc, line) => {
    const key = line.voucherId || line.voucherNo;
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {});

  const GROUPS = ['housingLoan', 'vehicleLoan', 'grainAdvance'];
  const emptyRow = (voucherNo, date) => ({
    voucherNo,
    date,
    housingLoan: { credit: 0, debit: 0, balance: 0 },
    vehicleLoan: { credit: 0, debit: 0, balance: 0 },
    grainAdvance: { credit: 0, debit: 0, balance: 0 },
    isOpening: false
  });

  // Live (post-cutover) vouchers, amounts in paise.
  const liveRows = [];
  for (const voucher of vouchers) {
    const isPartyMatch = cleanUpper(voucher.partyCode) === cleanUpper(employee.code);
    const recoveryLines = toArray(voucher.details?.recoveryLines).concat(recoveryLinesByVoucher[voucher._id || voucher.id] || []).concat(recoveryLinesByVoucher[voucher.voucherNo] || []);
    const hasEmployeeLines = recoveryLines.some(l => cleanUpper(l.employeeCode || l.memberCode || l.member) === cleanUpper(employee.code));
    if (!isPartyMatch && !hasEmployeeLines) continue;

    const row = emptyRow(voucher.voucherNo, voucher.date);
    const components = voucher.details?.components || {};
    const side = voucher.details?.key === 'advance-recovery-emp' ? 'credit' : 'debit';
    row.housingLoan[side] = toPaise(components.house);
    row.vehicleLoan[side] = toPaise(components.vehicle);
    row.grainAdvance[side] = toPaise(components.grain);
    liveRows.push(row);
  }

  // The employee's stored balances are the cutover snapshot: the balance
  // after every legacy row and before any live one. Legacy rows are walked
  // backward from it, live rows forward from it (balance = amount owed, so a
  // debit raises it and a credit lowers it).
  const anchor = {
    housingLoan: Math.abs(toPaise(employee.homeLoanBalance)),
    vehicleLoan: Math.abs(toPaise(employee.vehicleLoanBalance)),
    grainAdvance: Math.abs(toPaise(employee.grainAdvanceBalance))
  };
  const historicalRows = await getHistoricalEmployeeLedgerRows(employee);
  for (const key of GROUPS) {
    let running = anchor[key];
    for (let i = historicalRows.length - 1; i >= 0; i -= 1) {
      const cell = historicalRows[i][key];
      cell.balance = running;
      running -= cell.debit - cell.credit;
    }
    running = anchor[key];
    for (const row of liveRows) {
      running += row[key].debit - row[key].credit;
      row[key].balance = running;
    }
  }
  const openingBefore = (rows, index, key) => {
    if (index > 0) return rows[index - 1][key].balance;
    const first = rows[0][key];
    return first.balance - (first.debit - first.credit);
  };

  const allRows = historicalRows.concat(liveRows);
  const fromDateStr = cleanText(dateFrom);
  const toDateStr = cleanText(dateTo);
  const visibleRows = allRows.filter((r) => (!fromDateStr || r.date >= fromDateStr) && (!toDateStr || r.date <= toDateStr));
  const firstVisibleIndex = visibleRows.length ? allRows.indexOf(visibleRows[0]) : -1;
  // With nothing in the window, it opens with the last balance before it.
  const lastBeforeIndex = firstVisibleIndex >= 0
    ? firstVisibleIndex
    : allRows.filter((r) => fromDateStr && r.date < fromDateStr).length;

  const openingRow = emptyRow('OPENING', fromDateStr || (visibleRows[0]?.date || ''));
  openingRow.isOpening = true;
  for (const key of GROUPS) {
    openingRow[key].balance = allRows.length
      ? (lastBeforeIndex >= allRows.length ? allRows[allRows.length - 1][key].balance : openingBefore(allRows, lastBeforeIndex, key))
      : anchor[key];
  }

  // Intrst column, as the legacy printout (CrEmpLedger.rpt) computes it: on
  // each row that moves the loan, simple interest on the balance outstanding
  // since the previous such row (the opening row starts it) — rate/100 *
  // days/365, rounded to the rupee, negative (bracketed) while the balance is
  // overpaid. An Interest Receive row shows the amount received, negated.
  // Verified against legacy employee 5, FY 2024-25 (3010, 2256, ... (4057), (14)).
  // Each day accrues at the staff-loan rate in force on that day.
  const rateTimelines = await getInterestRateTimelines({
    housingLoan: ['receive', 'houseLoanStaff'],
    vehicleLoan: ['receive', 'vehicleLoanStaff']
  });
  const interestByRow = new Map(visibleRows.map((row) => [row, {}]));
  for (const key of Object.keys(rateTimelines)) {
    let priorBalance = openingRow[key].balance;
    let priorDate = openingRow.date;
    for (const row of visibleRows) {
      const cell = row[key];
      if (cell.interestReceived) {
        interestByRow.get(row)[key] = -toRupees(cell.interestReceived);
      } else if (cell.credit || cell.debit) {
        interestByRow.get(row)[key] = priorDate
          ? Math.round(rateHistory.accrueInterest(priorBalance / 100, priorDate, row.date, rateTimelines[key])) || 0
          : 0;
        priorBalance = cell.balance;
        priorDate = row.date;
      }
    }
  }

  const toRupeeCells = (row) => Object.fromEntries(GROUPS.map((key) => [key, {
    credit: toRupees(row[key].credit),
    debit: toRupees(row[key].debit),
    balance: toRupees(Math.abs(row[key].balance)),
    ...(key in rateTimelines ? { interest: interestByRow.get(row)?.[key] || 0 } : {})
  }]));
  const finalRows = [openingRow].concat(visibleRows).map((row) => ({ ...row, ...toRupeeCells(row) }));

  // Contact fields the migration left in the legacy master row only.
  const raw = employee.payload?.raw || {};
  const employeeResponse = {
    ...toResponse(employee),
    fatherName: employee.fatherName || raw.FathersName || '',
    mobileNo: employee.mobileNo || raw.MobileNo || '',
    designation: employee.designation || raw.Designation || ''
  };
  const last = finalRows[finalRows.length - 1];

  return {
    employee: employeeResponse,
    balances: {
      housingLoan: last.housingLoan.balance,
      vehicleLoan: last.vehicleLoan.balance,
      grainAdvance: last.grainAdvance.balance,
      housingLoanInterest: toNumber(employee.homeLoanInterest, 0),
      vehicleLoanInterest: toNumber(employee.vehicleLoanInterest, 0)
    },
    // Closing balances signed credit-positive, as legacy stores them (a loan
    // owed is negative); `balances` above are the unsigned amounts printed.
    signedBalances: Object.fromEntries(GROUPS.map((key) => {
      const lastRow = visibleRows.length ? visibleRows[visibleRows.length - 1] : openingRow;
      return [key, -toRupees(lastRow[key].balance)];
    })),
    signedOpening: Object.fromEntries(GROUPS.map((key) => [key, -toRupees(openingRow[key].balance)])),
    rows: finalRows
  };
}


// Legacy "Dividend Report" (ReportData @TAG 'DIVIDENT'): every member with
// share > 0, dividend = share / 100 x the paid dividend rate. "Opening" uses
// the share at the FY's 1 April (legacy MstAccountMaster.Share), "Closing" the
// share at the FY's 31 March (legacy VwMemberBalance.Share) — both match the
// legacy FY 2024-25 printouts to the rupee. Modes:
//   memberwise-*  one row per member
//   summary-*     the same member rows (the print groups them by branch)
//   branchwise-*  one total per branch
async function buildDividendReport({ mode = 'branchwise-opening', dateFrom = '', uptoDate = '', branchCode = '', rate: rateOverride = '', user = {} } = {}) {
  const mMode = cleanLower(mode) || 'branchwise-opening';
  const isClosing = mMode.endsWith('-closing');
  const members = await findMembersForReport({ branchCode, user });
  const [periods, branches, { interestRateHistory }, legacyFy] = await Promise.all([
    computeMemberPeriodBalances({ members, dateFrom, dateTo: uptoDate, user }),
    Branch.find({}).lean(),
    getGlobalRatesConfig(),
    getLegacyFyAccountRows('member', members.map((m) => m.code), dateFrom)
  ]);
  const branchByCode = new Map(branches.map((b) => [cleanUpper(b.code), b]));
  // The rate declared for the year when given; otherwise the dividend rate in
  // force at the end of the reported period, not whatever it is today.
  const rate = cleanText(rateOverride) !== '' && Number.isFinite(Number(rateOverride))
    ? Number(rateOverride)
    : rateHistory.rateAsOf(interestRateHistory, 'paid', 'dividend', cleanText(uptoDate) || cleanText(dateFrom) || rateHistory.todayIso());

  const rows = periods.map(({ member, buckets }) => {
    // No FY given -> before all history / the current snapshot.
    const share = toRupees(isClosing ? buckets.share.closing : buckets.share.opening);
    // Legacy prints the branch / PF no. / grade of that FY's own master row
    // (members move branch between years); the current master otherwise.
    const legacyRow = legacyFy.rows.get(member.code) || {};
    const currentRow = member.payload?.raw || {};
    const branchCode = cleanText(legacyRow.BranchCode ?? member.branchCode);
    const branch = branchByCode.get(cleanUpper(branchCode)) || {};
    return {
      memberCode: member.code,
      memberName: member.name,
      pfNo: cleanText(legacyRow.PFNo ?? (member.pfNo || currentRow.PFNo)),
      grade: cleanText(legacyRow.Designation ?? (member.designation || currentRow.Designation)),
      branch: branchCode,
      branchName: branch.place || branch.label || branchCode,
      share,
      dividendRate: rate,
      dividendAmount: Number(((share / 100) * rate).toFixed(2))
    };
  }).filter((row) => row.share > 0);

  if (!mMode.startsWith('branchwise')) return rows;

  const branchMap = new Map();
  for (const row of rows) {
    const key = row.branch || 'UNKNOWN';
    if (!branchMap.has(key)) {
      branchMap.set(key, { branch: key, branchName: row.branchName, memberCount: 0, shareTotal: 0, dividendRate: rate, dividendTotal: 0 });
    }
    const entry = branchMap.get(key);
    entry.memberCount += 1;
    entry.shareTotal += row.share;
    entry.dividendTotal += row.dividendAmount;
  }
  return [...branchMap.values()].map((b) => ({
    ...b,
    shareTotal: Number(b.shareTotal.toFixed(2)),
    dividendTotal: Number(b.dividendTotal.toFixed(2))
  }));
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
  buildRecoveryDemandCandidates,
  listDemandEntries,
  getDemandEntry,
  getDemandEntryMembers,
  saveDemandEntry,
  deleteDemandEntry,
  buildDividendReport,
  buildMonthlySummaryReport,
  buildEmployeeLedgerReport,
  buildMemberLedgerReport,
  buildPaymentReceiptStatementReport,
  buildProfitLossReport,
  buildTrialBalanceReport,
  buildVoucherRows,
  getHistoricalVoucherById,
  buildVoucherSummaryReport,
  createBankTransaction,
  createResource,
  createVoucher,
  deleteBankTransaction,
  deleteResource,
  restoreResource,
  listAuditLog,
  deleteVoucher,
  restoreVoucher,
  getDashboardSummary,
  getLedgerSnapshots,
  getLegacyFyLedgerSnapshots,
  getLookups,
  getNextTransactionNo,
  getNextVoucherNo,
  getTransactionCatalog,
  getResource,
  getSingle,
  listResource,
  normalizeResourcePayload,
  seedBankingData,
  updateBankTransaction,
  updateResource,
  updateVoucher
};






















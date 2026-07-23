const bcrypt = require('bcryptjs');
const {
  BANK_ACCOUNT_SEEDS,
  BANK_TRANSACTION_SEEDS,
  BRANCH_SEEDS,
  COMMITTEE_SEED,
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
  Demand,
  Ledger,
  Member,
  NoInterestMember,
  Rate,
  Society,
  Voucher
} = require('../models/banking.models');
const User = require('../models/user.model');
const { deleteFileById } = require('./file.service');
const { createNotification } = require('./notification.service');
const { toResponse } = require('../utils/mongoose');

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
      label: 'Society',
      module: 'settings',
      type: 'security',
      severity: 'medium',
      listUrl: '/app/settings/business-identity',
      detailUrl: '/app/settings/business-identity'
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
      label: 'Rate',
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

  if (['loan-paid-member', 'deposit-paid-member', 'insurance-paid-member', 'recovery-member'].includes(key)) {
    return '/app/transactions/member';
  }
  if (['loan-recv-cash', 'loan-recv-saving', 'deposit-in-bank', 'cheque-issue-saving', 'cheque-issue-loan', 'transfer-saving', 'transfer-cashcredit'].includes(key)) {
    return '/app/transactions/bank';
  }
  if (['advance-paid-emp', 'advance-recovery-emp'].includes(key)) {
    return '/app/transactions/employee';
  }
  if (['transfer-voucher-paid', 'transfer-voucher-recover'].includes(key)) {
    return '/app/transactions/transfer-voucher';
  }
  if (['receipt-voucher', 'interest-paid-member', 'no-interest-members'].includes(key)) {
    return '/app/transactions/receipt-interest';
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
    phone: normalizePhone(data.phone || data.mobileNo),
    mobileNo: normalizePhone(data.mobileNo || data.phone),
    address: cleanText(data.address),
    gender: cleanText(data.gender),
    designation: cleanText(data.designation),
    branchCode: cleanUpper(data.branchCode),
    status,
    isActive,
    avatarUrl: cleanText(data.avatarUrl),
    avatarFileId: data.avatarFileId || null,
    documents: toMixed(data.documents, {}),
    roles: Array.isArray(data.roles) ? data.roles.filter(Boolean) : [],
    payload: toMixed(data.payload, {})
  };
}

function sanitizeEmployeeUserResponse(doc) {
  const response = toResponse(doc);
  if (!response) return null;
  response.phone = normalizePhone(response.phone || response.mobileNo || '');
  response.mobileNo = normalizePhone(response.mobileNo || response.phone || '');
  delete response.passwordHash;
  delete response.passwordReset;
  return response;
}

function sanitizeMemberResponse(doc) {
  const response = toResponse(doc);
  if (!response) return null;
  response.mobileNo = normalizePhone(response.mobileNo || '');
  response.photoFileId = response.photoFileId ? String(response.photoFileId) : null;
  return response;
}

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
        mode: 'Cash / Cheque'
      },
      {
        key: 'deposit-paid-member',
        label: 'Compulsory Deposit Paid to Member',
        description: 'Pay compulsory deposit amounts back to member accounts.',
        voucherCategory: 'Compulsory Deposit Paid to Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cash / Cheque'
      },
      {
        key: 'insurance-paid-member',
        label: 'Insurance Premium Paid to Member',
        description: 'Record insurance premium disbursement entries.',
        voucherCategory: 'Insurance Premium Paid to Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cash / Cheque'
      },
      {
        key: 'recovery-member',
        label: 'Recovery From Member',
        description: 'Recover dues from member accounts.',
        voucherCategory: 'Recovery From Member',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Cash / Transfer'
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
        mode: 'Cash / Credit'
      },
      {
        key: 'loan-recv-saving',
        label: 'Loan Received to Saving A/c',
        description: 'Receive loan proceeds into saving account.',
        voucherCategory: 'Loan Received to Saving A/c',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Saving A/c'
      },
      {
        key: 'deposit-in-bank',
        label: 'Deposit in Bank',
        description: 'Move cash or settlement into bank account.',
        voucherCategory: 'Deposit in Bank',
        transactionType: 'transfer',
        accent: 'amber',
        mode: 'Bank Deposit'
      },
      {
        key: 'cheque-issue-saving',
        label: 'Cheque Issue With Bank (Saving A/c)',
        description: 'Issue cheque against savings account settlement.',
        voucherCategory: 'Cheque Issue With Bank (Saving A/c)',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cheque'
      },
      {
        key: 'cheque-issue-loan',
        label: 'Cheque Issue With Bank (Loan A/c)',
        description: 'Issue cheque against loan account settlement.',
        voucherCategory: 'Cheque Issue With Bank (Loan A/c)',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Cheque'
      },
      {
        key: 'transfer-saving',
        label: 'Amount Transfer to Saving A/c',
        description: 'Transfer money to saving account ledger.',
        voucherCategory: 'Amount Transfer to Saving A/c',
        transactionType: 'transfer',
        accent: 'amber',
        mode: 'Transfer'
      },
      {
        key: 'transfer-cashcredit',
        label: 'Amount Transfer to Cash-Credit A/c',
        description: 'Transfer money to cash-credit account ledger.',
        voucherCategory: 'Amount Transfer to Cash-Credit A/c',
        transactionType: 'transfer',
        accent: 'amber',
        mode: 'Transfer'
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
        mode: 'Cash / Cheque'
      },
      {
        key: 'advance-recovery-emp',
        label: 'Advance Recovery by Cash/Transfer',
        description: 'Recover employee advance through cash or transfer.',
        voucherCategory: 'Advance Recovery by Cash/Transfer',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Cash / Transfer'
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
        mode: 'Transfer'
      },
      {
        key: 'transfer-voucher-recover',
        label: 'Transfer Voucher Recover From Member',
        description: 'Recover transfer voucher amount from member.',
        voucherCategory: 'Transfer Voucher Recover From Member',
        transactionType: 'receipt',
        accent: 'emerald',
        mode: 'Transfer'
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
        mode: 'Receipt'
      },
      {
        key: 'interest-paid-member',
        label: 'Interest Paid to Member',
        description: 'Post interest payout to member ledger.',
        voucherCategory: 'Interest Paid to Member',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Interest'
      },
      {
        key: 'no-interest-members',
        label: 'No Interest Members',
        description: 'Members excluded from interest calculation.',
        voucherCategory: 'No Interest Members',
        transactionType: 'support',
        accent: 'amber',
        mode: 'Master Link',
        route: '/app/master/no-interest-members'
      }
    ]
  },
  {
    key: 'supporting',
    label: 'Supporting',
    description: 'Support vouchers and demand entry helpers.',
    permission: ['transactions.read', 'demands.read'],
    items: [
      {
        key: 'payment-voucher',
        label: 'Payment',
        description: 'General payment voucher entry.',
        voucherCategory: 'Payment',
        transactionType: 'payment',
        accent: 'pink',
        mode: 'Payment'
      },
      {
        key: 'demand-entry',
        label: 'Demand Entry',
        description: 'Create or review demand records from the transaction shell.',
        voucherCategory: 'Demand Entry',
        transactionType: 'support',
        accent: 'amber',
        mode: 'Demand',
        route: '/app/master/demands'
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
    searchFields: ['chairman', 'viceChairman', 'directors'],
    normalize(data = {}) {
      return {
        key: 'default',
        chairman: cleanText(data.chairman),
        viceChairman: cleanText(data.viceChairman),
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
    searchFields: ['transactionNo', 'bankAccountCode', 'transactionType', 'linkedClientCode', 'linkedProjectCode', 'linkedInvoiceNo', 'linkedExpenseCode', 'notes', 'voucherNo', 'status'],
    normalize(data = {}) {
      return {
        transactionNo: cleanUpper(data.transactionNo),
        date: cleanText(data.date),
        bankAccountCode: cleanUpper(data.bankAccountCode),
        transactionType: cleanText(data.transactionType),
        amount: toNumber(data.amount, 0),
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
    searchFields: ['code', 'memberCode', 'reason', 'status'],
    normalize(data = {}) {
      return {
        code: cleanUpper(data.code),
        memberCode: cleanUpper(data.memberCode),
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
        details: toMixed(data.details, {}),
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
  await seedMany(Branch, (row) => ({ code: cleanUpper(row.code) }), BRANCH_SEEDS);
  await seedMany(Member, (row) => ({ code: cleanUpper(row.code) }), MEMBER_SEEDS);
  await seedMany(User, (row) => ({ code: cleanUpper(row.code) }), EMPLOYEE_SEEDS.map((row) => normalizeEmployeeUser({
    ...row,
    fullName: row.name,
    name: row.name,
    username: row.username || cleanLower(row.code),
    email: row.email || `${cleanLower(row.code)}@bank.local`,
    password: row.password || row.code || row.name,
        phone: normalizePhone(row.mobileNo),
        mobileNo: normalizePhone(row.mobileNo),
    status: row.status || 'Active'
  })));
  await seedMany(Ledger, (row) => ({ code: cleanUpper(row.code) }), LEDGER_SEEDS);
  await seedMany(Rate, (row) => ({ code: cleanUpper(row.code) }), RATE_SEEDS);
  await seedMany(BankAccount, (row) => ({ code: cleanUpper(row.code) }), BANK_ACCOUNT_SEEDS);
  await seedMany(Demand, (row) => ({ demandNo: cleanUpper(row.demandNo) }), DEMAND_SEEDS);
  await seedMany(NoInterestMember, (row) => ({ code: cleanUpper(row.code) }), NO_INTEREST_MEMBER_SEEDS);
  await seedMany(Voucher, (row) => ({ voucherNo: cleanUpper(row.voucherNo) }), VOUCHER_SEEDS);
  await seedMany(BankTransaction, (row) => ({ transactionNo: cleanUpper(row.transactionNo) }), BANK_TRANSACTION_SEEDS);
  return true;
}

async function listResource(resource, search = '') {
  const def = getResourceDef(resource);
  if (resource === 'employees') {
    const baseQuery = { code: { $ne: '' } };
    const query = buildSearchQuery(def.searchFields, search);
    const rows = await User.find(query.$or ? { $and: [baseQuery, query] } : baseQuery)
      .sort({ updatedAt: -1 })
      .lean();
    return rows.map((row) => sanitizeEmployeeUserResponse(row));
  }
  const query = buildSearchQuery(def.searchFields, search);
  const rows = await def.model.find(query).sort({ updatedAt: -1 }).lean();
  return rows.map((row) => (resource === 'members' ? sanitizeMemberResponse(row) : toResponse(row)));
}

async function getResource(resource, id) {
  const def = getResourceDef(resource);
  if (resource === 'employees') {
    const record = await User.findOne({ _id: id, code: { $ne: '' } }).lean();
    return record ? sanitizeEmployeeUserResponse(record) : null;
  }
  if (def.singleton) {
    const record = await def.model.findOne({ key: 'default' }).lean();
    return record ? toResponse(record) : null;
  }

  const record = await def.model.findById(id).lean();
  if (!record) return null;
  return resource === 'members' ? sanitizeMemberResponse(record) : toResponse(record);
}

async function createResource(resource, data = {}, meta = {}) {
  const def = getResourceDef(resource);
  if (resource === 'employees') {
    const payload = normalizeEmployeeUser(data);
    if (meta.actorUserId) {
      payload.createdByUserId = meta.actorUserId;
      payload.updatedByUserId = meta.actorUserId;
    }
    const record = await User.create(payload);
    const response = sanitizeEmployeeUserResponse(record);
    await notifySafely(buildResourceNotificationPayload(resource, 'created', response, meta));
    return response;
  }
  if (resource === 'members') {
    const payload = def.normalize ? def.normalize(data) : clone(data);
    if (!payload.code) {
      payload.code = await generateNextMemberCode();
    }
    if (!payload.membershipNo) {
      payload.membershipNo = await generateNextMembershipNo();
    }
    if (meta.actorUserId) {
      payload.createdByUserId = meta.actorUserId;
      payload.updatedByUserId = meta.actorUserId;
    }
    const record = await def.model.create(payload);
    const response = resource === 'members' ? sanitizeMemberResponse(record) : toResponse(record);
    await notifySafely(buildResourceNotificationPayload(resource, 'created', response, meta));
    return response;
  }
  const payload = def.normalize ? def.normalize(data) : clone(data);
  if (meta.actorUserId) {
    payload.createdByUserId = meta.actorUserId;
    payload.updatedByUserId = meta.actorUserId;
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
  if (resource === 'employees') {
    const current = await User.findOne({ _id: id, code: { $ne: '' } });
    if (!current) return null;
    const payload = normalizeEmployeeUser({
      ...current.toObject(),
      ...data,
      passwordHash: current.passwordHash
    });
    if (meta.actorUserId) {
      payload.updatedByUserId = meta.actorUserId;
    }
    current.set(payload);
    await current.save();
    const response = sanitizeEmployeeUserResponse(current);
    await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
    return response;
  }
  if (resource === 'members') {
    const current = await Member.findById(id);
    if (!current) return null;

    const previousPhotoFileId = current.photoFileId ? String(current.photoFileId) : '';
    const payload = def.normalize ? def.normalize({ ...current.toObject(), ...data }) : clone({ ...current.toObject(), ...data });
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
    const response = sanitizeMemberResponse(current);
    await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
    return response;
  }
  const payload = def.normalize ? def.normalize({ ...data, ...(def.singleton ? { key: 'default' } : {}) }) : clone(data);
  if (meta.actorUserId) {
    payload.updatedByUserId = meta.actorUserId;
  }

  if (def.singleton) {
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

  const record = await def.model.findByIdAndUpdate(id, { $set: payload }, { new: true, runValidators: true }).lean();
  if (!record) return null;
  const response = resource === 'members' ? sanitizeMemberResponse(record) : toResponse(record);
  await notifySafely(buildResourceNotificationPayload(resource, 'updated', response, meta));
  return response;
}

async function deleteResource(resource, id) {
  const def = getResourceDef(resource);
  if (resource === 'employees') {
    const record = await User.findOneAndDelete({ _id: id, code: { $ne: '' } }).lean();
    if (record) {
      await notifySafely(buildResourceNotificationPayload(resource, 'deleted', toResponse(record), {}));
    }
    return Boolean(record);
  }
  if (def.singleton) {
    const error = new Error('This record cannot be deleted');
    error.statusCode = 400;
    throw error;
  }

  const record = await def.model.findByIdAndDelete(id).lean();
  if (record && resource === 'members' && record.photoFileId) {
    await deleteFileById(record.photoFileId).catch(() => {});
  }
  if (record) {
    await notifySafely(buildResourceNotificationPayload(resource, 'deleted', toResponse(record), {}));
  }
  return Boolean(record);
}

async function getSingle(resource) {
  const record = await getResource(resource);
  return record || null;
}

function getPartyMemberCode(voucher) {
  const partyType = cleanLower(voucher.partyType);
  if (partyType === 'member' || partyType === 'members') {
    return cleanUpper(voucher.partyCode || voucher.party);
  }

  const recoveryLines = Array.isArray(voucher.details?.recoveryLines) ? voucher.details.recoveryLines : [];
  if (recoveryLines.length) {
    return cleanUpper(recoveryLines[0].member || recoveryLines[0].memberCode);
  }

  return '';
}

function settlementLedger(details = {}, mode = '') {
  if (details.settlementAccount) return cleanUpper(details.settlementAccount);
  if (details.depositIn) return cleanUpper(details.depositIn);
  if (details.savingAcc) return cleanUpper(details.savingAcc);
  if (String(mode).toLowerCase().includes('cash')) return 'L001';
  return 'L013';
}

function headLedger(head) {
  return {
    share: 'L007',
    cd: 'L005',
    ssa: 'L006',
    loan: 'L003',
    loanAmt: 'L003',
    lad: 'L004',
    ins: 'L015',
    insurance: 'L015',
    interest: 'L016',
    house: 'L014',
    vehicle: 'L014',
    grain: 'L014',
    suspense: 'L012',
    admfee: 'L009',
    pf: 'L017',
    amt: 'L012'
  }[head] || 'L012';
}

function buildJournalLines(voucher) {
  const details = voucher.details || {};
  const components = details.components || {};
  const lines = [];
  const add = (ledgerCode, dr = 0, cr = 0, memo = '') => {
    const debit = toNumber(dr, 0);
    const credit = toNumber(cr, 0);
    if (debit || credit) {
      lines.push({ ledgerCode, dr: debit, cr: credit, memo });
    }
  };

  const settle = settlementLedger(details, voucher.mode);
  const key = cleanLower(details.key);

  if (key === 'loan-paid-member') {
    add('L003', components.loanAmt, 0, 'Regular loan disbursed');
    add('L004', components.lad, 0, 'Loan against deposit disbursed');
    add(settle, 0, voucher.amount, 'Settlement');
  } else if (key === 'deposit-paid-member') {
    add('L005', voucher.amount, 0, 'Compulsory deposit paid');
    add(settle, 0, voucher.amount, 'Settlement');
  } else if (key === 'insurance-paid-member') {
    add('L015', voucher.amount, 0, 'Insurance premium paid');
    add(settle, 0, voucher.amount, 'Settlement');
  } else if (key === 'loan-recv-cash' || key === 'loan-recv-saving') {
    add(settle, voucher.amount, 0, 'Loan proceeds received');
    add('L018', 0, voucher.amount, 'Bank loan liability');
  } else if (key === 'deposit-in-bank') {
    add(details.depositIn || 'L002', voucher.amount, 0, 'Deposit in bank');
    add(details.depositBy === 'CASH' ? 'L001' : 'L013', 0, voucher.amount, 'Deposit source');
  } else if (key === 'cheque-issue-saving' || key === 'cheque-issue-loan') {
    add('L012', voucher.amount, 0, details.narration || 'Cheque issue');
    add(settle, 0, voucher.amount, 'Bank cheque issued');
  } else if (key === 'transfer-saving' || key === 'transfer-cashcredit') {
    add(details.toAccount || 'L013', voucher.amount, 0, 'Transfer received');
    add(details.fromAccount || 'L002', 0, voucher.amount, 'Transfer sent');
  } else if (key === 'recovery-member') {
    add(cleanLower(voucher.mode).includes('cash') ? 'L001' : 'L013', voucher.amount, 0, 'Member recovery received');
    add('L003', 0, voucher.amount, 'Member loan/deposit recovery');
  } else if (key === 'advance-paid-emp') {
    add('L014', voucher.amount, 0, 'Employee advance');
    add(settle, 0, voucher.amount, 'Settlement');
  } else if (key === 'advance-recovery-emp') {
    add(settle, voucher.amount, 0, 'Advance recovery received');
    add('L014', 0, voucher.amount, 'Employee advance recovered');
  } else if (key === 'payment-voucher') {
    add(details.ledgerTarget || 'L012', voucher.amount, 0, 'Payment');
    add(details.settlementAccount || settle, 0, voucher.amount, 'Settlement');
  } else if (key === 'receipt-voucher') {
    add(details.receiptBy === 'BANK' ? 'L013' : 'L001', voucher.amount, 0, 'Receipt');
    add(details.ledgerTarget || 'L012', 0, voucher.amount, 'Receipt ledger');
  } else if (key === 'interest-paid-member') {
    add('L016', voucher.amount, 0, 'Interest paid');
    add(settle, 0, voucher.amount, 'Settlement');
  } else if (key === 'reversal') {
    toArray(voucher.journalLines).forEach((line) => add(line.ledgerCode, line.cr, line.dr, line.memo || 'Reversal'));
  } else {
    add('L012', voucher.amount, 0, voucher.voucherCategory || voucher.transactionType || 'Voucher');
    add(settle, 0, voucher.amount, 'Settlement');
  }

  return lines;
}

async function loadMember(memberCode) {
  if (!memberCode) return null;
  return Member.findOne({ code: cleanUpper(memberCode) });
}

async function loadBankAccountByLedger(ledgerCode) {
  if (!ledgerCode) return null;
  return BankAccount.findOne({ linkedLedgerCode: cleanUpper(ledgerCode) });
}

async function applyMemberEffects(voucher, direction = 1) {
  const memberCode = getPartyMemberCode(voucher);
  const member = await loadMember(memberCode);
  if (!member) {
    return null;
  }

  const details = voucher.details || {};
  const components = details.components || {};
  const sign = direction >= 0 ? 1 : -1;

  if (cleanLower(details.key) === 'loan-paid-member') {
    member.loanOutstanding = Math.max(0, toNumber(member.loanOutstanding, 0) + sign * (toNumber(components.loanAmt, 0) + toNumber(components.lad, 0)));
    member.balances = member.balances || {};
    member.balances.loanAgainstDeposit = Math.max(0, toNumber(member.balances.loanAgainstDeposit, 0) + sign * toNumber(components.lad, 0));
  } else if (cleanLower(details.key) === 'deposit-paid-member') {
    const nextBalance = Math.max(0, toNumber(member.depositBalance, 0) - sign * voucher.amount);
    member.depositBalance = nextBalance;
    member.balances = member.balances || {};
    member.balances.compulsoryDeposit = nextBalance;
  } else if (cleanLower(details.key) === 'insurance-paid-member') {
    member.balances = member.balances || {};
    member.balances.insurancePremium = Math.max(0, toNumber(member.balances.insurancePremium, 0) - sign * voucher.amount);
  } else if (cleanLower(details.key) === 'recovery-member') {
    const recoveryLines = toArray(details.recoveryLines);
    for (const line of recoveryLines) {
      if (cleanUpper(line.member || line.memberCode) !== member.code) {
        continue;
      }
      const heads = toMixed(line.heads, {});
      member.loanOutstanding = Math.max(0, toNumber(member.loanOutstanding, 0) - sign * toNumber(heads.loan, 0) - sign * toNumber(heads.lad, 0));
      member.balances = member.balances || {};
      member.balances.share = Math.max(0, toNumber(member.balances.share, 0) + sign * toNumber(heads.share, 0));
      member.depositBalance = Math.max(0, toNumber(member.depositBalance, 0) + sign * toNumber(heads.cd, 0));
      member.balances.compulsoryDeposit = member.depositBalance;
      member.balances.specialSaving = Math.max(0, toNumber(member.balances.specialSaving, 0) + sign * toNumber(heads.ssa, 0));
      member.balances.insurancePremium = Math.max(0, toNumber(member.balances.insurancePremium, 0) + sign * toNumber(heads.ins, 0));
      member.balances.providentFund = Math.max(0, toNumber(member.balances.providentFund, 0) + sign * toNumber(heads.pf, 0));
      member.balances.loanAgainstDeposit = Math.max(0, toNumber(member.balances.loanAgainstDeposit, 0) - sign * toNumber(heads.lad, 0));
    }
  } else if (cleanLower(details.key) === 'transfer-voucher-paid' || cleanLower(details.key) === 'transfer-voucher-recover') {
    const allocations = toArray(details.allocations);
    for (const allocation of allocations) {
      const amount = toNumber(allocation.amount, 0) * sign;
      const side = cleanUpper(allocation.side || 'CR');
      const effective = side === 'CR' ? amount : -amount;
      const head = cleanLower(allocation.head);
      member.balances = member.balances || {};

      if (head === 'share') {
        member.balances.share = Math.max(0, toNumber(member.balances.share, 0) + effective);
      } else if (head === 'cd') {
        member.depositBalance = Math.max(0, toNumber(member.depositBalance, 0) + effective);
        member.balances.compulsoryDeposit = member.depositBalance;
      } else if (head === 'ssa') {
        member.balances.specialSaving = Math.max(0, toNumber(member.balances.specialSaving, 0) + effective);
      } else if (head === 'loan') {
        member.loanOutstanding = Math.max(0, toNumber(member.loanOutstanding, 0) - effective);
      } else if (head === 'lad') {
        member.balances.loanAgainstDeposit = Math.max(0, toNumber(member.balances.loanAgainstDeposit, 0) - effective);
      }
    }
  } else if (cleanLower(details.key) === 'interest-paid-member') {
    if (cleanLower(details.accountHead) === 'cd') {
      member.depositBalance = Math.max(0, toNumber(member.depositBalance, 0) + sign * voucher.amount);
      member.balances = member.balances || {};
      member.balances.compulsoryDeposit = member.depositBalance;
    }
  }

  await member.save();
  return member;
}

async function revertMemberEffects(voucher) {
  return applyMemberEffects(voucher, -1);
}

async function applyBankAccountEffects(voucher, direction = 1) {
  const journalLines = toArray(voucher.journalLines);
  if (!journalLines.length) {
    return [];
  }

  const changed = [];
  const bankAccounts = await BankAccount.find({
    linkedLedgerCode: { $in: journalLines.map((line) => cleanUpper(line.ledgerCode)) }
  });

  for (const bankAccount of bankAccounts) {
    const delta = journalLines
      .filter((line) => cleanUpper(line.ledgerCode) === cleanUpper(bankAccount.linkedLedgerCode))
      .reduce((sum, line) => sum + toNumber(line.dr, 0) - toNumber(line.cr, 0), 0);

    if (delta) {
      bankAccount.currentBalance = toNumber(bankAccount.currentBalance, 0) + (direction >= 0 ? delta : -delta);
      if (bankAccount.currentBalance < 0) {
        bankAccount.currentBalance = 0;
      }
      await bankAccount.save();
      changed.push(bankAccount);
    }
  }

  return changed;
}

async function createVoucher(data = {}, meta = {}) {
  const payload = clone(data);
  if (!payload.voucherNo) {
    payload.voucherNo = await getNextVoucherNo();
  }
  payload.voucherNo = cleanUpper(payload.voucherNo);
  payload.amount = toNumber(payload.amount, 0);
  payload.status = cleanText(payload.status, 'Posted');
  payload.documents = toMixed(payload.documents, {});
  payload.journalLines = toArray(payload.journalLines);
  if (meta.actorUserId) {
    payload.createdByUserId = meta.actorUserId;
    payload.updatedByUserId = meta.actorUserId;
  }

  if (!payload.journalLines.length) {
    payload.journalLines = buildJournalLines(payload);
  }

  const existing = await Voucher.findOne({ voucherNo: payload.voucherNo }).lean();
  if (existing) {
    const error = new Error('Voucher number already exists');
    error.statusCode = 409;
    throw error;
  }

  const record = await Voucher.create(payload);
  if (record.status === 'Posted') {
    await applyMemberEffects(record, 1);
    await applyBankAccountEffects(record, 1);
  }
  await notifySafely(buildVoucherNotificationPayload('created', toResponse(record), meta));
  return toResponse(record);
}

async function updateVoucher(voucherId, data = {}, meta = {}) {
  const current = await Voucher.findById(voucherId);
  if (!current) {
    return null;
  }

  if (current.status === 'Posted') {
    const error = new Error('Posted vouchers cannot be edited. Reverse the voucher instead.');
    error.statusCode = 400;
    throw error;
  }

  const previousStatus = current.status;
  const patch = normalizeVoucherPatch(data);
  if (meta.actorUserId) {
    patch.updatedByUserId = meta.actorUserId;
  }
  current.set(patch);
  if (!Array.isArray(current.journalLines) || !current.journalLines.length) {
    current.journalLines = buildJournalLines(current.toObject());
  }
  await current.save();
  if (previousStatus !== 'Posted' && current.status === 'Posted') {
    await applyMemberEffects(current, 1);
    await applyBankAccountEffects(current, 1);
  }
  const response = toResponse(current);
  await notifySafely(buildVoucherNotificationPayload('updated', response, meta));
  return response;
}

function normalizeVoucherPatch(data = {}) {
  const patch = {};
  const fields = ['voucherNo', 'date', 'voucherCategory', 'transactionType', 'accent', 'partyCode', 'partyType', 'mode', 'status', 'narration', 'referenceNo', 'instrumentNo', 'instrumentDate', 'branchCode', 'fyCode', 'reversalOf', 'approvedBy', 'createdBy'];

  for (const field of fields) {
    if (data[field] !== undefined) {
      patch[field] = field.endsWith('Code') || field === 'voucherNo' || field === 'partyCode' || field === 'branchCode' || field === 'fyCode' || field === 'reversalOf' || field === 'approvedBy' || field === 'createdBy'
        ? cleanUpper(data[field])
        : cleanText(data[field]);
    }
  }

  if (data.amount !== undefined) {
    patch.amount = toNumber(data.amount, 0);
  }
  if (data.details !== undefined) {
    patch.details = toMixed(data.details, {});
  }
  if (data.documents !== undefined) {
    patch.documents = toMixed(data.documents, {});
  }
  if (data.journalLines !== undefined) {
    patch.journalLines = toArray(data.journalLines).map((line) => ({
      ledgerCode: cleanUpper(line.ledgerCode || line.ledger),
      dr: toNumber(line.dr, 0),
      cr: toNumber(line.cr, 0),
      memo: cleanText(line.memo)
    }));
  }

  return patch;
}

async function deleteVoucher(voucherId) {
  const current = await Voucher.findById(voucherId);
  if (!current) {
    return false;
  }

  if (current.status === 'Posted') {
    const error = new Error('Posted vouchers cannot be deleted. Reverse the voucher instead.');
    error.statusCode = 400;
    throw error;
  }

  await deleteDocumentFiles(current.documents || current.details?.documents || {});
  await current.deleteOne();
  await notifySafely(buildVoucherNotificationPayload('deleted', toResponse(current), {}));
  return true;
}

async function reverseVoucher(voucherId, meta = {}) {
  const current = await Voucher.findById(voucherId).lean();
  if (!current) {
    return null;
  }

  if (current.status !== 'Posted') {
    const error = new Error('Only posted vouchers can be reversed');
    error.statusCode = 400;
    throw error;
  }

  const reversalNo = await getNextVoucherNo();
  const reversal = {
    voucherNo: reversalNo,
    date: new Date().toISOString().slice(0, 10),
    voucherCategory: `Reversal of ${current.voucherNo}`,
    transactionType: 'reversal',
    accent: 'neutral',
    partyCode: current.partyCode,
    partyType: current.partyType,
    amount: current.amount,
    mode: 'Reversal',
    status: 'Posted',
    narration: `Reversal of ${current.voucherNo}`,
    reversalOf: current.voucherNo,
    branchCode: current.branchCode,
    fyCode: current.fyCode,
    details: {
      key: 'reversal',
      original: current.voucherNo,
      narration: `Reversal of ${current.voucherNo}`
    },
    createdByUserId: meta.actorUserId || null,
    updatedByUserId: meta.actorUserId || null,
    reversedByUserId: meta.actorUserId || null,
    journalLines: toArray(current.journalLines).map((line) => ({
      ledgerCode: cleanUpper(line.ledgerCode),
      dr: toNumber(line.cr, 0),
      cr: toNumber(line.dr, 0),
      memo: `Reversal of ${current.voucherNo}`
    }))
  };

  const record = await Voucher.create(reversal);
  await Voucher.updateOne({ _id: current._id }, { $set: { status: 'Reversed' } });
  await revertMemberEffects(current);
  await applyBankAccountEffects(record, 1);
  await notifySafely(buildVoucherNotificationPayload('reversed', toResponse(record), meta));
  return toResponse(record);
}

async function getNextVoucherNo(prefix = 'V') {
  const latest = await Voucher.findOne({ voucherNo: { $regex: '^V[-0-9]*$', $options: 'i' } })
    .sort({ createdAt: -1 })
    .lean();

  if (!latest?.voucherNo) {
    return `${prefix}-24001`;
  }

  const match = String(latest.voucherNo).match(/(\d+)(?!.*\d)/);
  const next = match ? Number(match[1]) + 1 : 24001;
  return `${prefix}-${String(next)}`;
}

async function getNextTransactionNo(prefix = 'BT') {
  const latest = await BankTransaction.findOne({ transactionNo: { $regex: '^BT[-0-9]*$', $options: 'i' } })
    .sort({ createdAt: -1 })
    .lean();

  if (!latest?.transactionNo) {
    return `${prefix}-24001`;
  }

  const match = String(latest.transactionNo).match(/(\d+)(?!.*\d)/);
  const next = match ? Number(match[1]) + 1 : 24001;
  return `${prefix}-${String(next)}`;
}

async function createBankTransaction(data = {}, meta = {}) {
  const payload = normalizeResourcePayload('bankTransactions', data);
  if (!payload.transactionNo) {
    payload.transactionNo = await getNextTransactionNo();
  }
  if (meta.actorUserId) {
    payload.createdByUserId = meta.actorUserId;
    payload.updatedByUserId = meta.actorUserId;
  }

  const existing = await BankTransaction.findOne({ transactionNo: payload.transactionNo }).lean();
  if (existing) {
    const error = new Error('Bank transaction number already exists');
    error.statusCode = 409;
    throw error;
  }

  const record = await BankTransaction.create(payload);
  const response = toResponse(record);
  await notifySafely(buildBankTransactionNotificationPayload('created', response, meta));
  return response;
}

async function updateBankTransaction(transactionId, data = {}, meta = {}) {
  const current = await BankTransaction.findById(transactionId);
  if (!current) return null;
  const patch = normalizeResourcePayload('bankTransactions', data);
  if (meta.actorUserId) {
    patch.updatedByUserId = meta.actorUserId;
  }
  current.set(patch);
  await current.save();
  const response = toResponse(current);
  await notifySafely(buildBankTransactionNotificationPayload('updated', response, meta));
  return response;
}

async function deleteBankTransaction(transactionId) {
  const current = await BankTransaction.findById(transactionId);
  if (!current) return false;
  await current.deleteOne();
  await notifySafely(buildBankTransactionNotificationPayload('deleted', toResponse(current), {}));
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

async function getLedgerSnapshots({ uptoDate = '' } = {}) {
  const ledgers = await Ledger.find({}).lean();
  const query = { status: 'Posted' };
  if (uptoDate) {
    query.date = { $lte: uptoDate };
  }
  const vouchers = await Voucher.find(query).lean();
  return ledgerSnapshotFromDocuments(ledgers, vouchers);
}

async function getDashboardSummary() {
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
    Branch.countDocuments({}),
    Member.countDocuments({}),
    User.countDocuments({ code: { $ne: '' } }),
    Ledger.countDocuments({}),
    Rate.countDocuments({}),
    BankAccount.countDocuments({}),
    Demand.countDocuments({}),
    NoInterestMember.countDocuments({}),
    Voucher.find({}).sort({ createdAt: -1 }).limit(10).lean(),
    BankTransaction.find({}).sort({ createdAt: -1 }).limit(10).lean()
  ]);

  return {
    society: society ? toResponse(society) : null,
    counts: {
      branches,
      members,
      employees,
      ledgers,
      rates,
      bankAccounts,
      demands,
      noInterestMembers,
      vouchers: await Voucher.countDocuments({}),
      bankTransactions: await BankTransaction.countDocuments({})
    },
    recentVouchers: vouchers.map((voucher) => toResponse(voucher)),
    recentBankTransactions: bankTransactions.map((transaction) => toResponse(transaction))
  };
}

async function getLookups() {
  const [
    branches,
    members,
    employees,
    ledgers,
    rates,
    bankAccounts,
    demands,
    noInterestMembers
  ] = await Promise.all([
    listResource('branches'),
    listResource('members'),
    listResource('employees'),
    listResource('ledgers'),
    listResource('rates'),
    listResource('bankAccounts'),
    listResource('demands'),
    listResource('noInterestMembers')
  ]);

  return {
    branches,
    members,
    employees,
    ledgers,
    rates,
    bankAccounts,
    demands,
    noInterestMembers
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
  if (filter.branchCode) {
    query.branchCode = cleanUpper(filter.branchCode);
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
  if (filter.dateFrom || filter.dateTo) {
    query.date = {};
    if (filter.dateFrom) query.date.$gte = cleanText(filter.dateFrom);
    if (filter.dateTo) query.date.$lte = cleanText(filter.dateTo);
  }

  const rows = await BankTransaction.find(query).sort({ date: -1, createdAt: -1 }).lean();
  return rows.map((row) => toResponse(row));
}

async function buildMemberLedgerReport({ memberCode, dateFrom = '', dateTo = '' }) {
  const member = await Member.findOne({ code: cleanUpper(memberCode) }).lean();
  if (!member) {
    return null;
  }

  const query = { status: 'Posted' };
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
      particulars = `${particulars} - Recovery`;
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

async function buildAccountStatementReport({ search = '', nature = '', uptoDate = '' } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate });
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

async function buildTrialBalanceReport({ uptoDate = '' } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate });
  return snapshots.map((row) => ({
    ledgerCode: row.code,
    ledgerName: row.name,
    debit: row.closingSide === 'DR' ? row.closing : 0,
    credit: row.closingSide === 'CR' ? row.closing : 0
  }));
}

async function buildBalanceSheetReport({ uptoDate = '' } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate });
  const liabilities = snapshots.filter((row) => row.nature === 'LIABILITY');
  const assets = snapshots.filter((row) => row.nature === 'ASSET');

  return {
    liabilities: liabilities.map((row) => ({ ledgerCode: row.code, ledgerName: row.name, amount: row.closing })),
    assets: assets.map((row) => ({ ledgerCode: row.code, ledgerName: row.name, amount: row.closing })),
    totalLiabilities: liabilities.reduce((sum, row) => sum + row.closing, 0),
    totalAssets: assets.reduce((sum, row) => sum + row.closing, 0)
  };
}

async function buildProfitLossReport({ uptoDate = '' } = {}) {
  const snapshots = await getLedgerSnapshots({ uptoDate });
  const income = snapshots.filter((row) => row.nature === 'INCOME');
  const expense = snapshots.filter((row) => row.nature === 'EXPENSE');

  return {
    income: income.map((row) => ({ ledgerCode: row.code, ledgerName: row.name, amount: row.closing })),
    expense: expense.map((row) => ({ ledgerCode: row.code, ledgerName: row.name, amount: row.closing })),
    totalIncome: income.reduce((sum, row) => sum + row.closing, 0),
    totalExpense: expense.reduce((sum, row) => sum + row.closing, 0)
  };
}

async function buildCashBookReport({ date = '' } = {}) {
  const vouchers = await Voucher.find(date ? { status: 'Posted', date } : { status: 'Posted' }).sort({ date: 1, createdAt: 1 }).lean();
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

async function buildDayBookReport({ date = '' } = {}) {
  const vouchers = await Voucher.find(date ? { status: 'Posted', date } : { status: 'Posted' }).sort({ date: 1, createdAt: 1 }).lean();
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

async function buildVoucherSummaryReport({ date = '' } = {}) {
  const vouchers = await Voucher.find(date ? { status: 'Posted', date } : { status: 'Posted' }).lean();
  const totals = new Map();

  for (const voucher of vouchers) {
    const key = cleanText(voucher.voucherCategory || voucher.transactionType || 'Voucher');
    totals.set(key, (totals.get(key) || 0) + toNumber(voucher.amount, 0));
  }

  return [...totals.entries()].map(([voucherCategory, amount]) => ({ voucherCategory, amount })).sort((a, b) => a.voucherCategory.localeCompare(b.voucherCategory));
}

async function buildMonthlySummaryReport({ branchCode = '', month = '' } = {}) {
  const query = { status: 'Posted' };
  if (branchCode) {
    query.branchCode = cleanUpper(branchCode);
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

async function buildDemandListReport({ month = '' } = {}) {
  const query = {};
  if (month) {
    query.month = cleanText(month);
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

async function buildAllMemberListReport() {
  const rows = await Member.find({}).sort({ updatedAt: -1 }).lean();
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    branchCode: row.branchCode,
    category: row.category,
    membershipNo: row.membershipNo,
    status: row.status
  }));
}

async function buildPaymentReceiptStatementReport({ dateFrom = '', dateTo = '' } = {}) {
  const query = { status: 'Posted' };
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

async function buildBranchListReport() {
  const rows = await Branch.find({}).sort({ code: 1 }).lean();
  return rows.map((row) => ({
    code: row.code,
    place: row.place,
    district: row.district,
    phone: row.phone,
    address: row.address
  }));
}

async function buildDividendReport({ rate = 8 } = {}) {
  const rows = await Member.find({}).sort({ code: 1 }).lean();
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

async function buildDashboardQuickSummary() {
  const summary = await getDashboardSummary();
  const reports = await Promise.all([
    buildAccountStatementReport(),
    buildTrialBalanceReport()
  ]);
  return {
    ...summary,
    reportHighlights: {
      accountStatementRows: reports[0].length,
      trialBalanceRows: reports[1].length
    }
  };
}

module.exports = {
  applyBankAccountEffects,
  applyMemberEffects,
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
  buildJournalLines,
  buildMonthlySummaryReport,
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
  revertMemberEffects,
  seedBankingData,
  settlementLedger,
  updateBankTransaction,
  updateResource,
  updateVoucher
};

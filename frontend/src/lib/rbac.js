export function normalizeRoleIds(roles = []) {
  return roles.map((role) => role.id || role._id).filter(Boolean);
}

export function normalizePermissionCodes(permissions = []) {
  return permissions.map((permission) => permission.code || permission.id || permission).filter(Boolean);
}

export function mapUserForForm(user = {}) {
  return {
    ...user,
    roleIds: normalizeRoleIds(user.roles || [])
  };
}

export function mapRoleForForm(role = {}) {
  return {
    ...role,
    permissionCodes: normalizePermissionCodes(role.permissions || [])
  };
}

const SECTION_ORDER = ['workspace', 'master', 'transactions', 'reports', 'admin'];
const PAGE_ORDER = [
  'dashboard',
  'calendar',
  'notifications',
  'files',
  'society',
  'branches',
  'committee',
  'members',
  'employees',
  'ledgers',
  'rates',
  'bank-accounts',
  'demands',
  'no-interest-members',
  'member',
  'bank',
  'employee',
  'transfer-voucher',
  'receipt-interest',
  'supporting',
  'account-statement-view',
  'member-ledger',
  'balance-sheet',
  'trial-balance',
  'cash-book',
  'day-book',
  'voucher-summary',
  'summary-monthly',
  'demand-list-report',
  'profit-loss',
  'all-member-list',
  'payment-receipt-statement',
  'branch-list-report',
  'dividend-report',
  'audit-trail',
  'users',
  'roles',
  'settings'
];

const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'reverse', 'export', 'print'];

const SECTION_LABELS = {
  admin: 'Admin / Security',
  master: 'Master',
  reports: 'Reports',
  transactions: 'Transactions',
  workspace: 'Workspace'
};

const PAGE_LABELS = {
  'account-statement-view': 'Account Statement View',
  'all-member-list': 'All Member List',
  'audit-trail': 'Audit Trail',
  'balance-sheet': 'Balance Sheet',
  bank: 'Bank',
  'bank-accounts': 'Bank Accounts',
  'branch-list-report': 'Branch List',
  branches: 'Branches',
  'cash-book': 'Cash Book',
  calendar: 'Calendar',
  committee: 'Committee',
  dashboard: 'Dashboard',
  demands: 'Demands',
  'day-book': 'Day Book',
  'dividend-report': 'Dividend Report',
  employees: 'Employees',
  files: 'Files',
  'member-ledger': 'Member Ledger',
  member: 'Member',
  members: 'Members',
  notifications: 'Notifications',
  'no-interest-members': 'No Interest Members',
  'payment-receipt-statement': 'Statement of Payment and Receipt',
  'profit-loss': 'Profit / Loss',
  rates: 'Rates Config',
  'receipt-interest': 'Receipt / Interest',
  roles: 'Roles',
  'settings': 'Settings',
  society: 'Head Office',
  supporting: 'Supporting',
  'summary-monthly': 'Summary / Monthly Report',
  'transfer-voucher': 'Transfer Voucher',
  'trial-balance': 'Trial Balance',
  'voucher-summary': 'Voucher Summary',
  users: 'Users',
  ledgers: 'Ledgers'
};

const ACTION_LABELS = {
  create: 'Create',
  delete: 'Delete',
  edit: 'Edit',
  export: 'Export',
  print: 'Print',
  reverse: 'Reverse',
  view: 'View'
};

function formatTitle(value = '') {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function formatSectionLabel(value = '') {
  return SECTION_LABELS[value] || formatTitle(value);
}

function formatPageLabel(value = '') {
  return PAGE_LABELS[value] || formatTitle(value);
}

function formatActionLabel(value = '') {
  const key = String(value || '').trim().toLowerCase();
  return ACTION_LABELS[key] || formatTitle(key);
}

export function formatPermissionLabel(permission = {}) {
  const pageLabel = permission.pageLabel || formatPageLabel(permission.page || permission.module || '');
  const actionLabel = formatActionLabel(permission.action || '');
  return [pageLabel, actionLabel].filter(Boolean).join(' / ');
}

function normalizePermissionArray(input = []) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.permissions)) return input.permissions;
  if (Array.isArray(input?.data?.permissions)) return input.data.permissions;
  if (Array.isArray(input?.items)) return input.items;
  if (Array.isArray(input?.groups)) {
    return input.groups.flatMap((group) => {
      if (Array.isArray(group?.permissions)) return group.permissions;
      if (Array.isArray(group?.pages)) {
        return group.pages.flatMap((page) => Array.isArray(page?.permissions) ? page.permissions : Array.isArray(page?.items) ? page.items : []);
      }
      return [];
    });
  }
  return [];
}

const REQUEST_PERMISSION_ALIASES = {
  'dashboard.read': ['workspace.dashboard.view'],
  'calendar.read': ['workspace.calendar.view'],
  'files.read': ['workspace.files.view'],
  'files.write': ['workspace.files.view', 'workspace.files.create', 'workspace.files.edit'],
  'files.delete': ['workspace.files.delete'],
  'notifications.read': ['workspace.notifications.view'],
  'notifications.write': ['workspace.notifications.view', 'workspace.notifications.create', 'workspace.notifications.delete'],
  'society.read': ['master.society.view'],
  'society.write': ['master.society.view', 'master.society.edit'],
  'branches.read': ['master.branches.view'],
  'branches.write': ['master.branches.view', 'master.branches.create', 'master.branches.edit', 'master.branches.delete'],
  'committee.read': ['master.committee.view'],
  'committee.write': ['master.committee.view', 'master.committee.create', 'master.committee.edit', 'master.committee.delete'],
  'members.read': ['master.members.view'],
  'members.write': ['master.members.view', 'master.members.create', 'master.members.edit', 'master.members.delete'],
  'employees.read': ['master.employees.view'],
  'employees.write': ['master.employees.view', 'master.employees.create', 'master.employees.edit', 'master.employees.delete'],
  'ledgers.read': ['master.ledgers.view'],
  'ledgers.write': ['master.ledgers.view', 'master.ledgers.create', 'master.ledgers.edit', 'master.ledgers.delete'],
  'rates.read': ['master.rates.view'],
  'rates.write': ['master.rates.view', 'master.rates.create', 'master.rates.edit', 'master.rates.delete'],
  'bank-accounts.read': ['master.bank-accounts.view'],
  'bank-accounts.write': ['master.bank-accounts.view', 'master.bank-accounts.create', 'master.bank-accounts.edit', 'master.bank-accounts.delete'],
  'demands.read': ['master.demands.view'],
  'demands.write': ['master.demands.view', 'master.demands.create', 'master.demands.edit', 'master.demands.delete'],
  'no-interest-members.read': ['master.no-interest-members.view'],
  'no-interest-members.write': ['master.no-interest-members.view', 'master.no-interest-members.create', 'master.no-interest-members.edit', 'master.no-interest-members.delete'],
  'transactions.read': [
    'transactions.member.view',
    'transactions.bank.view',
    'transactions.employee.view',
    'transactions.transfer-voucher.view',
    'transactions.receipt-interest.view',
    'transactions.supporting.view'
  ],
  'transactions.write': [
    'transactions.member.view', 'transactions.member.create', 'transactions.member.edit', 'transactions.member.delete',
    'transactions.bank.view', 'transactions.bank.create', 'transactions.bank.edit', 'transactions.bank.delete',
    'transactions.employee.view', 'transactions.employee.create', 'transactions.employee.edit', 'transactions.employee.delete',
    'transactions.transfer-voucher.view', 'transactions.transfer-voucher.create', 'transactions.transfer-voucher.edit', 'transactions.transfer-voucher.delete',
    'transactions.receipt-interest.view', 'transactions.receipt-interest.create', 'transactions.receipt-interest.edit', 'transactions.receipt-interest.delete',
    'transactions.supporting.view', 'transactions.supporting.create', 'transactions.supporting.edit', 'transactions.supporting.delete'
  ],
  'transactions.reverse': ['transactions.transfer-voucher.reverse'],
  'bank-transactions.read': ['transactions.bank.view'],
  'bank-transactions.write': ['transactions.bank.view', 'transactions.bank.create', 'transactions.bank.edit', 'transactions.bank.delete'],
  'reports.read': [
    'reports.account-statement-view.view',
    'reports.member-ledger.view',
    'reports.balance-sheet.view',
    'reports.trial-balance.view',
    'reports.cash-book.view',
    'reports.day-book.view',
    'reports.voucher-summary.view',
    'reports.summary-monthly.view',
    'reports.demand-list-report.view',
    'reports.profit-loss.view',
    'reports.all-member-list.view',
    'reports.payment-receipt-statement.view',
    'reports.branch-list-report.view',
    'reports.dividend-report.view'
  ],
  'reports.export': [
    'reports.account-statement-view.export', 'reports.account-statement-view.print',
    'reports.member-ledger.export', 'reports.member-ledger.print',
    'reports.balance-sheet.export', 'reports.balance-sheet.print',
    'reports.trial-balance.export', 'reports.trial-balance.print',
    'reports.cash-book.export', 'reports.cash-book.print',
    'reports.day-book.export', 'reports.day-book.print',
    'reports.voucher-summary.export', 'reports.voucher-summary.print',
    'reports.summary-monthly.export', 'reports.summary-monthly.print',
    'reports.demand-list-report.export', 'reports.demand-list-report.print',
    'reports.profit-loss.export', 'reports.profit-loss.print',
    'reports.all-member-list.export', 'reports.all-member-list.print',
    'reports.payment-receipt-statement.export', 'reports.payment-receipt-statement.print',
    'reports.branch-list-report.export', 'reports.branch-list-report.print',
    'reports.dividend-report.export', 'reports.dividend-report.print'
  ],
  'audit.read': ['admin.audit-trail.view'],
  'users.manage': ['admin.users.view', 'admin.users.create', 'admin.users.edit', 'admin.users.delete'],
  'roles.manage': ['admin.roles.view', 'admin.roles.create', 'admin.roles.edit', 'admin.roles.delete'],
  'settings.read': ['admin.settings.view'],
  'settings.write': ['admin.settings.view', 'admin.settings.edit']
};

function normalizePermissionKey(value = '') {
  return String(value || '').trim();
}

function expandRequestedPermissionCode(permission) {
  const key = normalizePermissionKey(permission);
  if (!key) return [];
  if (REQUEST_PERMISSION_ALIASES[key]) return REQUEST_PERMISSION_ALIASES[key].slice();
  if (key.includes('.')) return [key];
  return [];
}

export function expandPermissionCodes(permissionCodes = []) {
  const seen = new Set();
  const expanded = [];

  for (const permission of Array.isArray(permissionCodes) ? permissionCodes : []) {
    for (const resolved of expandRequestedPermissionCode(permission)) {
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      expanded.push(resolved);
    }
  }

  return expanded;
}

function getActionRank(action = '') {
  const key = String(action || '').trim().toLowerCase();
  const index = ACTION_ORDER.indexOf(key);
  return index === -1 ? ACTION_ORDER.length : index;
}

function getPageRank(page = '') {
  const index = PAGE_ORDER.indexOf(String(page || '').trim());
  return index === -1 ? PAGE_ORDER.length : index;
}

function getSectionRank(section = '') {
  const index = SECTION_ORDER.indexOf(String(section || '').trim());
  return index === -1 ? SECTION_ORDER.length : index;
}

export function groupPermissionsByModule(permissions = []) {
  const normalized = normalizePermissionArray(permissions);
  const sectionMap = new Map();

  for (const permission of normalized) {
    const sectionKey = String(permission.section || permission.module || 'general').trim() || 'general';
    const pageKey = String(permission.page || permission.key || sectionKey).trim() || sectionKey;

    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, new Map());
    }

    const pages = sectionMap.get(sectionKey);
    if (!pages.has(pageKey)) {
      pages.set(pageKey, []);
    }

    pages.get(pageKey).push(permission);
  }

  return [...sectionMap.entries()]
    .map(([section, pages]) => ({
      key: section,
      label: formatSectionLabel(section),
      pages: [...pages.entries()]
        .map(([page, items]) => ({
          key: page,
          label: formatPageLabel(page),
          items: items.sort((a, b) => {
            const left = getActionRank(a.action);
            const right = getActionRank(b.action);
            if (left !== right) return left - right;
            return String(a.name || a.code || '').localeCompare(String(b.name || b.code || ''), undefined, { numeric: true, sensitivity: 'base' });
          })
        }))
        .sort((a, b) => {
          const left = getPageRank(a.key);
          const right = getPageRank(b.key);
          if (left !== right) return left - right;
          return String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' });
        })
    }))
    .sort((a, b) => {
      const left = getSectionRank(a.key);
      const right = getSectionRank(b.key);
      if (left !== right) return left - right;
      return String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' });
    });
}

export const groupPermissionsByPage = groupPermissionsByModule;


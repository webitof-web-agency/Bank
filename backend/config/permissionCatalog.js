const ACTION_LABELS = {
  create: 'Create',
  delete: 'Delete',
  edit: 'Edit',
  export: 'Export',
  print: 'Print',
  read: 'View',
  reverse: 'Reverse',
  update: 'Edit',
  view: 'View',
  write: 'Create / Edit / Delete'
};

function createPage(sectionKey, pageKey, label, actions, description) {
  return {
    key: pageKey,
    label,
    actions: Array.isArray(actions) ? actions : ['view'],
    description: String(description || '').trim(),
    section: sectionKey
  };
}

const PERMISSION_SECTIONS = [
  {
    key: 'workspace',
    label: 'Workspace',
    pages: [
      createPage('workspace', 'dashboard', 'Dashboard', ['view'], 'Access the banking dashboard.'),
      createPage('workspace', 'calendar', 'Calendar', ['view', 'create', 'edit', 'delete'], 'View and manage calendar entries.'),
      createPage('workspace', 'notifications', 'Notifications', ['view', 'create', 'delete'], 'View and manage in-app notifications.'),
      createPage('workspace', 'files', 'Files', ['view', 'create', 'edit', 'delete'], 'Browse, upload, rename, and remove files.')
    ]
  },
  {
    key: 'master',
    label: 'Master',
    pages: [
      createPage('master', 'society', 'Head Office', ['view', 'edit'], 'View and update head office profile and branding.'),
      createPage('master', 'branches', 'Branches', ['view', 'create', 'edit', 'delete'], 'Branch master and contact details.'),
      createPage('master', 'committee', 'Committee', ['view', 'create', 'edit', 'delete'], 'Society committee configuration.'),
      createPage('master', 'members', 'Members', ['view', 'create', 'edit', 'delete'], 'Bank member master and identity records.'),
      createPage('master', 'employees', 'Employees', ['view', 'create', 'edit', 'delete'], 'Employee access, roles, and staff profile.'),
      createPage('master', 'ledgers', 'Ledgers', ['view', 'create', 'edit', 'delete'], 'Ledger code, nature, and opening balance.'),
      createPage('master', 'rates', 'Rates Config', ['view', 'create', 'edit', 'delete'], 'Global interest, limits, and demand configuration.'),
      createPage('master', 'bank-accounts', 'Bank Accounts', ['view', 'create', 'edit', 'delete'], 'Operating bank accounts and linkages.'),
      createPage('master', 'demands', 'Demands', ['view', 'create', 'edit', 'delete'], 'Monthly demand master and recovery records.'),
      createPage('master', 'no-interest-members', 'No Interest Members', ['view', 'create', 'edit', 'delete'], 'Members excluded from interest calculations.')
    ]
  },
  {
    key: 'transactions',
    label: 'Transactions',
    pages: [
      createPage('transactions', 'member', 'Member', ['view', 'create', 'edit', 'delete'], 'Loan paid, compulsory deposit, insurance, and recovery transactions.'),
      createPage('transactions', 'bank', 'Bank', ['view', 'create', 'edit', 'delete'], 'Loan receipt, deposit, cheque issue, and transfer entries.'),
      createPage('transactions', 'employee', 'Employee', ['view', 'create', 'edit', 'delete'], 'Advance paid and recovery entries for employees.'),
      createPage('transactions', 'transfer-voucher', 'Transfer Voucher', ['view', 'create', 'edit', 'delete', 'reverse'], 'Transfer voucher paid and recovered from member records.'),
      createPage('transactions', 'receipt-interest', 'Receipt / Interest', ['view', 'create', 'edit', 'delete'], 'Receipt, interest paid, and related member support links.'),
      createPage('transactions', 'supporting', 'Supporting', ['view', 'create', 'edit', 'delete'], 'Demand entry helper screens.')
    ]
  },
  {
    key: 'reports',
    label: 'Reports',
    pages: [
      createPage('reports', 'account-statement-view', 'Account Statement View', ['view', 'export', 'print'], 'Ledger-wise account statement with opening and closing balances.'),
      createPage('reports', 'member-ledger', 'Member Ledger', ['view', 'export', 'print'], 'Member ledger with running balance and summary balances.'),
      createPage('reports', 'balance-sheet', 'Balance Sheet', ['view', 'export', 'print'], 'Liabilities and assets snapshot for the selected date.'),
      createPage('reports', 'trial-balance', 'Trial Balance', ['view', 'export', 'print'], 'Ledger debit and credit balances for trial review.'),
      createPage('reports', 'cash-book', 'Cash Book', ['view', 'export', 'print'], 'Cash ledger entries posted for the selected day or date.'),
      createPage('reports', 'day-book', 'Day Book', ['view', 'export', 'print'], 'Voucher-wise day book with journal line details.'),
      createPage('reports', 'voucher-summary', 'Voucher Summary', ['view', 'export', 'print'], 'Voucher totals grouped by voucher category.'),
      createPage('reports', 'summary-monthly', 'Summary / Monthly Report', ['view', 'export', 'print'], 'Monthly transaction summary filtered by branch.'),
      createPage('reports', 'demand-list-report', 'Demand List', ['view', 'export', 'print'], 'Demand totals, recovery and pending balance.'),
      createPage('reports', 'profit-loss', 'Profit / Loss', ['view', 'export', 'print'], 'Income versus expenditure snapshot.'),
      createPage('reports', 'all-member-list', 'All Member List', ['view', 'export', 'print'], 'Complete member registry with status.'),
      createPage('reports', 'payment-receipt-statement', 'Statement of Payment and Receipt', ['view', 'export', 'print'], 'Payment and receipt statement in voucher order.'),
      createPage('reports', 'branch-list-report', 'Branch List', ['view', 'export', 'print'], 'Branch directory with contact details.'),
      createPage('reports', 'dividend-report', 'Dividend Report', ['view', 'export', 'print'], 'Dividend calculation based on member share balance.')
    ]
  },
  {
    key: 'admin',
    label: 'Admin / Security',
    pages: [
      createPage('admin', 'audit-trail', 'Audit Trail', ['view'], 'View audit and approval history.'),
      createPage('admin', 'users', 'Users', ['view', 'create', 'edit', 'delete'], 'Create, update, and delete users.'),
      createPage('admin', 'roles', 'Roles', ['view', 'create', 'edit', 'delete'], 'Create, update, and delete roles.'),
      createPage('admin', 'settings', 'Settings', ['view', 'edit'], 'View and update system settings.')
    ]
  }
];

function actionCode(sectionKey, pageKey, action) {
  return `${sectionKey}.${pageKey}.${action}`;
}

const PAGE_PERMISSIONS = PERMISSION_SECTIONS.flatMap((section) => (
  section.pages.flatMap((page) => page.actions.map((action) => {
    const code = actionCode(section.key, page.key, action);
    const actionLabel = ACTION_LABELS[action] || action.charAt(0).toUpperCase() + action.slice(1);
    return {
      code,
      name: `${page.label} / ${actionLabel}`,
      module: section.key,
      section: section.key,
      sectionLabel: section.label,
      page: page.key,
      pageLabel: page.label,
      action,
      description: page.description,
      legacyCodes: []
    };
  }))
));

function indexByCode(items) {
  return items.reduce((acc, item) => {
    acc[item.code] = item;
    return acc;
  }, {});
}

const PAGE_PERMISSION_MAP = indexByCode(PAGE_PERMISSIONS);

function pageCodes(sectionKey, pageKey, actions) {
  return actions.map((action) => actionCode(sectionKey, pageKey, action));
}

const LEGACY_PERMISSION_ALIASES = {
  'dashboard.read': pageCodes('workspace', 'dashboard', ['view']),
  'calendar.read': pageCodes('workspace', 'calendar', ['view']),
  'notifications.read': pageCodes('workspace', 'notifications', ['view']),
  'notifications.write': pageCodes('workspace', 'notifications', ['view', 'create', 'delete']),
  'files.read': pageCodes('workspace', 'files', ['view']),
  'files.write': pageCodes('workspace', 'files', ['view', 'create', 'edit']),
  'files.delete': pageCodes('workspace', 'files', ['delete']),
  'society.read': pageCodes('master', 'society', ['view']),
  'society.write': pageCodes('master', 'society', ['edit']),
  'branches.read': pageCodes('master', 'branches', ['view']),
  'branches.write': pageCodes('master', 'branches', ['create', 'edit', 'delete']),
  'committee.read': pageCodes('master', 'committee', ['view']),
  'committee.write': pageCodes('master', 'committee', ['create', 'edit', 'delete']),
  'members.read': pageCodes('master', 'members', ['view']),
  'members.write': pageCodes('master', 'members', ['create', 'edit', 'delete']),
  'employees.read': pageCodes('master', 'employees', ['view']),
  'employees.write': pageCodes('master', 'employees', ['create', 'edit', 'delete']),
  'ledgers.read': pageCodes('master', 'ledgers', ['view']),
  'ledgers.write': pageCodes('master', 'ledgers', ['create', 'edit', 'delete']),
  'rates.read': pageCodes('master', 'rates', ['view']),
  'rates.write': pageCodes('master', 'rates', ['create', 'edit', 'delete']),
  'bank-accounts.read': pageCodes('master', 'bank-accounts', ['view']),
  'bank-accounts.write': pageCodes('master', 'bank-accounts', ['create', 'edit', 'delete']),
  'demands.read': pageCodes('master', 'demands', ['view']),
  'demands.write': pageCodes('master', 'demands', ['create', 'edit', 'delete']),
  'no-interest-members.read': pageCodes('master', 'no-interest-members', ['view']),
  'no-interest-members.write': pageCodes('master', 'no-interest-members', ['create', 'edit', 'delete']),
  'transactions.read': [
    ...pageCodes('transactions', 'member', ['view']),
    ...pageCodes('transactions', 'bank', ['view']),
    ...pageCodes('transactions', 'employee', ['view']),
    ...pageCodes('transactions', 'transfer-voucher', ['view']),
    ...pageCodes('transactions', 'receipt-interest', ['view']),
    ...pageCodes('transactions', 'supporting', ['view'])
  ],
  'transactions.write': [
    ...pageCodes('transactions', 'member', ['create', 'edit', 'delete']),
    ...pageCodes('transactions', 'bank', ['create', 'edit', 'delete']),
    ...pageCodes('transactions', 'employee', ['create', 'edit', 'delete']),
    ...pageCodes('transactions', 'transfer-voucher', ['create', 'edit', 'delete']),
    ...pageCodes('transactions', 'receipt-interest', ['create', 'edit', 'delete']),
    ...pageCodes('transactions', 'supporting', ['create', 'edit', 'delete'])
  ],
  'transactions.reverse': pageCodes('transactions', 'transfer-voucher', ['reverse']),
  'bank-transactions.read': pageCodes('transactions', 'bank', ['view']),
  'bank-transactions.write': pageCodes('transactions', 'bank', ['create', 'edit', 'delete']),
  'reports.read': [
    ...pageCodes('reports', 'account-statement-view', ['view']),
    ...pageCodes('reports', 'member-ledger', ['view']),
    ...pageCodes('reports', 'balance-sheet', ['view']),
    ...pageCodes('reports', 'trial-balance', ['view']),
    ...pageCodes('reports', 'cash-book', ['view']),
    ...pageCodes('reports', 'day-book', ['view']),
    ...pageCodes('reports', 'voucher-summary', ['view']),
    ...pageCodes('reports', 'summary-monthly', ['view']),
    ...pageCodes('reports', 'demand-list-report', ['view']),
    ...pageCodes('reports', 'profit-loss', ['view']),
    ...pageCodes('reports', 'all-member-list', ['view']),
    ...pageCodes('reports', 'payment-receipt-statement', ['view']),
    ...pageCodes('reports', 'branch-list-report', ['view']),
    ...pageCodes('reports', 'dividend-report', ['view'])
  ],
  'reports.export': [
    ...pageCodes('reports', 'account-statement-view', ['export', 'print']),
    ...pageCodes('reports', 'member-ledger', ['export', 'print']),
    ...pageCodes('reports', 'balance-sheet', ['export', 'print']),
    ...pageCodes('reports', 'trial-balance', ['export', 'print']),
    ...pageCodes('reports', 'cash-book', ['export', 'print']),
    ...pageCodes('reports', 'day-book', ['export', 'print']),
    ...pageCodes('reports', 'voucher-summary', ['export', 'print']),
    ...pageCodes('reports', 'summary-monthly', ['export', 'print']),
    ...pageCodes('reports', 'demand-list-report', ['export', 'print']),
    ...pageCodes('reports', 'profit-loss', ['export', 'print']),
    ...pageCodes('reports', 'all-member-list', ['export', 'print']),
    ...pageCodes('reports', 'payment-receipt-statement', ['export', 'print']),
    ...pageCodes('reports', 'branch-list-report', ['export', 'print']),
    ...pageCodes('reports', 'dividend-report', ['export', 'print'])
  ],
  'audit.read': pageCodes('admin', 'audit-trail', ['view']),
  'users.manage': pageCodes('admin', 'users', ['create', 'edit', 'delete']),
  'roles.manage': pageCodes('admin', 'roles', ['create', 'edit', 'delete']),
  'settings.read': pageCodes('admin', 'settings', ['view']),
  'settings.write': pageCodes('admin', 'settings', ['edit'])
};

const LEGACY_PERMISSION_CODES = Object.keys(LEGACY_PERMISSION_ALIASES);
const PAGE_PERMISSION_CODES = PAGE_PERMISSIONS.map((permission) => permission.code);
const PERMISSION_CODES = [...new Set([...PAGE_PERMISSION_CODES, ...LEGACY_PERMISSION_CODES])];

const PERMISSION_CODE_SET = new Set(PERMISSION_CODES);

function resolvePermissionCode(code) {
  const value = String(code || '').trim();
  if (!value) return [];
  if (PAGE_PERMISSION_MAP[value]) return [value];
  if (LEGACY_PERMISSION_ALIASES[value]) return LEGACY_PERMISSION_ALIASES[value].slice();
  return [];
}

function expandPermissionCodes(permissionCodes = []) {
  const seen = new Set();
  const expanded = [];

  for (const code of Array.isArray(permissionCodes) ? permissionCodes : []) {
    for (const resolved of resolvePermissionCode(code)) {
      if (!seen.has(resolved)) {
        seen.add(resolved);
        expanded.push(resolved);
      }
    }
  }

  return expanded;
}

function isKnownPermissionCode(code) {
  return PERMISSION_CODE_SET.has(String(code || '').trim());
}

function buildPermissionSections() {
  return PERMISSION_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    pages: section.pages.map((page) => ({
      key: page.key,
      label: page.label,
      description: page.description,
      permissions: page.actions.map((action) => PAGE_PERMISSION_MAP[actionCode(section.key, page.key, action)])
    }))
  }));
}

function buildPermissionGroups() {
  return buildPermissionSections();
}

module.exports = {
  ACTION_LABELS,
  LEGACY_PERMISSION_ALIASES,
  LEGACY_PERMISSION_CODES,
  PAGE_PERMISSIONS,
  PAGE_PERMISSION_CODES,
  PAGE_PERMISSION_MAP,
  PERMISSION_CODES,
  PERMISSION_SECTIONS,
  buildPermissionGroups,
  buildPermissionSections,
  expandPermissionCodes,
  isKnownPermissionCode,
  resolvePermissionCode
};



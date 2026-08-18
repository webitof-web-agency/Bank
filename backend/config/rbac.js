const PERMISSIONS = [
  { code: 'dashboard.read', name: 'View Dashboard', module: 'dashboard', action: 'read', description: 'Access the banking dashboard.' },
  { code: 'society.read', name: 'Read Head Office Details', module: 'society', action: 'read', description: 'View head office profile and branding.' },
  { code: 'society.write', name: 'Write Head Office Details', module: 'society', action: 'write', description: 'Update head office profile and branding.' },
  { code: 'branches.read', name: 'Read Branches', module: 'branches', action: 'read', description: 'View branch master records.' },
  { code: 'branches.write', name: 'Write Branches', module: 'branches', action: 'write', description: 'Create, edit, and delete branches.' },
  { code: 'committee.read', name: 'Read Committee', module: 'committee', action: 'read', description: 'View committee members.' },
  { code: 'committee.write', name: 'Write Committee', module: 'committee', action: 'write', description: 'Update committee members.' },
  { code: 'members.read', name: 'Read Members', module: 'members', action: 'read', description: 'View member master records.' },
  { code: 'members.write', name: 'Write Members', module: 'members', action: 'write', description: 'Create, edit, and delete members.' },
  { code: 'employees.read', name: 'Read Employees', module: 'employees', action: 'read', description: 'View employee master records.' },
  { code: 'employees.write', name: 'Write Employees', module: 'employees', action: 'write', description: 'Create, edit, and delete employees.' },
  { code: 'ledgers.read', name: 'Read Ledgers', module: 'ledgers', action: 'read', description: 'View ledger master records.' },
  { code: 'ledgers.write', name: 'Write Ledgers', module: 'ledgers', action: 'write', description: 'Create, edit, and delete ledgers.' },
  { code: 'rates.read', name: 'Read Rates Config', module: 'rates', action: 'read', description: 'View global rates configuration.' },
  { code: 'rates.write', name: 'Write Rates Config', module: 'rates', action: 'write', description: 'Update global rates configuration.' },
  { code: 'bank-accounts.read', name: 'Read Bank Accounts', module: 'bank-accounts', action: 'read', description: 'View bank account master records.' },
  { code: 'bank-accounts.write', name: 'Write Bank Accounts', module: 'bank-accounts', action: 'write', description: 'Create, edit, and delete bank accounts.' },
  { code: 'demands.read', name: 'Read Demands', module: 'demands', action: 'read', description: 'View demand records.' },
  { code: 'demands.write', name: 'Write Demands', module: 'demands', action: 'write', description: 'Create, edit, and delete demand records.' },
  { code: 'no-interest-members.read', name: 'Read No Interest Members', module: 'no-interest-members', action: 'read', description: 'View members excluded from interest.' },
  { code: 'no-interest-members.write', name: 'Write No Interest Members', module: 'no-interest-members', action: 'write', description: 'Create, edit, and delete no-interest members.' },
  { code: 'transactions.read', name: 'Read Transactions', module: 'transactions', action: 'read', description: 'View voucher and transaction records.' },
  { code: 'transactions.write', name: 'Write Transactions', module: 'transactions', action: 'write', description: 'Create and edit vouchers and transactions.' },
  { code: 'bank-transactions.read', name: 'Read Bank Transactions', module: 'bank-transactions', action: 'read', description: 'View bank transaction records.' },
  { code: 'bank-transactions.write', name: 'Write Bank Transactions', module: 'bank-transactions', action: 'write', description: 'Create, edit, and delete bank transactions.' },
  { code: 'reports.read', name: 'Read Reports', module: 'reports', action: 'read', description: 'View accounting and operational reports.' },
  { code: 'reports.export', name: 'Export Reports', module: 'reports', action: 'export', description: 'Export or print reports.' },
  { code: 'audit.read', name: 'Read Audit Trail', module: 'audit', action: 'read', description: 'View audit and approval history.' },
  { code: 'users.manage', name: 'Manage Users', module: 'users', action: 'manage', description: 'Create, update, and delete users.' },
  { code: 'roles.manage', name: 'Manage Roles', module: 'roles', action: 'manage', description: 'Create, update, and delete roles.' },
  { code: 'files.read', name: 'Read Files', module: 'files', action: 'read', description: 'Browse folders and files.' },
  { code: 'files.write', name: 'Write Files', module: 'files', action: 'write', description: 'Upload, rename, and create folders.' },
  { code: 'files.delete', name: 'Delete Files', module: 'files', action: 'delete', description: 'Remove files and folders.' },
  { code: 'settings.read', name: 'Read Settings', module: 'settings', action: 'read', description: 'View system settings.' },
  { code: 'settings.write', name: 'Write Settings', module: 'settings', action: 'write', description: 'Update system settings.' }
];

const PERMISSION_CODES = PERMISSIONS.map((permission) => permission.code);

const PERMISSION_GROUPS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: ['dashboard.read']
  },
  {
    key: 'masters',
    label: 'Masters',
    permissions: [
      'society.read',
      'society.write',
      'branches.read',
      'branches.write',
      'committee.read',
      'committee.write',
      'members.read',
      'members.write',
      'employees.read',
      'employees.write',
      'ledgers.read',
      'ledgers.write',
      'rates.read',
      'rates.write',
      'bank-accounts.read',
      'bank-accounts.write',
      'demands.read',
      'demands.write',
      'no-interest-members.read',
      'no-interest-members.write'
    ]
  },
  {
    key: 'transactions',
    label: 'Transactions',
    permissions: [
      'transactions.read',
      'transactions.write',
      'bank-transactions.read',
      'bank-transactions.write'
    ]
  },
  {
    key: 'reports',
    label: 'Reports',
    permissions: [
      'reports.read',
      'reports.export'
    ]
  },
  {
    key: 'admin',
    label: 'Admin / Security',
    permissions: [
      'audit.read',
      'users.manage',
      'roles.manage',
      'settings.read',
      'settings.write',
      'files.read',
      'files.write',
      'files.delete'
    ]
  }
];

const ROLE_TEMPLATES = [
  {
    code: 'admin',
    label: 'System Admin',
    description: 'Full platform access including users, roles, settings, masters, transactions and reports.'
  },
  {
    code: 'manager',
    label: 'Branch Manager',
    description: 'Branch master, member master, employee, transaction and report access.'
  },
  {
    code: 'accountant',
    label: 'Accountant',
    description: 'Ledger, rates configuration, voucher and financial report access.'
  },
  {
    code: 'cashier',
    label: 'Cashier',
    description: 'Cash/bank transaction posting and operational reporting.'
  },
  {
    code: 'teller',
    label: 'Teller',
    description: 'Limited front-office transaction access.'
  },
  {
    code: 'auditor',
    label: 'Auditor',
    description: 'Read-only reporting and audit access.'
  }
];

const DEFAULT_ROLE_DEFINITIONS = [
  {
    code: 'admin',
    name: 'Admin',
    description: 'Full access to the banking system.',
    isSystem: true,
    permissions: PERMISSION_CODES
  },
  {
    code: 'manager',
    name: 'Manager',
    description: 'Broad access to masters, transactions, reports, and user administration.',
    isSystem: true,
    permissions: [
      'dashboard.read',
      'society.read',
      'society.write',
      'branches.read',
      'branches.write',
      'committee.read',
      'committee.write',
      'members.read',
      'members.write',
      'employees.read',
      'employees.write',
      'ledgers.read',
      'ledgers.write',
      'rates.read',
      'rates.write',
      'bank-accounts.read',
      'bank-accounts.write',
      'demands.read',
      'demands.write',
      'no-interest-members.read',
      'no-interest-members.write',
      'transactions.read',
      'transactions.write',
      'bank-transactions.read',
      'bank-transactions.write',
      'reports.read',
      'reports.export',
      'users.manage',
      'roles.manage',
      'settings.read',
      'settings.write',
      'files.read',
      'files.write',
      'files.delete'
    ]
  },
  {
    code: 'viewer',
    name: 'Viewer',
    description: 'Read-only access for masters and reports.',
    isSystem: true,
    permissions: [
      'dashboard.read',
      'society.read',
      'branches.read',
      'committee.read',
      'members.read',
      'employees.read',
      'ledgers.read',
      'rates.read',
      'bank-accounts.read',
      'demands.read',
      'no-interest-members.read',
      'transactions.read',
      'bank-transactions.read',
      'reports.read',
      'audit.read',
      'settings.read',
      'files.read'
    ]
  }
];

const DEMO_ROLE_DEFINITIONS = [
  {
    code: 'branch-manager',
    name: 'Branch Manager',
    description: 'Can manage branch masters, member masters, transactions, and reporting.',
    isSystem: false,
    permissions: [
      'dashboard.read',
      'society.read',
      'branches.read',
      'branches.write',
      'committee.read',
      'committee.write',
      'members.read',
      'members.write',
      'employees.read',
      'employees.write',
      'ledgers.read',
      'ledgers.write',
      'rates.read',
      'rates.write',
      'bank-accounts.read',
      'bank-accounts.write',
      'demands.read',
      'demands.write',
      'no-interest-members.read',
      'no-interest-members.write',
      'transactions.read',
      'transactions.write',
      'bank-transactions.read',
      'bank-transactions.write',
      'reports.read',
      'reports.export',
      'settings.read'
    ]
  },
  {
    code: 'accountant',
    name: 'Accountant',
    description: 'Can manage ledgers, rates configuration, vouchers, and financial reports.',
    isSystem: false,
    permissions: [
      'dashboard.read',
      'society.read',
      'branches.read',
      'committee.read',
      'members.read',
      'members.write',
      'employees.read',
      'employees.write',
      'ledgers.read',
      'ledgers.write',
      'rates.read',
      'rates.write',
      'bank-accounts.read',
      'bank-accounts.write',
      'demands.read',
      'demands.write',
      'no-interest-members.read',
      'transactions.read',
      'transactions.write',
      'bank-transactions.read',
      'bank-transactions.write',
      'reports.read',
      'reports.export',
      'settings.read'
    ]
  },
  {
    code: 'cashier',
    name: 'Cashier',
    description: 'Can post cash and bank transactions, and review operational reports.',
    isSystem: false,
    permissions: [
      'dashboard.read',
      'members.read',
      'employees.read',
      'ledgers.read',
      'bank-accounts.read',
      'bank-accounts.write',
      'demands.read',
      'no-interest-members.read',
      'transactions.read',
      'transactions.write',
      'bank-transactions.read',
      'bank-transactions.write',
      'reports.read',
      'settings.read'
    ]
  },
  {
    code: 'teller',
    name: 'Teller',
    description: 'Front-office transaction role with limited operational access.',
    isSystem: false,
    permissions: [
      'dashboard.read',
      'members.read',
      'employees.read',
      'bank-accounts.read',
      'transactions.read',
      'transactions.write',
      'bank-transactions.read',
      'reports.read'
    ]
  },
  {
    code: 'auditor',
    name: 'Auditor',
    description: 'Read-only review access for audits and compliance checks.',
    isSystem: false,
    permissions: [
      'dashboard.read',
      'society.read',
      'branches.read',
      'committee.read',
      'members.read',
      'employees.read',
      'ledgers.read',
      'rates.read',
      'bank-accounts.read',
      'demands.read',
      'no-interest-members.read',
      'transactions.read',
      'bank-transactions.read',
      'reports.read',
      'audit.read',
      'settings.read'
    ]
  }
];

const DEMO_USER_DEFINITIONS = [
  {
    code: 'EMP-1001',
    fullName: 'Relationship Manager',
    username: 'relationship.manager',
    email: 'relationship.manager@bank.local',
    password: 'Manager@12345',
    roleCodes: ['manager'],
    mobileNo: '+91 90000 10001',
    address: 'Mumbai Main Branch',
    gender: 'Male',
    designation: 'Relationship Manager',
    branchCode: 'BR01',
    status: 'Active',
    payload: {
      department: 'Branch Operations',
      branch: 'Mumbai Main Branch'
    }
  },
  {
    code: 'EMP-1002',
    fullName: 'Branch Manager',
    username: 'branch.manager',
    email: 'branch.manager@bank.local',
    password: 'Branch@12345',
    roleCodes: ['branch-manager'],
    mobileNo: '+91 90000 10002',
    address: 'Delhi Central Branch',
    gender: 'Female',
    designation: 'Branch Manager',
    branchCode: 'BR02',
    status: 'Active',
    payload: {
      department: 'Branch Operations',
      branch: 'Delhi Central Branch'
    }
  },
  {
    code: 'EMP-1003',
    fullName: 'Cash Teller',
    username: 'teller',
    email: 'teller@bank.local',
    password: 'Teller@12345',
    roleCodes: ['teller'],
    mobileNo: '+91 90000 10003',
    address: 'Pune City Branch',
    gender: 'Male',
    designation: 'Cash Teller',
    branchCode: 'BR03',
    status: 'Active',
    payload: {
      department: 'Front Office',
      branch: 'Pune City Branch'
    }
  },
  {
    code: 'EMP-1004',
    fullName: 'Compliance Auditor',
    username: 'auditor',
    email: 'auditor@bank.local',
    password: 'Audit@12345',
    roleCodes: ['auditor'],
    mobileNo: '+91 90000 10004',
    address: 'Head Office',
    gender: 'Female',
    designation: 'Compliance Auditor',
    branchCode: 'BR01',
    status: 'Active',
    payload: {
      department: 'Audit & Compliance',
      branch: 'Head Office'
    }
  }
];

module.exports = {
  DEFAULT_ROLE_DEFINITIONS,
  DEMO_ROLE_DEFINITIONS,
  DEMO_USER_DEFINITIONS,
  PERMISSION_GROUPS,
  PERMISSION_CODES,
  PERMISSIONS,
  ROLE_TEMPLATES
};




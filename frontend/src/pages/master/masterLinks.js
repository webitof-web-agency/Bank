import {
  GitBranch,
  Users,
  ShieldCheck,
  BookOpen,
  Percent,
  Landmark,
  FileText
} from 'lucide-react';

export const MASTER_LINKS = [
  {
    label: 'Branches',
    path: '/app/master/branches',
    icon: GitBranch,
    permission: 'master.branches.view',
    description: 'Branch master and contact details.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Employees',
    path: '/app/master/employees',
    icon: Users,
    permission: ['master.employees.view', 'admin.users.view'],
    description: 'Employee access, roles, and staff profile.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Manager Master',
    path: '/app/master/managers',
    icon: Users,
    permission: ['employees.read', 'users.manage'],
    description: 'Dedicated manager master view.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Members',
    path: '/app/master/members',
    icon: Users,
    permission: 'master.members.view',
    description: 'Bank member master and identity records.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Committee',
    path: '/app/master/committee',
    icon: ShieldCheck,
    permission: 'master.committee.view',
    description: 'Society committee configuration.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Ledgers',
    path: '/app/master/ledgers',
    icon: BookOpen,
    permission: 'master.ledgers.view',
    description: 'Ledger code, nature, and opening balance.',
    group: 'Accounting',
    tone: 'amber'
  },
  {
    label: 'Rates Config',
    path: '/app/master/rates',
    icon: Percent,
    permission: 'master.rates.view',
    description: 'Global interest, limits, and demand configuration.',
    group: 'Accounting',
    tone: 'amber'
  },
  {
    label: 'Bank Accounts',
    path: '/app/master/bank-accounts',
    icon: Landmark,
    permission: 'master.bank-accounts.view',
    description: 'Operating bank accounts and linkages.',
    group: 'Accounting',
    tone: 'amber'
  },
];




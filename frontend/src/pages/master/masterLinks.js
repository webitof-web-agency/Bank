import {
  GitBranch,
  Users,
  ShieldCheck,
  BookOpen,
  Percent,
  Landmark,
  FileText,
  Ban
} from 'lucide-react';

export const MASTER_LINKS = [
  {
    label: 'Branches',
    path: '/app/master/branches',
    icon: GitBranch,
    permission: 'branches.read',
    description: 'Branch master and contact details.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Employees',
    path: '/app/master/employees',
    icon: Users,
    permission: ['employees.read', 'users.manage'],
    description: 'Employee access, roles, and staff profile.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Members',
    path: '/app/master/members',
    icon: Users,
    permission: 'members.read',
    description: 'Bank member master and identity records.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Committee',
    path: '/app/master/committee',
    icon: ShieldCheck,
    permission: 'committee.read',
    description: 'Society committee configuration.',
    group: 'Operations',
    tone: 'emerald'
  },
  {
    label: 'Ledgers',
    path: '/app/master/ledgers',
    icon: BookOpen,
    permission: 'ledgers.read',
    description: 'Ledger code, nature, and opening balance.',
    group: 'Accounting',
    tone: 'amber'
  },
  {
    label: 'Rates',
    path: '/app/master/rates',
    icon: Percent,
    permission: 'rates.read',
    description: 'Interest and scheme rate master.',
    group: 'Accounting',
    tone: 'amber'
  },
  {
    label: 'Bank Accounts',
    path: '/app/master/bank-accounts',
    icon: Landmark,
    permission: 'bank-accounts.read',
    description: 'Operating bank accounts and linkages.',
    group: 'Accounting',
    tone: 'amber'
  },
  {
    label: 'Demands',
    path: '/app/master/demands',
    icon: FileText,
    permission: 'demands.read',
    description: 'Monthly demand master and recovery records.',
    group: 'Accounting',
    tone: 'amber'
  },
  {
    label: 'No Interest Members',
    path: '/app/master/no-interest-members',
    icon: Ban,
    permission: 'no-interest-members.read',
    description: 'Members excluded from interest calculations.',
    group: 'Accounting',
    tone: 'amber'
  }
];

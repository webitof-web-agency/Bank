import { Bell, Building2, CalendarClock, Archive, KeyRound, ShieldCheck, Mail } from 'lucide-react';

export const SETTINGS_LINKS = [
  {
    label: 'Head Office',
    path: '/app/settings/head-office',
    icon: Building2,
    permission: 'society.read',
    description: 'Head office profile, code, and primary branch details.',
    group: 'Configuration',
    tone: 'slate'
  },
  {
    label: 'Change Password',
    path: '/app/settings/change-password',
    icon: KeyRound,
    permission: 'settings.read',
    description: 'Update your account password from a dedicated page.',
    group: 'Administration',
    tone: 'slate'
  },
  {
    label: 'User Rights',
    path: '/app/settings/user-rights',
    icon: ShieldCheck,
    permission: 'roles.manage',
    description: 'Role and permission control center.',
    group: 'Administration',
    tone: 'emerald'
  },
  {
    label: 'Backup & Restore',
    path: '/app/settings/backup-restore',
    icon: Archive,
    permission: 'settings.read',
    description: 'Database backup and restore utilities.',
    group: 'Administration',
    tone: 'amber'
  },
  {
    label: 'Financial Year Closing',
    path: '/app/settings/financial-year-closing',
    icon: CalendarClock,
    permission: 'settings.read',
    description: 'Year-end close metadata and controls.',
    group: 'Administration',
    tone: 'blue'
  }
];

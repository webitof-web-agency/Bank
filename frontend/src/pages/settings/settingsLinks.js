import { Bell, Building2, CalendarClock, Archive, KeyRound, ShieldCheck, Mail, MessageSquare, HardDrive } from 'lucide-react';

export const SETTINGS_LINKS = [
  {
    label: 'Head Office',
    path: '/app/settings/head-office',
    icon: Building2,
    permission: 'society.read',
    description: 'Head office code, location, and contact details.',
    group: 'Configuration',
    tone: 'slate'
  },
  {
    label: 'Society Details',
    path: '/app/settings/society-details',
    icon: Building2,
    permission: 'society.read',
    description: 'Registered society identity used on letterheads and printed reports.',
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
    label: 'Manage Roles',
    path: '/app/roles',
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
    label: 'Google Drive',
    path: '/app/settings/google-drive',
    icon: HardDrive,
    permission: 'settings.read',
    description: 'Connect Google Drive for daily database backups (latest 7 kept) and file uploads.',
    group: 'Administration',
    tone: 'emerald'
  },
  {
    label: 'Financial Year Closing',
    path: '/app/settings/financial-year-closing',
    icon: CalendarClock,
    permission: 'settings.read',
    description: 'Year-end close metadata and controls.',
    group: 'Administration',
    tone: 'blue'
  },
  {
    label: 'SMS',
    path: '/app/settings/sms',
    icon: MessageSquare,
    permission: 'settings.read',
    description: 'Flowit SMS configuration status, DLT templates, and the SMS log.',
    group: 'Communication',
    tone: 'blue'
  },
  {
    label: 'Storage Providers',
    path: '/app/settings/storage',
    icon: Archive,
    permission: 'settings_manage',
    description: 'Configure Local, GCS, or S3 storage for file uploads.',
    group: 'Configuration',
    tone: 'violet'
  }
];

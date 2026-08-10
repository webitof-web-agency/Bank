import { Bell, Building2, CalendarClock, Archive, KeyRound, ShieldCheck, Mail } from 'lucide-react';

export const SETTINGS_LINKS = [
  {
    label: 'Society Details',
    path: '/app/settings/society-details',
    icon: Building2,
    permission: 'society.read',
    description: 'Society profile, register number, and branding fields.',
    group: 'Configuration',
    tone: 'slate'
  },
  {
    label: 'Branding',
    path: '/app/settings/branding',
    icon: Building2,
    permission: 'settings.read',
    description: 'Logos, app title, and visual identity.',
    group: 'Configuration',
    tone: 'slate'
  },
  {
    label: 'UI Settings',
    path: '/app/settings/ui-settings',
    icon: Bell,
    permission: 'settings.read',
    description: 'Browser title and interface preferences.',
    group: 'Configuration',
    tone: 'slate'
  },
  {
    label: 'SMTP & Email',
    path: '/app/settings/smtp-email',
    icon: Mail,
    permission: 'settings.read',
    description: 'Mail server configuration for OTPs and alerts.',
    group: 'Communication',
    tone: 'amber'
  },
  {
    label: 'Notifications',
    path: '/app/settings/notifications',
    icon: Bell,
    permission: 'settings.read',
    description: 'In-app alerts and email delivery preferences.',
    group: 'Communication',
    tone: 'blue'
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

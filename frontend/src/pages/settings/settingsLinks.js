import { Bell, Building2, Globe, Paintbrush, Mail } from 'lucide-react';

export const SETTINGS_LINKS = [
  {
    label: 'Business Identity',
    path: '/app/settings/business-identity',
    icon: Building2,
    permission: 'settings.read',
    description: 'Company profile used across the system.',
    group: 'Configuration',
    tone: 'slate'
  },
  {
    label: 'Branding',
    path: '/app/settings/branding',
    icon: Paintbrush,
    permission: 'settings.read',
    description: 'Logos, app title, and visual identity.',
    group: 'Configuration',
    tone: 'slate'
  },
  {
    label: 'UI Settings',
    path: '/app/settings/ui-settings',
    icon: Globe,
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
  }
];

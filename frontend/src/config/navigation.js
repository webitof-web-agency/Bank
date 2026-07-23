import { ArrowLeftRight, Bell, Calendar, FolderOpen, LayoutDashboard, LayoutGrid, Settings, ShieldCheck } from 'lucide-react';
import { MASTER_LINKS } from '../pages/master/masterLinks';
import { REPORT_NAV_LINKS } from '../pages/reports/reportLinks';
import { TRANSACTION_LINKS } from '../pages/transactions/transactionLinks';
import { SETTINGS_LINKS } from '../pages/settings/settingsLinks';

export const navigationGroups = [
  {
    title: 'Workspace',
    items: [
      { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
      { label: 'Calendar', path: '/app/calendar', icon: Calendar },
      { label: 'Files', path: '/app/files', icon: FolderOpen, permission: 'files.read' },
      { label: 'Notifications', path: '/app/notifications', icon: Bell }
    ]
  },
  {
    title: 'Master',
    items: [
      { label: 'Master', icon: LayoutGrid, children: MASTER_LINKS }
    ]
  },
  {
    title: 'Transactions',
    items: [
      { label: 'Transactions', icon: ArrowLeftRight, children: TRANSACTION_LINKS }
    ]
  },
  {
    title: 'Reports',
    items: [
      { label: 'Reports', path: '/app/reports', icon: LayoutGrid, children: REPORT_NAV_LINKS }
    ]
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', icon: Settings, children: SETTINGS_LINKS }
    ]
  },
  {
    title: 'Administration',
    items: [
      { label: 'Roles', path: '/app/roles', icon: ShieldCheck, permission: 'roles.manage' }
    ]
  }
];

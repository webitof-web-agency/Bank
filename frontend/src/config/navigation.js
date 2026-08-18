import { LayoutDashboard, LayoutGrid, ArrowLeftRight, FileText, Settings } from 'lucide-react';
import { MASTER_LINKS } from '../pages/master/masterLinks';
import { REPORT_NAV_LINKS } from '../pages/reports/reportLinks';
import { TRANSACTION_LINKS } from '../pages/transactions/transactionLinks';
import { SETTINGS_LINKS } from '../pages/settings/settingsLinks';

export const navigationGroups = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard, permission: 'workspace.dashboard.view' }
    ]
  },
  {
    title: 'Master',
    items: [
      { label: 'Masters', icon: LayoutGrid, children: MASTER_LINKS }
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
      { label: 'Reports', path: '/app/reports', icon: FileText, children: REPORT_NAV_LINKS }
    ]
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', path: '/app/settings/overview', icon: Settings, children: SETTINGS_LINKS }
    ]
  }
];

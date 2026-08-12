const MODULE_LABELS = {
  auth: 'Auth',
  files: 'Files',
  master: 'Master',
  transaction: 'Transaction',
  settings: 'Settings',
  reports: 'Reports',
  system: 'System',
  banking: 'Banking'
};

const TYPE_LABELS = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  security: 'Security',
  transaction: 'Transaction',
  master: 'Master',
  system: 'System'
};

const SEVERITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical'
};

const TONE_CLASSES = {
  info: 'border-blue-100 bg-blue-50 text-blue-700',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
  error: 'border-rose-100 bg-rose-50 text-rose-700',
  security: 'border-violet-100 bg-violet-50 text-violet-700',
  transaction: 'border-cyan-100 bg-cyan-50 text-cyan-700',
  master: 'border-slate-200 bg-slate-50 text-slate-700',
  system: 'border-slate-200 bg-slate-50 text-slate-700',
  low: 'border-slate-200 bg-slate-50 text-slate-700',
  medium: 'border-amber-100 bg-amber-50 text-amber-700',
  high: 'border-rose-100 bg-rose-50 text-rose-700',
  critical: 'border-rose-200 bg-rose-100 text-rose-800'
};

export const NOTIFICATION_MODULE_OPTIONS = [
  { value: '', label: 'All modules' },
  ...Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label }))
];

export const NOTIFICATION_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))
];

export const NOTIFICATION_SEVERITY_OPTIONS = [
  { value: '', label: 'All severity' },
  ...Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }))
];

export function getNotificationModuleLabel(value = '') {
  const key = String(value || '').toLowerCase();
  return MODULE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'System');
}

export function getNotificationTypeLabel(value = '') {
  const key = String(value || '').toLowerCase();
  return TYPE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Info');
}

export function getNotificationSeverityLabel(value = '') {
  const key = String(value || '').toLowerCase();
  return SEVERITY_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Medium');
}

export function getNotificationTone(value = '', fallback = 'info') {
  const key = String(value || fallback).toLowerCase();
  return TONE_CLASSES[key] || TONE_CLASSES[fallback] || TONE_CLASSES.info;
}

export function getNotificationIconKind(notification = {}) {
  const type = String(notification.type || '').toLowerCase();
  const severity = String(notification.severity || '').toLowerCase();
  const moduleKey = String(notification.module || '').toLowerCase();

  if (severity === 'critical' || type === 'error') return 'error';
  if (type === 'security' || moduleKey === 'auth') return 'security';
  if (type === 'success') return 'success';
  if (type === 'warning' || severity === 'medium') return 'warning';
  if (type === 'transaction' || moduleKey === 'banking' || moduleKey === 'transaction') return 'transaction';
  if (type === 'master' || moduleKey === 'master') return 'master';
  if (moduleKey === 'settings') return 'settings';
  if (moduleKey === 'reports') return 'reports';
  if (moduleKey === 'files') return 'files';
  if (moduleKey === 'system' || type === 'system') return 'system';
  return 'info';
}

export function getNotificationAccentTone(notification = {}) {
  const type = String(notification.type || '').toLowerCase();
  const severity = String(notification.severity || '').toLowerCase();
  const moduleKey = String(notification.module || '').toLowerCase();

  if (severity === 'critical' || type === 'error') return 'border-rose-200 bg-rose-50 text-rose-600';
  if (severity === 'high') return 'border-rose-100 bg-rose-50 text-rose-600';
  if (type === 'security' || moduleKey === 'auth') return 'border-violet-100 bg-violet-50 text-violet-600';
  if (type === 'transaction' || moduleKey === 'banking' || moduleKey === 'transaction') return 'border-cyan-100 bg-cyan-50 text-cyan-600';
  if (type === 'success') return 'border-emerald-100 bg-emerald-50 text-emerald-600';
  if (type === 'warning' || severity === 'medium') return 'border-amber-100 bg-amber-50 text-amber-600';
  if (type === 'master' || moduleKey === 'master') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-blue-100 bg-blue-50 text-blue-600';
}

export function formatNotificationTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  const units = [
    { limit: 60, divisor: 1, name: 'second' },
    { limit: 3600, divisor: 60, name: 'minute' },
    { limit: 86400, divisor: 3600, name: 'hour' },
    { limit: 604800, divisor: 86400, name: 'day' },
    { limit: 2592000, divisor: 604800, name: 'week' },
    { limit: 31536000, divisor: 2592000, name: 'month' }
  ];

  const unit = units.find((item) => abs < item.limit) || { divisor: 31536000, name: 'year' };
  const valueInUnit = Math.max(1, Math.round(abs / unit.divisor));
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const signedValue = diffSeconds > 0 ? valueInUnit : -valueInUnit;

  return rtf.format(signedValue, unit.name);
}

export function formatNotificationDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function normalizePath(path = '') {
  const value = String(path || '').trim();
  if (!value) return '';
  if (value.startsWith('/#/')) return value.slice(2);
  return value;
}

export function getNotificationTargetPath(notification = {}) {
  const directUrl = normalizePath(notification.actionUrl || notification.payload?.actionUrl || '');
  if (directUrl.startsWith('/app/')) {
    return directUrl;
  }

  const moduleKey = String(notification.module || '').toLowerCase();
  const entityType = String(notification.entityType || '').toLowerCase();
  const action = String(notification.action || '').toLowerCase();
  const title = String(notification.title || '').toLowerCase();
  const payload = notification.payload && typeof notification.payload === 'object' ? notification.payload : {};
  const payloadSection = String(payload.sectionKey || payload.section || '').toLowerCase();

  if (moduleKey === 'settings') return '/app/settings/overview';
  if (moduleKey === 'reports') return '/app/reports';
  if (moduleKey === 'auth') return '/app/profile';
  if (moduleKey === 'files') return '/app/files';

  if (moduleKey === 'master' || entityType || action || title) {
    if (entityType.includes('employee') || action.includes('employee') || title.includes('employee') || payloadSection === 'employee') {
      return '/app/master/employees';
    }
    if (entityType.includes('member') || action.includes('member') || title.includes('member') || payloadSection === 'member') {
      return '/app/master/members';
    }
    if (entityType.includes('branch') || action.includes('branch') || title.includes('branch') || payloadSection === 'branch') {
      return '/app/master/branches';
    }
    if (entityType.includes('ledger') || action.includes('ledger') || title.includes('ledger')) {
      return '/app/master/ledgers';
    }
    if (entityType.includes('rate') || action.includes('rate') || title.includes('rate')) {
      return '/app/master/rates';
    }
    if (entityType.includes('bank account') || entityType.includes('bankaccount') || action.includes('bank account') || title.includes('bank account')) {
      return '/app/master/bank-accounts';
    }
    if (entityType.includes('demand') || action.includes('demand') || title.includes('demand')) {
      return '/app/master/demands';
    }
    if (entityType.includes('no interest') || title.includes('no interest')) {
      return '/app/master/no-interest-members';
    }
    return '/app/master/overview';
  }

  if (moduleKey === 'transaction' || moduleKey === 'banking') {
    if (payloadSection === 'bank') return '/app/transactions/bank';
    if (payloadSection === 'employee') return '/app/transactions/employee';
    if (payloadSection === 'member') return '/app/transactions/member';
    if (payloadSection === 'supporting') return '/app/transactions/supporting';
    if (payloadSection === 'transfer-voucher') return '/app/transactions/transfer-voucher';
    if (payloadSection === 'receipt-interest') return '/app/transactions/receipt-interest';
    return '/app/transactions/overview';
  }

  return directUrl || '/app/notifications';
}

export function getNotificationModuleHubPath(notification = {}) {
  const moduleKey = String(notification.module || '').toLowerCase();

  if (moduleKey === 'settings') return '/app/settings/overview';
  if (moduleKey === 'reports') return '/app/reports';
  if (moduleKey === 'auth') return '/app/profile';
  if (moduleKey === 'files') return '/app/files';
  if (moduleKey === 'transaction' || moduleKey === 'banking') return '/app/transactions/overview';
  if (moduleKey === 'master') return '/app/master/overview';
  return '/app/notifications';
}

export function getNotificationNavigationMeta(notification = {}) {
  const path = getNotificationTargetPath(notification);
  const modulePath = getNotificationModuleHubPath(notification);
  const moduleLabel = getNotificationModuleLabel(notification.module);
  const iconKind = getNotificationIconKind(notification);

  const moduleKey = String(notification.module || '').toLowerCase();
  const entityType = String(notification.entityType || '').toLowerCase();
  const action = String(notification.action || '').toLowerCase();
  const title = String(notification.title || '').toLowerCase();
  const payload = notification.payload && typeof notification.payload === 'object' ? notification.payload : {};
  const payloadSection = String(payload.sectionKey || payload.section || '').toLowerCase();

  if (moduleKey === 'settings') {
    return { path: path || modulePath, label: 'Open settings', modulePath, moduleLabel, iconKind };
  }

  if (moduleKey === 'reports') {
    return { path: path || modulePath, label: 'Open reports', modulePath, moduleLabel, iconKind };
  }

  if (moduleKey === 'auth') {
    return { path: path || modulePath, label: 'Open profile', modulePath, moduleLabel, iconKind };
  }

  if (moduleKey === 'files') {
    return { path: path || modulePath, label: 'Open files', modulePath, moduleLabel, iconKind };
  }

  if (moduleKey === 'master' || entityType || action || title) {
    if (entityType.includes('employee') || action.includes('employee') || title.includes('employee') || payloadSection === 'employee') {
      return { path: path || '/app/master/employees', label: 'Open employees', modulePath, moduleLabel, iconKind };
    }
    if (entityType.includes('member') || action.includes('member') || title.includes('member') || payloadSection === 'member') {
      return { path: path || '/app/master/members', label: 'Open members', modulePath, moduleLabel, iconKind };
    }
    if (entityType.includes('branch') || action.includes('branch') || title.includes('branch') || payloadSection === 'branch') {
      return { path: path || '/app/master/branches', label: 'Open branches', modulePath, moduleLabel, iconKind };
    }
    if (entityType.includes('ledger') || action.includes('ledger') || title.includes('ledger')) {
      return { path: path || '/app/master/ledgers', label: 'Open ledgers', modulePath, moduleLabel, iconKind };
    }
    if (entityType.includes('rate') || action.includes('rate') || title.includes('rate')) {
      return { path: path || '/app/master/rates', label: 'Open rates config', modulePath, moduleLabel, iconKind };
    }
    if (entityType.includes('bank account') || entityType.includes('bankaccount') || action.includes('bank account') || title.includes('bank account')) {
      return { path: path || '/app/master/bank-accounts', label: 'Open bank accounts', modulePath, moduleLabel, iconKind };
    }
    if (entityType.includes('demand') || action.includes('demand') || title.includes('demand')) {
      return { path: path || '/app/master/demands', label: 'Open demands', modulePath, moduleLabel, iconKind };
    }
    if (entityType.includes('no interest') || title.includes('no interest')) {
      return { path: path || '/app/master/no-interest-members', label: 'Open no interest members', modulePath, moduleLabel, iconKind };
    }
    return { path: path || '/app/master/overview', label: 'Open master hub', modulePath, moduleLabel, iconKind };
  }

  if (moduleKey === 'transaction' || moduleKey === 'banking') {
    if (payloadSection === 'bank') return { path: path || '/app/transactions/bank', label: 'Open bank transactions', modulePath, moduleLabel, iconKind };
    if (payloadSection === 'employee') return { path: path || '/app/transactions/employee', label: 'Open employee transactions', modulePath, moduleLabel, iconKind };
    if (payloadSection === 'member') return { path: path || '/app/transactions/member', label: 'Open member transactions', modulePath, moduleLabel, iconKind };
    if (payloadSection === 'supporting') return { path: path || '/app/transactions/supporting', label: 'Open supporting vouchers', modulePath, moduleLabel, iconKind };
    if (payloadSection === 'transfer-voucher') return { path: path || '/app/transactions/transfer-voucher', label: 'Open transfer vouchers', modulePath, moduleLabel, iconKind };
    if (payloadSection === 'receipt-interest') return { path: path || '/app/transactions/receipt-interest', label: 'Open receipt and interest', modulePath, moduleLabel, iconKind };
    return { path: path || '/app/transactions/overview', label: 'Open transactions hub', modulePath, moduleLabel, iconKind };
  }

  return { path: path || '/app/notifications', label: 'Open notification', modulePath, moduleLabel, iconKind };
}

export function notifyNotificationsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('notifications:changed'));
}


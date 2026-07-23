import { useEffect, useMemo, useState } from 'react';
import { Bell, Mail, Save, ShieldAlert, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Card } from '../../../components/ui/Card';
import { Input, Textarea } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';

function merge(target = {}, source = {}) {
  const result = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = merge(target[key] || {}, value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

function updateNested(settings, path, value) {
  const next = typeof structuredClone === 'function'
    ? structuredClone(settings)
    : JSON.parse(JSON.stringify(settings));
  const parts = path.split('.');
  let cursor = next;
  parts.slice(0, -1).forEach((part) => {
    cursor[part] = cursor[part] || {};
    cursor = cursor[part];
  });
  cursor[parts.at(-1)] = value;
  return next;
}

const FALLBACK_SETTINGS = {
  key: 'default',
  appName: 'Bank',
  smtp: {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromName: 'Bank',
    fromEmail: ''
  },
  emailTemplates: {
    passwordReset: { subject: '', text: '', html: '' },
    notificationAlert: { subject: '', text: '', html: '' },
    demandReminder: { subject: '', text: '', html: '' },
    monthlySummary: { subject: '', text: '', html: '' },
    securityAlert: { subject: '', text: '', html: '' }
  },
  notifications: {
    enabled: true,
    inAppEnabled: true,
    emailEnabled: true,
    defaultRoleCodes: ['admin', 'manager'],
    masterAlerts: true,
    transactionAlerts: true,
    securityAlerts: true
  },
  payload: {
    branding: {},
    companyProfile: {}
  }
};

function SettingCard({ title, description, icon: Icon, children }) {
  return (
    <Card className="border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
          <Icon size={20} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-[13px] text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function ToggleRow({ label, description, checked, onChange, icon: Icon }) {
  return (
    <label className="flex items-start gap-4 rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-slate-50/70 p-4">
      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[var(--radius-button,1rem)] bg-white text-slate-600 shadow-sm">
        <Icon size={18} />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="mt-1 block text-[13px] text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 rounded border-slate-300 focus:ring-[var(--primary,#1661F6)]"
        style={{ accentColor: 'var(--primary, #1661F6)' }}
      />
    </label>
  );
}

export function NotificationSettingsPage() {
  const { token, refreshSettings } = useAuth();
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTemplateKey, setActiveTemplateKey] = useState('notificationAlert');

  const notifications = useMemo(() => settings.notifications || FALLBACK_SETTINGS.notifications, [settings]);
  const activeTemplate = useMemo(
    () => settings.emailTemplates?.[activeTemplateKey] || FALLBACK_SETTINGS.emailTemplates[activeTemplateKey] || { subject: '', text: '', html: '' },
    [activeTemplateKey, settings.emailTemplates]
  );

  useEffect(() => {
    let mounted = true;
    api.settings.get(token)
      .then((response) => {
        if (!mounted) return;
        setSettings(merge(FALLBACK_SETTINGS, response.data || {}));
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load settings');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  function setField(path, value) {
    setSettings((current) => updateNested(current, path, value));
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await api.settings.save(token, settings);
      setSettings(merge(FALLBACK_SETTINGS, response.data || settings));
      if (refreshSettings) {
        await refreshSettings();
      }
      toast.success('Notification settings saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save notification settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Settings"
        meta={(
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">Default roles {notifications.defaultRoleCodes?.length || 0}</span>
            <span
              className="rounded-full border px-3 py-1 font-semibold"
              style={{
                borderColor: 'color-mix(in srgb, var(--primary, #1661F6) 20%, white)',
                backgroundColor: 'color-mix(in srgb, var(--primary, #1661F6) 6%, white)',
                color: 'var(--primary, #1661F6)'
              }}
            >
              {notifications.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SettingCard title="Delivery Controls" description="App notifications aur email alerts ka master switch." icon={Bell}>
          <div className="space-y-3">
            <ToggleRow
              label="Enable Notifications"
              description="Global master switch for notification creation and dispatch."
              checked={notifications.enabled !== false}
              onChange={(value) => setField('notifications.enabled', value)}
              icon={Bell}
            />
            <ToggleRow
              label="In-App Notifications"
              description="Bell icon and inbox me alerts dikhaye jaayen."
              checked={notifications.inAppEnabled !== false}
              onChange={(value) => setField('notifications.inAppEnabled', value)}
              icon={Bell}
            />
            <ToggleRow
              label="Email Notifications"
              description="Auto alerts email ke through bhi bheje jaayen."
              checked={notifications.emailEnabled !== false}
              onChange={(value) => setField('notifications.emailEnabled', value)}
              icon={Mail}
            />
          </div>
        </SettingCard>

        <SettingCard title="Alert Scope" description="Kaunse modules pe alerts active hon." icon={ShieldAlert}>
          <div className="space-y-3">
            <ToggleRow
              label="Master Alerts"
              description="Employees, members, branches, settings, and master data changes."
              checked={notifications.masterAlerts !== false}
              onChange={(value) => setField('notifications.masterAlerts', value)}
              icon={ShieldAlert}
            />
            <ToggleRow
              label="Transaction Alerts"
              description="Voucher, bank, receipt, transfer, and supporting actions."
              checked={notifications.transactionAlerts !== false}
              onChange={(value) => setField('notifications.transactionAlerts', value)}
              icon={ShieldAlert}
            />
            <ToggleRow
              label="Security Alerts"
              description="Password reset, login, and sensitive system events."
              checked={notifications.securityAlerts !== false}
              onChange={(value) => setField('notifications.securityAlerts', value)}
              icon={ShieldAlert}
            />
          </div>
        </SettingCard>

        <SettingCard title="Default Recipients" description="Default role codes comma-separated form me." icon={Users}>
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Default Role Codes</label>
            <Input
              value={(notifications.defaultRoleCodes || []).join(', ')}
              onChange={(event) => setField(
                'notifications.defaultRoleCodes',
                event.target.value.split(',').map((item) => item.trim()).filter(Boolean)
              )}
              placeholder="admin, manager"
            />
            <p className="mt-2 text-[12px] text-slate-500">Ye roles by default notifications receive karenge.</p>
          </div>
        </SettingCard>

        <SettingCard title="Email Templates" description="Auto notification email templates edit karo." icon={Mail}>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Template Type</label>
              <select
                value={activeTemplateKey}
                onChange={(event) => setActiveTemplateKey(event.target.value)}
                className="h-10 w-full rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white px-3 text-[13px] text-slate-700 focus:border-[var(--primary,#1661F6)] focus:outline-none focus:ring-1 focus:ring-[var(--primary,#1661F6)]"
              >
                <option value="notificationAlert">Notification Alert</option>
                <option value="securityAlert">Security Alert</option>
                <option value="demandReminder">Demand Reminder</option>
                <option value="monthlySummary">Monthly Summary</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Subject</label>
              <Input
                value={activeTemplate.subject || ''}
                onChange={(event) => setField(`emailTemplates.${activeTemplateKey}.subject`, event.target.value)}
                placeholder="Email subject"
              />
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Text</label>
              <Textarea
                rows={4}
                value={activeTemplate.text || ''}
                onChange={(event) => setField(`emailTemplates.${activeTemplateKey}.text`, event.target.value)}
                placeholder="Plain text email body"
              />
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">HTML</label>
              <Textarea
                rows={6}
                value={activeTemplate.html || ''}
                onChange={(event) => setField(`emailTemplates.${activeTemplateKey}.html`, event.target.value)}
                placeholder="<p>HTML email body</p>"
              />
            </div>

            <div className="rounded-[var(--radius-card,1.75rem)] border border-amber-100 bg-amber-50 p-4 text-[13px] text-amber-700">
              Available variables: <span className="font-semibold">{'{{appName}}'}</span>, <span className="font-semibold">{'{{recipientName}}'}</span>, <span className="font-semibold">{'{{title}}'}</span>, <span className="font-semibold">{'{{message}}'}</span>, <span className="font-semibold">{'{{actionUrl}}'}</span>
            </div>
          </div>
        </SettingCard>

        <SettingCard title="Quick Preview" description="Current configuration snapshot." icon={Mail}>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { label: 'Global', value: notifications.enabled ? 'On' : 'Off' },
              { label: 'In-app', value: notifications.inAppEnabled ? 'On' : 'Off' },
              { label: 'Email', value: notifications.emailEnabled ? 'On' : 'Off' },
              { label: 'Roles', value: (notifications.defaultRoleCodes || []).join(', ') || 'None' }
            ].map((item) => (
              <div key={item.label} className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </SettingCard>
      </div>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving} className="bg-[var(--primary,#1661F6)] hover:opacity-90 text-white h-10 px-5 rounded-[var(--radius-button,1rem)] text-[13px] font-medium gap-2">
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Notification Settings'}
        </Button>
      </div>
    </div>
  );
}

export default NotificationSettingsPage;

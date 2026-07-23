import { useEffect, useMemo, useState } from 'react';
import { Mail, FileText, Save, Palette, Image as ImageIcon, Building2, Layout, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, API_BASE_URL, getImageUrl } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Input, Textarea, Select } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { FileBrowserModal } from '../../components/ui/FileBrowserModal';
import statesData from '../../data/indian_states_cities.json';

function ImageUploadBox({ label, value, onBrowse, onClear }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] font-semibold text-slate-700">{label}</p>
        {value ? (
          <button type="button" onClick={onClear} className="text-slate-400 hover:text-rose-500 transition" title="Clear image">
            <X size={16} />
          </button>
        ) : null}
      </div>
      
      <div className="mb-4 flex h-32 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50">
        {value ? (
          <img src={getImageUrl(value)} alt={label} className="h-full w-full object-contain" />
        ) : (
          <>
            <ImageIcon size={24} strokeWidth={1.5} className="mb-2 text-slate-300" />
            <span className="text-[12px] text-slate-400 font-medium">No image</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
        <span className="flex-1 truncate pl-3 text-[13px] text-slate-400">{value ? value.split('/').pop() : 'Choose file...'}</span>
        <button
          type="button"
          onClick={onBrowse}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <ImageIcon size={14} />
          Browse
        </button>
      </div>
    </div>
  );
}

function BrandingTab({ branding, setField, onSave, saving }) {
  const [browseField, setBrowseField] = useState(null);

  return (
    <>
      <Card className="border border-slate-200 bg-white p-6 shadow-sm rounded-2xl w-full">
        <div className="flex items-start gap-4 mb-6 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 shrink-0">
            <ImageIcon size={20} strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Logos & Assets</h3>
            <p className="text-[13px] text-slate-500">Company branding images.</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 bg-slate-50/30 p-2 rounded-2xl -mx-2">
          <ImageUploadBox label="Primary Logo" value={branding?.logoUrl} onBrowse={() => setBrowseField('logoUrl')} onClear={() => setField('payload.branding.logoUrl', '')} />
          <ImageUploadBox label="Sidebar Expanded" value={branding?.sidebarExpandedUrl} onBrowse={() => setBrowseField('sidebarExpandedUrl')} onClear={() => setField('payload.branding.sidebarExpandedUrl', '')} />
          <ImageUploadBox label="Sidebar Collapsed" value={branding?.sidebarCollapsedUrl} onBrowse={() => setBrowseField('sidebarCollapsedUrl')} onClear={() => setField('payload.branding.sidebarCollapsedUrl', '')} />
          <ImageUploadBox label="Favicon" value={branding?.faviconUrl} onBrowse={() => setBrowseField('faviconUrl')} onClear={() => setField('payload.branding.faviconUrl', '')} />
        </div>

        <div className="flex justify-end pt-6">
          <Button onClick={onSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5 rounded-xl text-[13px] font-medium gap-2">
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </Card>
      
        <FileBrowserModal
          open={Boolean(browseField)}
          onClose={() => setBrowseField(null)}
          onSelect={(file) => {
            if (browseField) {
              setField(`payload.branding.${browseField}`, file.viewUrl);
            }
          }}
          uploadModule="settings"
        />
      </>
    );
  }
  
  function BusinessIdentityTab({ businessIdentity, setField, onSave, saving }) {
    const selectedStateObj = statesData.find(s => s.state === businessIdentity?.state);
    const cities = selectedStateObj ? selectedStateObj.cities : [];

    const handleStateChange = (e) => {
      const newStateName = e.target.value;
      
      const newProfile = { ...businessIdentity, state: newStateName };
      
      const stateObj = statesData.find(s => s.state === newStateName);
      if (stateObj) {
        newProfile.stateCode = stateObj.stateCode;
        newProfile.city = '';
      }
      
      // We can update multiple fields by updating the whole object or calling setField multiple times.
      // Calling setField multiple times might cause race conditions if it relies on current state in a simple nested update.
      // Let's call them sequentially, updateNested is safe if we use functional updates.
      setField('payload.companyProfile.state', newStateName);
      if (stateObj) {
        setTimeout(() => {
          setField('payload.companyProfile.stateCode', stateObj.stateCode);
          setField('payload.companyProfile.city', '');
        }, 0);
      }
    };

    return (
      <div className="space-y-6">
        <Card className="border border-slate-200 bg-white p-6 shadow-sm rounded-2xl w-full">
          <div className="flex items-start gap-4 mb-6 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 shrink-0">
              <Building2 size={20} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Business Identity</h3>
              <p className="text-[13px] text-slate-500">Your company details used across the system.</p>
            </div>
          </div>
  
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Name</label>
              <Input value={businessIdentity?.name || ''} onChange={(e) => setField('payload.companyProfile.name', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Legal Name</label>
              <Input value={businessIdentity?.legalName || ''} onChange={(e) => setField('payload.companyProfile.legalName', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Registration Number</label>
              <Input value={businessIdentity?.registrationNumber || ''} onChange={(e) => setField('payload.companyProfile.registrationNumber', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">License Number (Optional)</label>
              <Input value={businessIdentity?.licenseNumber || ''} onChange={(e) => setField('payload.companyProfile.licenseNumber', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Email</label>
              <Input type="email" value={businessIdentity?.email || ''} onChange={(e) => setField('payload.companyProfile.email', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Phone</label>
              <Input type="tel" value={businessIdentity?.phone || ''} onChange={(e) => setField('payload.companyProfile.phone', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Website</label>
              <Input type="url" value={businessIdentity?.website || ''} onChange={(e) => setField('payload.companyProfile.website', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">GSTIN</label>
              <Input value={businessIdentity?.gstin || ''} onChange={(e) => setField('payload.companyProfile.gstin', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">PAN</label>
              <Input value={businessIdentity?.pan || ''} onChange={(e) => setField('payload.companyProfile.pan', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">TAN</label>
              <Input value={businessIdentity?.tan || ''} onChange={(e) => setField('payload.companyProfile.tan', e.target.value)} />
            </div>
          </div>
  
          <div className="mt-8 mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-sm font-semibold text-slate-900">Registered Address</h3>
          </div>
  
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Address Line 1</label>
              <Input value={businessIdentity?.address1 || ''} onChange={(e) => setField('payload.companyProfile.address1', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">State</label>
              <Select value={businessIdentity?.state || ''} onChange={handleStateChange}>
                <option value="">Select State</option>
                {statesData.map(s => (
                  <option key={s.state} value={s.state}>{s.state}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">City</label>
              <Select value={businessIdentity?.city || ''} onChange={(e) => setField('payload.companyProfile.city', e.target.value)} disabled={!businessIdentity?.state}>
                <option value="">Select City</option>
                {cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">State Code</label>
              <Input value={businessIdentity?.stateCode || ''} onChange={(e) => setField('payload.companyProfile.stateCode', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Country</label>
              <Input value={businessIdentity?.country || ''} onChange={(e) => setField('payload.companyProfile.country', e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Pincode</label>
              <Input value={businessIdentity?.pincode || ''} onChange={(e) => setField('payload.companyProfile.pincode', e.target.value)} />
            </div>
          </div>
  
          <div className="flex justify-end pt-6 mt-6 border-t border-slate-100">
            <Button onClick={onSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5 rounded-xl text-[13px] font-medium gap-2">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

function SmtpEmailTab({ smtp, setField, onSave, saving }) {
  return (
    <div className="space-y-6">
      <Card className="border border-slate-200 bg-white p-6 shadow-sm rounded-2xl w-full">
        <div className="flex items-start gap-4 mb-6 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 shrink-0">
            <Mail size={20} strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">SMTP Server Configuration</h3>
            <p className="text-[13px] text-slate-500">Configure mail server to send OTPs and notifications.</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">SMTP Host</label>
            <Input placeholder="smtp.hostinger.com" value={smtp?.host || ''} onChange={(e) => setField('smtp.host', e.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Port</label>
            <Input type="number" placeholder="587 or 465" value={smtp?.port || ''} onChange={(e) => setField('smtp.port', parseInt(e.target.value) || '')} />
          </div>
          <div className="flex items-center pt-8">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={smtp?.secure || false} 
                onChange={(e) => setField('smtp.secure', e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer w-4 h-4"
              />
              <span className="text-[13px] font-semibold text-slate-700">Use Secure Connection (SSL/TLS)</span>
            </label>
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Username</label>
            <Input placeholder="info@yourbank.com" value={smtp?.username || ''} onChange={(e) => setField('smtp.username', e.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Password</label>
            <Input type="password" placeholder="••••••••" value={smtp?.password || ''} onChange={(e) => setField('smtp.password', e.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">From Email Address</label>
            <Input placeholder="no-reply@yourbank.com" value={smtp?.fromEmail || ''} onChange={(e) => setField('smtp.fromEmail', e.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">From Name</label>
            <Input placeholder="Bank Alerts" value={smtp?.fromName || ''} onChange={(e) => setField('smtp.fromName', e.target.value)} />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button onClick={onSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5 rounded-xl text-[13px] font-medium gap-2">
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function UiSettingsTab({ branding, setField, onSave, saving }) {
  return (
    <div className="space-y-6">
      <Card className="border border-slate-200 bg-white p-6 shadow-sm rounded-2xl w-full">
        <div className="flex items-start gap-4 mb-6 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 shrink-0">
            <Layout size={20} strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Browser & Document Title</h3>
            <p className="text-[13px] text-slate-500">Customize the application title displayed in the browser tab.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Title Text</label>
            <Input 
              value={branding?.appName || ''} 
              onChange={(e) => setField('payload.branding.appName', e.target.value)} 
              placeholder="e.g. CRM" 
            />
            <p className="mt-2 text-[12px] text-slate-500">This changes the text in the top browser tab (e.g., Settings - Your Title).</p>
          </div>
        </div>

        <div className="flex justify-end pt-6 mt-6 border-t border-slate-100">
          <Button onClick={onSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5 rounded-xl text-[13px] font-medium gap-2">
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </Card>
    </div>
  );
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
    passwordReset: {
      subject: 'Reset your password',
      text: 'Hello {{name}}, your password reset OTP is {{otp}}. It expires in {{minutes}} minutes.',
      html: '<p>Hello {{name}},</p><p>Your password reset OTP is <strong>{{otp}}</strong>.</p><p>It expires in <strong>{{minutes}}</strong> minutes.</p>'
    },
    notificationAlert: {
      subject: 'New notification from {{appName}}',
      text: 'Hello {{recipientName}}, you have a new {{type}} notification: {{title}}',
      html: '<p>Hello {{recipientName}},</p><p>You have a new <strong>{{type}}</strong> notification:</p><p><strong>{{title}}</strong></p>'
    },
    demandReminder: {
      subject: 'Demand reminder from {{appName}}',
      text: 'Hello {{recipientName}}, this is a reminder for demand {{title}}.',
      html: '<p>Hello {{recipientName}},</p><p>This is a reminder for demand <strong>{{title}}</strong>.</p>'
    },
    monthlySummary: {
      subject: 'Monthly summary from {{appName}}',
      text: 'Hello {{recipientName}}, your monthly summary is ready.',
      html: '<p>Hello {{recipientName}},</p><p>Your monthly summary is ready.</p>'
    },
    securityAlert: {
      subject: 'Security alert from {{appName}}',
      text: 'Hello {{recipientName}}, a security alert was generated: {{title}}',
      html: '<p>Hello {{recipientName}},</p><p>A security alert was generated: <strong>{{title}}</strong></p>'
    }
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
    branding: {
      appName: 'Bank',
      bankName: 'Bank',
      logoUrl: '',
      logoText: 'Bank',
      tagline: 'Employee portal',
      primaryColor: '#3b82f6',
      accentColor: '#1d4ed8',
      sidebarBg: '#090d16'
    },
    companyProfile: {
      name: '',
      legalName: '',
      registrationNumber: '',
      licenseNumber: '',
      email: '',
      phone: '',
      website: '',
      gstin: '',
      pan: '',
      tan: '',
      address1: '',
      city: '',
      state: '',
      stateCode: '',
      country: 'India',
      pincode: ''
    }
  }
};

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

export function SettingsPage({ initialTab = 'business_identity' } = {}) {
  const { token, refreshSettings } = useAuth();
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const branding = useMemo(() => settings.payload?.branding || FALLBACK_SETTINGS.payload.branding, [settings]);
  const businessIdentity = useMemo(() => settings.payload?.companyProfile || FALLBACK_SETTINGS.payload.companyProfile, [settings]);
  const smtp = useMemo(() => settings.smtp || FALLBACK_SETTINGS.smtp, [settings]);

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

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await api.settings.save(token, settings);
      setSettings(merge(FALLBACK_SETTINGS, response.data || settings));
      
      if (refreshSettings) {
        await refreshSettings();
      }

      toast.success('Settings saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  }

  function setField(path, value) {
    setSettings((current) => updateNested(current, path, value));
  }

  const SECTION_META = {
    business_identity: {
      title: 'Business Identity',
      description: 'Your company details used across the system.'
    },
    branding: {
      title: 'Branding',
      description: 'Manage logos and visual identity assets.'
    },
    ui_settings: {
      title: 'UI Settings',
      description: 'Browser title and interface preferences.'
    },
    smtp_email: {
      title: 'SMTP & Email',
      description: 'Configure mail server settings and alert templates.'
    }
  };

  const selectedSection = SECTION_META[initialTab] ? initialTab : 'business_identity';
  const sectionMeta = SECTION_META[selectedSection];

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">{sectionMeta.title}</h1>
        <p className="text-sm text-slate-500">{sectionMeta.description}</p>
      </div>

      {selectedSection === 'business_identity' ? (
        <BusinessIdentityTab businessIdentity={businessIdentity} setField={setField} onSave={saveSettings} saving={saving} />
      ) : selectedSection === 'branding' ? (
        <BrandingTab branding={branding} setField={setField} onSave={saveSettings} saving={saving} />
      ) : selectedSection === 'ui_settings' ? (
        <UiSettingsTab branding={branding} setField={setField} onSave={saveSettings} saving={saving} />
      ) : selectedSection === 'smtp_email' ? (
        <SmtpEmailTab smtp={smtp} setField={setField} onSave={saveSettings} saving={saving} />
      ) : null}
    </div>
  );
}

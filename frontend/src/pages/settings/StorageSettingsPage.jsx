import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Archive, HardDrive, RefreshCw, Save, Server } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/api';
import { GoogleDrivePanel } from './GoogleDrivePage';

const PROVIDERS = [
  { value: 'local', label: 'Local Storage', description: 'Files are kept on this server.', icon: Server },
  { value: 'gdrive', label: 'Google Drive', description: 'Files go to the connected Google Drive; daily database backups too.', icon: HardDrive }
];

// Settings -> Storage Providers: where new uploads are stored (this server or
// Google Drive). Choosing Google Drive shows its connection and the database
// backups kept there.
export function StorageSettingsPage() {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('settings.write');
  const location = useLocation();
  // Back from the Google sign-in (?gdrive=...): open on the Drive section.
  const returningFromGoogle = new URLSearchParams(location.search).has('gdrive');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savedProvider, setSavedProvider] = useState('local');
  const [provider, setProvider] = useState(returningFromGoogle ? 'gdrive' : 'local');
  const [local, setLocal] = useState({ uploadDir: './uploads', prefix: 'images' });
  const [driveReady, setDriveReady] = useState(false);

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await api.settings.storage.get(token);
      const data = res.data || {};
      const current = data.activeProvider === 'gdrive' ? 'gdrive' : 'local';
      setSavedProvider(current);
      if (!returningFromGoogle) setProvider(current);
      setLocal({ uploadDir: data.local?.uploadDir || './uploads', prefix: data.local?.prefix ?? 'images' });
      setDriveReady(Boolean(data.gdrive?.connected));
    } catch (err) {
      toast.error(err.message || 'Unable to load storage settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.settings.storage.test(token, { provider: 'local', config: local });
      setTestResult({ success: res.success, message: res.message });
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.storage.save(token, { activeProvider: provider, local });
      toast.success(provider === 'gdrive' ? 'New uploads will be stored in Google Drive.' : 'New uploads will be stored on this server.');
      await loadSettings();
    } catch (err) {
      toast.error(err.message || 'Unable to save storage settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

  const blockedByDrive = provider === 'gdrive' && !driveReady;
  const unchanged = provider === savedProvider && provider === 'gdrive';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Archive className="text-violet-600" />
          Storage Providers
        </h1>
        <p className="mt-1 text-sm text-slate-500">Where uploaded files and images are stored. Changing it does not move or break existing files.</p>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Upload storage</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map(({ value, label, description, icon: Icon }) => {
            const selected = provider === value;
            return (
              <button
                key={value}
                type="button"
                disabled={!canWrite}
                onClick={() => { setProvider(value); setTestResult(null); }}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${selected ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] ring-1 ring-[var(--primary)]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-70`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon size={18} />
                </span>
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {label}
                    {savedProvider === value ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">In use</span> : null}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{description}</span>
                </span>
              </button>
            );
          })}
        </div>

        {provider === 'local' ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Upload Directory</label>
              <input
                type="text"
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                value={local.uploadDir}
                disabled={!canWrite}
                onChange={(e) => setLocal((current) => ({ ...current, uploadDir: e.target.value }))}
                placeholder="./uploads"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Prefix / Path</label>
              <input
                type="text"
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                value={local.prefix}
                disabled={!canWrite}
                onChange={(e) => setLocal((current) => ({ ...current, prefix: e.target.value }))}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            {provider === 'local' ? (
              <Button variant="outline" onClick={handleTest} disabled={testing || !canWrite} className="gap-2">
                <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
                Test Connection
              </Button>
            ) : null}
            {testResult ? (
              <span className={`text-sm ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>{testResult.message}</span>
            ) : null}
            {blockedByDrive ? (
              <span className="text-sm text-amber-700">Connect Google Drive below before using it for uploads.</span>
            ) : null}
          </div>
          {canWrite ? (
            <Button onClick={handleSave} disabled={saving || blockedByDrive || unchanged} className="gap-2 bg-[var(--primary,#1661F6)] px-6 text-white hover:opacity-90">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          ) : null}
        </div>
      </Card>

      {provider === 'gdrive' ? (
        <GoogleDrivePanel onStatus={(status) => setDriveReady(Boolean(status?.drive?.connected && !status?.drive?.needsReconnect))} />
      ) : null}
    </div>
  );
}

export default StorageSettingsPage;

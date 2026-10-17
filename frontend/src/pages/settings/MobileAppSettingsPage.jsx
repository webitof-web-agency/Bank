import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { version: '', buildNumber: '', downloadUrl: '', notes: '', force: false };

// Settings -> Mobile App: the latest app release. On launch the app compares
// its own version with this one and, when it is older, offers the APK at the
// download link (saved into the phone's Downloads folder, then installed).
// Saved in settings payload.appUpdate; served by GET /api/app/version.
export function MobileAppSettingsPage() {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('settings.write');
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.settings.get(token)
      .then((response) => {
        const saved = response?.data?.payload?.appUpdate || {};
        if (active) setForm({ ...EMPTY, ...saved, buildNumber: saved.buildNumber ?? '' });
      })
      .catch((error) => toast.error(error.message || 'Unable to load settings'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSave(event) {
    event.preventDefault();
    const version = form.version.trim();
    const downloadUrl = form.downloadUrl.trim();
    if (version && !/^\d+(\.\d+){0,2}$/.test(version)) {
      toast.error('Version must look like 1.0.1');
      return;
    }
    if (version && !/^https?:\/\//i.test(downloadUrl)) {
      toast.error('Enter the download link (starting with https://)');
      return;
    }
    const buildText = String(form.buildNumber ?? '').trim();
    if (buildText && !/^\d+$/.test(buildText)) {
      toast.error('Build number must be a whole number');
      return;
    }
    setSaving(true);
    try {
      await api.settings.save(token, {
        payload: {
          appUpdate: {
            version,
            buildNumber: buildText ? Number(buildText) : null,
            downloadUrl,
            notes: form.notes.trim(),
            force: Boolean(form.force)
          }
        }
      });
      toast.success(version ? `Version ${version} published to the app.` : 'App update turned off.');
    } catch (error) {
      toast.error(error.message || 'Unable to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mobile App</h1>
        <p className="mt-1 text-sm text-slate-500">Publish a new version of the member app. Phones on an older version are asked to download it.</p>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-3xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]"><Smartphone size={20} /></div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Latest Release</h2>
            <p className="text-[13px] text-slate-500">Leave the version empty to stop offering updates.</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Version</label>
              <Input placeholder="e.g. 1.0.1" value={form.version} onChange={set('version')} disabled={loading || !canWrite} />
              <p className="text-[11px] text-slate-500">The app's version name (pubspec.yaml <code>version: 1.0.1+2</code> → 1.0.1).</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Build Number <span className="font-normal text-slate-400">(optional)</span></label>
              <Input placeholder="e.g. 2" inputMode="numeric" value={form.buildNumber} onChange={set('buildNumber')} disabled={loading || !canWrite} />
              <p className="text-[11px] text-slate-500">The number after “+”. Lets a rebuild of the same version count as newer.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">APK Download Link</label>
            <Input type="url" placeholder="https://…/thrift-rpr-1.0.1.apk" value={form.downloadUrl} onChange={set('downloadUrl')} disabled={loading || !canWrite} />
            <p className="text-[11px] text-slate-500">A direct link to the .apk file (it must download the file itself, not open a page).</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">What's New <span className="font-normal text-slate-400">(optional)</span></label>
            <Textarea rows={4} placeholder="Shown in the update dialog" value={form.notes} onChange={set('notes')} disabled={loading || !canWrite} />
          </div>
          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-[13px] text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              checked={Boolean(form.force)}
              onChange={(event) => setForm((current) => ({ ...current, force: event.target.checked }))}
              disabled={loading || !canWrite}
            />
            <span><span className="font-semibold">Required update</span> — the dialog can't be dismissed; the app is unusable until the new version is installed.</span>
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={loading || saving || !canWrite} title={canWrite ? '' : 'Needs Settings edit permission'}>
              {saving ? 'Saving…' : 'Publish'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default MobileAppSettingsPage;

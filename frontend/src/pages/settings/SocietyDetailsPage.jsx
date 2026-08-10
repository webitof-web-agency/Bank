import { useEffect, useMemo, useState } from 'react';
import { Building2, FileImage, Paintbrush, Save, Type } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Input, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const EMPTY_FORM = {
  name: '',
  prefix: '',
  regNo: '',
  email: '',
  address: '',
  branchCode: '',
  logoUrl: '',
  watermarkUrl: '',
  footerText: ''
};

function Field({ label, icon: Icon, children, hint }) {
  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-slate-700">{label}</label>
      <div className="relative">
        {Icon ? <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /> : null}
        <div className={Icon ? 'pl-8' : ''}>{children}</div>
      </div>
      {hint ? <p className="mt-1 text-[12px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SocietyDetailsPage() {
  const { token, hasPermission } = useAuth();
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = hasPermission('society.write');

  useEffect(() => {
    let mounted = true;
    api.banking.getMaster('/masters/society', token)
      .then((response) => {
        if (!mounted) return;
        const record = response.data || {};
        setDraft({
          name: record.name || '',
          prefix: record.prefix || '',
          regNo: record.regNo || '',
          email: record.email || '',
          address: record.address || '',
          branchCode: record.branchCode || '',
          logoUrl: record.logoUrl || '',
          watermarkUrl: record.watermarkUrl || '',
          footerText: record.footerText || ''
        });
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load society details');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  async function saveDetails(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.banking.updateMaster('/masters/society', token, draft);
      toast.success('Society details saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save society details');
    } finally {
      setSaving(false);
    }
  }

  const previewTitle = useMemo(() => draft.name || 'Society', [draft.name]);

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Society Details</h1>
        <p className="mt-1 text-sm text-slate-500">Prototype ke society, branding, aur footer fields.</p>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form className="space-y-6" onSubmit={saveDetails}>
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Society Name" icon={Building2}>
              <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label="Prefix" icon={Type}>
              <Input value={draft.prefix} onChange={(event) => setDraft((current) => ({ ...current, prefix: event.target.value }))} />
            </Field>
            <Field label="Registration No." icon={FileImage}>
              <Input value={draft.regNo} onChange={(event) => setDraft((current) => ({ ...current, regNo: event.target.value }))} />
            </Field>
            <Field label="Email" icon={FileImage}>
              <Input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Address" icon={Paintbrush}>
                <Textarea rows={4} value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} />
              </Field>
            </div>
            <Field label="Branch Code">
              <Input value={draft.branchCode} onChange={(event) => setDraft((current) => ({ ...current, branchCode: event.target.value }))} />
            </Field>
            <Field label="Footer Text">
              <Input value={draft.footerText} onChange={(event) => setDraft((current) => ({ ...current, footerText: event.target.value }))} />
            </Field>
            <Field label="Logo URL">
              <Input value={draft.logoUrl} onChange={(event) => setDraft((current) => ({ ...current, logoUrl: event.target.value }))} />
            </Field>
            <Field label="Watermark URL">
              <Input value={draft.watermarkUrl} onChange={(event) => setDraft((current) => ({ ...current, watermarkUrl: event.target.value }))} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
            <span>Preview title: {previewTitle}</span>
            <span>Read only prototype shape aligned to society master</span>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!canEdit || saving} className="gap-2">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Society Details'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default SocietyDetailsPage;

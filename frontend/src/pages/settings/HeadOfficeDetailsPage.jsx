import { useEffect, useMemo, useState } from 'react';
import { Building2, Mail, MapPin, Phone, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Input, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const EMPTY_FORM = {
  code: 'HO01',
  place: '',
  address: '',
  branchCode: '',
  email: '',
  phone: ''
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

export function HeadOfficeDetailsPage() {
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
          code: record.code || 'HO01',
          place: record.place || '',
          address: record.address || '',
          branchCode: record.branchCode || '',
          email: record.email || '',
          phone: record.phone || ''
        });
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load head office details');
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
      toast.success('Head office details saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save head office details');
    } finally {
      setSaving(false);
    }
  }

  const previewTitle = useMemo(() => draft.place || draft.code || 'Head Office', [draft.place, draft.code]);

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Head Office Details</h1>
        <p className="mt-1 text-sm text-slate-500">The administrative office location that sits above every branch.</p>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form className="space-y-6" onSubmit={saveDetails}>
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Head Office Code" icon={Building2}>
              <Input value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} />
            </Field>
            <Field label="Place" icon={MapPin}>
              <Input value={draft.place} onChange={(event) => setDraft((current) => ({ ...current, place: event.target.value }))} />
            </Field>
            <Field label="Main Branch Code">
              <Input value={draft.branchCode} onChange={(event) => setDraft((current) => ({ ...current, branchCode: event.target.value }))} />
            </Field>
            <Field label="Email" icon={Mail}>
              <Input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
            </Field>
            <Field label="Phone" icon={Phone}>
              <Input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Address" icon={MapPin}>
                <Textarea rows={4} value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} />
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
            <span>Preview title: {previewTitle}</span>
            <span>Head office data used across branches and reports</span>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!canEdit || saving} className="gap-2">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Head Office Details'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default HeadOfficeDetailsPage;

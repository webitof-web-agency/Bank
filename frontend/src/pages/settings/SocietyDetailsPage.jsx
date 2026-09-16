import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, FileImage, Trash2, Save, Type, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, getImageUrl } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const EMPTY_FORM = {
  name: '',
  prefix: '',
  regNo: '',
  gstNo: '',
  logoUrl: '',
  logoFileId: '',
  watermarkEnabled: false,
  watermarkUrl: '',
  watermarkFileId: '',
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

function ImageUploadField({ label, hint, previewUrl, onPick, onClear, disabled }) {
  const inputRef = useRef(null);

  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-slate-700">{label}</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <FileImage size={20} className="text-slate-300" />
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={14} />
            {previewUrl ? 'Change' : 'Upload'}
          </Button>
          {previewUrl ? (
            <Button type="button" variant="outline" className="gap-2 text-rose-600" disabled={disabled} onClick={onClear}>
              <Trash2 size={14} />
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPick(file);
            event.target.value = '';
          }}
        />
      </div>
      {hint ? <p className="mt-1 text-[12px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SocietyDetailsPage() {
  const { token, hasPermission } = useAuth();
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoCleared, setLogoCleared] = useState(false);
  const [watermarkFile, setWatermarkFile] = useState(null);
  const [watermarkPreview, setWatermarkPreview] = useState('');
  const [watermarkCleared, setWatermarkCleared] = useState(false);
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
          gstNo: record.gstNo || '',
          logoUrl: record.logoUrl || '',
          logoFileId: record.logoFileId || '',
          watermarkEnabled: Boolean(record.watermarkEnabled),
          watermarkUrl: record.watermarkUrl || '',
          watermarkFileId: record.watermarkFileId || '',
          footerText: record.footerText || ''
        });
        setLogoPreview(record.logoUrl ? getImageUrl(record.logoUrl) : '');
        setWatermarkPreview(record.watermarkUrl ? getImageUrl(record.watermarkUrl) : '');
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

  useEffect(() => () => {
    if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    if (watermarkPreview && watermarkPreview.startsWith('blob:')) URL.revokeObjectURL(watermarkPreview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickLogo(file) {
    if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoCleared(false);
    setLogoPreview(URL.createObjectURL(file));
  }

  function clearLogo() {
    if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoCleared(true);
    setLogoPreview('');
  }

  function pickWatermark(file) {
    if (watermarkPreview && watermarkPreview.startsWith('blob:')) URL.revokeObjectURL(watermarkPreview);
    setWatermarkFile(file);
    setWatermarkCleared(false);
    setWatermarkPreview(URL.createObjectURL(file));
  }

  function clearWatermark() {
    if (watermarkPreview && watermarkPreview.startsWith('blob:')) URL.revokeObjectURL(watermarkPreview);
    setWatermarkFile(null);
    setWatermarkCleared(true);
    setWatermarkPreview('');
  }

  async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('moduleName', 'society');
    const response = await api.files.upload(token, formData);
    const uploaded = response.data?.[0] || response.data;
    if (!uploaded) throw new Error('Image upload failed');
    return uploaded;
  }

  async function saveDetails(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...draft };

      if (logoFile) {
        const uploaded = await uploadImage(logoFile);
        payload.logoUrl = uploaded.viewUrl;
        payload.logoFileId = uploaded.id;
      } else if (logoCleared) {
        payload.logoUrl = '';
        payload.logoFileId = '';
      }

      if (watermarkFile) {
        const uploaded = await uploadImage(watermarkFile);
        payload.watermarkUrl = uploaded.viewUrl;
        payload.watermarkFileId = uploaded.id;
      } else if (watermarkCleared) {
        payload.watermarkUrl = '';
        payload.watermarkFileId = '';
      }

      const response = await api.banking.updateMaster('/masters/society', token, payload);
      const record = response.data || {};
      setDraft((current) => ({ ...current, logoUrl: record.logoUrl || '', logoFileId: record.logoFileId || '', watermarkUrl: record.watermarkUrl || '', watermarkFileId: record.watermarkFileId || '' }));
      setLogoFile(null);
      setLogoCleared(false);
      setWatermarkFile(null);
      setWatermarkCleared(false);
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
        <p className="mt-1 text-sm text-slate-500">Registered society identity used on letterheads and printed reports.</p>
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
            <Field label="GST No." icon={FileImage}>
              <Input value={draft.gstNo} onChange={(event) => setDraft((current) => ({ ...current, gstNo: event.target.value }))} />
            </Field>
            <Field label="Footer Text">
              <Input value={draft.footerText} onChange={(event) => setDraft((current) => ({ ...current, footerText: event.target.value }))} />
            </Field>
            <div />
            <ImageUploadField
              label="Logo"
              hint="Shown on report letterheads."
              previewUrl={logoPreview}
              onPick={pickLogo}
              onClear={clearLogo}
              disabled={!canEdit}
            />
            <ImageUploadField
              label="Watermark"
              previewUrl={watermarkPreview}
              onPick={pickWatermark}
              onClear={clearWatermark}
              disabled={!canEdit}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={draft.watermarkEnabled}
                onChange={(event) => setDraft((current) => ({ ...current, watermarkEnabled: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Show watermark on printed reports
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
            <span>Preview title: {previewTitle}</span>
            <span>Society identity used across letterheads and reports</span>
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

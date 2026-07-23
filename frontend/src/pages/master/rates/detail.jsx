import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Percent, BookOpen, Clock3, TrendingUp, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { RateForm } from './form';
import { buildRatePayload, createRateDraftFromRecord, formatMoney, getLedgerLabel } from './rateUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
    </div>
  );
}

export function RateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rate, setRate] = useState(null);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const canManage = hasPermission('rates.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      api.resources.get('/banking/masters/rates', id, token),
      api.resources.list('/banking/masters/ledgers', token)
    ])
      .then(([rateRes, ledgersRes]) => {
        if (!mounted) return;
        setRate(rateRes.data || null);
        setLedgers(ledgersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load rate');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!rate) return;
    setDraft(createRateDraftFromRecord(rate));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDraft(null);
  }

  async function saveRate(event) {
    event.preventDefault();
    if (!rate || !draft) return;

    setSaving(true);
    try {
      const payload = buildRatePayload(draft);
      const response = await api.resources.update('/banking/masters/rates', rate.id, payload, token);
      setRate(response.data || rate);
      toast.success('Rate updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save rate');
    } finally {
      setSaving(false);
    }
  }

  const ledgerLookup = useMemo(() => new Map(ledgers.map((ledger) => [String(ledger.code || '').toUpperCase(), ledger])), [ledgers]);
  const badgeClass = 'border-blue-200 bg-blue-50 text-blue-700';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!rate) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Rate not found
      </div>
    );
  }

  const rateCode = rate.code || '—';
  const rateLabel = rate.category || 'Rate';
  const linkedLedger = ledgerLookup.get(String(rate.ledgerCode || '').trim().toUpperCase());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Rate Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 bg-[#3b79f6] px-8 py-10 text-white md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/20 bg-white/15 shadow-xl">
              <Percent size={34} />
            </div>
            <div>
              <p className="mb-2 text-sm text-blue-50">{rateCode}</p>
              <h1 className="text-3xl font-bold tracking-tight">{rateLabel}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${badgeClass}`}>
                  <TrendingUp size={14} />
                  {formatMoney(rate.value ?? 0)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                  <Clock3 size={14} />
                  {rate.effectiveFrom || 'No effective date'}
                </span>
                {linkedLedger ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                    <BookOpen size={14} />
                    {getLedgerLabel(linkedLedger)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {canManage ? (
            <Button variant="secondary" type="button" onClick={openEditor} className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
              <Edit2 size={16} />
              Edit Rate
            </Button>
          ) : null}
        </div>

        <div className="p-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Rate Info</h2>
                <p className="mt-1 text-sm text-slate-500">Rate code, linked ledger and category.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Rate Code" value={rateCode} />
                <DetailRow label="Ledger Code" value={rate.ledgerCode} />
                <DetailRow label="Ledger Name" value={rate.ledgerName} />
                <DetailRow label="Category" value={rate.category} />
                <DetailRow label="Value" value={formatMoney(rate.value ?? 0)} />
                <DetailRow label="Effective From" value={rate.effectiveFrom} />
              </div>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Linked Ledger</h2>
                <p className="mt-1 text-sm text-slate-500">Accounting head used for this rate.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Ledger Label" value={getLedgerLabel(linkedLedger) || rate.ledgerCode} />
                <DetailRow label="Ledger Code" value={rate.ledgerCode} />
                <DetailRow label="Ledger Name" value={rate.ledgerName} />
                <DetailRow label="Current Value" value={formatMoney(rate.value ?? 0)} />
                <DetailRow label="Category Tag" value={rate.category} />
                <DetailRow label="Effective Date" value={rate.effectiveFrom} />
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Edit Rate"
        subtitle="Update rate code, linked ledger, and value."
        onClose={closeEditor}
        width="min(980px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="rate-form" disabled={saving} className="bg-[#3b79f6] hover:bg-blue-700 text-white shadow-sm rounded-lg px-6">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? (
          <RateForm
            value={draft}
            setValue={setDraft}
            onSubmit={saveRate}
            ledgers={ledgers}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export default RateDetailPage;


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
  const [activeTab, setActiveTab] = useState('overview');

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
        <div className="flex flex-col gap-6 px-8 py-8 md:flex-row md:items-start md:justify-between border-b border-slate-100">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[18px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)] shadow-sm">
              <Percent size={36} strokeWidth={1.5} />
            </div>
            <div>
              <p className="mb-1 text-[13px] font-bold text-[var(--primary,#1661F6)] tracking-wide">{rateCode}</p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{rateLabel}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] px-3 py-1 text-[12px] font-semibold text-[var(--primary,#1661F6)]">
                  <TrendingUp size={14} />
                  {formatMoney(rate.value ?? 0)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
                  <Clock3 size={14} />
                  {rate.effectiveFrom || 'No effective date'}
                </span>
                {linkedLedger && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
                    <BookOpen size={14} />
                    {getLedgerLabel(linkedLedger)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-4">
            {canManage && (
              <Button variant="outline" type="button" onClick={openEditor} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold">
                <Edit2 size={16} />
                Edit Rate
              </Button>
            )}
            
            <div className="flex items-center gap-5 mt-1 bg-slate-50/80 border border-slate-100 rounded-[14px] px-5 py-3 shadow-sm">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Current Value</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{formatMoney(rate.value ?? 0)}</p>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Effective From</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{rate.effectiveFrom || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-100 bg-slate-50/50 px-6">
          {[
            { id: 'overview', label: 'Rate Info', icon: Percent },
            { id: 'ledger', label: 'Linked Ledger', icon: BookOpen }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-[var(--primary,#1661F6)] text-[var(--primary,#1661F6)]'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-8 bg-slate-50/30">
          {activeTab === 'overview' && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Rate Code" value={rateCode} />
                <DetailRow label="Category" value={rate.category} />
                <DetailRow label="Value" value={formatMoney(rate.value ?? 0)} />
                <DetailRow label="Effective From" value={rate.effectiveFrom || '—'} />
              </div>
            </Card>
          )}

          {activeTab === 'ledger' && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Ledger Code" value={rate.ledgerCode} />
                <DetailRow label="Ledger Name" value={rate.ledgerName} />
                <DetailRow label="Ledger Label" value={getLedgerLabel(linkedLedger) || rate.ledgerCode} />
              </div>
            </Card>
          )}
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
            <Button type="submit" form="rate-form" disabled={saving} className="bg-[var(--primary,#1661F6)] hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] text-white shadow-sm rounded-[var(--radius-input,0.75rem)] px-6 border-none">
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


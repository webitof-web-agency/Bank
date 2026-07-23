import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Landmark, BookOpen, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { LedgerForm } from './form';
import { buildLedgerPayload, createLedgerDraftFromRecord, formatMoney } from './ledgerUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
    </div>
  );
}

export function LedgerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const canManage = hasPermission('ledgers.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    api.resources.get('/banking/masters/ledgers', id, token)
      .then((response) => {
        if (!mounted) return;
        setLedger(response.data || null);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load ledger');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!ledger) return;
    setDraft(createLedgerDraftFromRecord(ledger));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDraft(null);
  }

  async function saveLedger(event) {
    event.preventDefault();
    if (!ledger || !draft) return;

    setSaving(true);
    try {
      const payload = buildLedgerPayload(draft);
      const response = await api.resources.update('/banking/masters/ledgers', ledger.id, payload, token);
      setLedger(response.data || ledger);
      toast.success('Ledger updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save ledger');
    } finally {
      setSaving(false);
    }
  }

  const natureBadge = useMemo(() => {
    const nature = String(ledger?.nature || 'ASSET').toUpperCase();
    const classes = {
      ASSET: 'border-blue-200 bg-blue-50 text-blue-700',
      LIABILITY: 'border-amber-200 bg-amber-50 text-amber-700',
      INCOME: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      EXPENSE: 'border-rose-200 bg-rose-50 text-rose-700'
    };
    return classes[nature] || classes.ASSET;
  }, [ledger?.nature]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Ledger not found
      </div>
    );
  }

  const ledgerCode = ledger.code || '—';
  const ledgerName = ledger.name || 'Ledger';
  const openingBalance = formatMoney(ledger.openingBalance ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Ledger Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 bg-[#3b79f6] px-8 py-10 text-white md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/20 bg-white/15 shadow-xl">
              <BookOpen size={34} />
            </div>
            <div>
              <p className="mb-2 text-sm text-blue-50">{ledgerCode}</p>
              <h1 className="text-3xl font-bold tracking-tight">{ledgerName}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${natureBadge}`}>
                  <Landmark size={14} />
                  {String(ledger.nature || 'ASSET').toUpperCase()}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium`}>
                  <CheckCircle2 size={14} />
                  {ledger.isActive !== false ? 'Active' : 'Inactive'}
                </span>
                {ledger.isBankAccount ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                    <ShieldCheck size={14} />
                    Bank Account Linked
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {canManage ? (
            <Button variant="secondary" type="button" onClick={openEditor} className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
              <Edit2 size={16} />
              Edit Ledger
            </Button>
          ) : null}
        </div>

        <div className="p-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Ledger Info</h2>
                <p className="mt-1 text-sm text-slate-500">Core accounting identity and flags.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Ledger Code" value={ledgerCode} />
                <DetailRow label="Ledger Name" value={ledgerName} />
                <DetailRow label="Nature" value={String(ledger.nature || 'ASSET').toUpperCase()} />
                <DetailRow label="Group" value={ledger.group} />
                <DetailRow label="Balance Side" value={String(ledger.balanceSide || 'DR').toUpperCase()} />
                <DetailRow label="Status" value={ledger.isActive !== false ? 'Active' : 'Inactive'} />
              </div>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Balance Info</h2>
                <p className="mt-1 text-sm text-slate-500">Opening balance and bank-account linkage.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Opening Balance" value={openingBalance} />
                <DetailRow label="Opening Side" value={String(ledger.balanceSide || 'DR').toUpperCase()} />
                <DetailRow label="Bank Account" value={ledger.isBankAccount ? 'Yes' : 'No'} />
                <DetailRow label="Created By" value={ledger.createdByUserId || '—'} />
                <DetailRow label="Updated By" value={ledger.updatedByUserId || '—'} />
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Edit Ledger"
        subtitle="Update ledger code and accounting properties."
        onClose={closeEditor}
        width="min(960px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="ledger-form" disabled={saving} className="bg-[#3b79f6] hover:bg-blue-700 text-white shadow-sm rounded-lg px-6">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? (
          <LedgerForm
            value={draft}
            setValue={setDraft}
            onSubmit={saveLedger}
            isEdit
          />
        ) : null}
      </Modal>
    </div>
  );
}

export default LedgerDetailPage;


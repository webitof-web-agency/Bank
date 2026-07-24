import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Landmark, BookOpen, ShieldCheck, CheckCircle2, History, Activity, TrendingUp, CalendarDays } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('overview');

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary,#1661F6)] border-t-transparent" />
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
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-[var(--primary,#1661F6)]">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Ledger Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 px-8 py-8 md:flex-row md:items-center md:justify-between border-b border-slate-100">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[18px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)] shadow-sm">
              <BookOpen size={36} strokeWidth={1.5} />
            </div>
            <div>
              <p className="mb-1 text-[13px] font-bold text-[var(--primary,#1661F6)] tracking-wide">{ledgerCode}</p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{ledgerName}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${natureBadge}`}>
                  <Landmark size={14} />
                  {String(ledger.nature || 'ASSET').toUpperCase()}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${ledger.isActive !== false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                  <CheckCircle2 size={14} />
                  {ledger.isActive !== false ? 'Active' : 'Inactive'}
                </span>
                {ledger.isBankAccount && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-blue-700">
                    <ShieldCheck size={14} />
                    Bank Account
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-4">
            {canManage && (
              <Button variant="outline" type="button" onClick={openEditor} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold">
                <Edit2 size={16} />
                Edit Ledger
              </Button>
            )}
            
            <div className="flex items-center gap-5 mt-1 bg-slate-50/80 border border-slate-100 rounded-[14px] px-5 py-3 shadow-sm">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Current Balance</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{formatMoney(ledger.openingBalance || 0)}</p>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Transactions</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">0</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-100 bg-slate-50/50 px-6">
          {[
            { id: 'overview', label: 'Ledger Info', icon: Activity },
            { id: 'balances', label: 'Balances & Settings', icon: Landmark },
            { id: 'transactions', label: 'Transactions', icon: History }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-[3px] px-6 py-4 text-[13.5px] font-bold transition-colors ${
                  activeTab === tab.id
                    ? 'border-[var(--primary,#1661F6)] text-[var(--primary,#1661F6)]'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon size={16} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-8 bg-slate-50/30">
          {activeTab === 'overview' && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Ledger Code" value={ledgerCode} />
                <DetailRow label="Ledger Name" value={ledgerName} />
                <DetailRow label="Nature" value={String(ledger.nature || 'ASSET').toUpperCase()} />
                <DetailRow label="Group" value={ledger.group} />
                <DetailRow label="Status" value={ledger.isActive !== false ? 'Active' : 'Inactive'} />
              </div>
            </Card>
          )}

          {activeTab === 'balances' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Opening Balance" value={openingBalance} />
                  <DetailRow label="Opening Side" value={String(ledger.balanceSide || 'DR').toUpperCase()} />
                  <DetailRow label="Bank Account" value={ledger.isBankAccount ? 'Yes' : 'No'} />
                  <DetailRow label="Created By" value={ledger.createdByUserId || '—'} />
                  <DetailRow label="Updated By" value={ledger.updatedByUserId || '—'} />
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'transactions' && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
               <div className="border-b border-slate-100 px-6 py-5 flex items-center justify-between">
                 <div>
                   <h2 className="text-base font-bold text-slate-900">Ledger Statement</h2>
                   <p className="text-[13px] text-slate-500 mt-0.5">Recent transactions and vouchers posted to this ledger.</p>
                 </div>
                 <Button variant="outline" className="h-9 px-4 text-[13px] font-medium border-slate-200 text-slate-700 hover:bg-slate-50">
                   Download PDF
                 </Button>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm whitespace-nowrap">
                   <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500">
                     <tr>
                       <th className="px-6 py-3.5 font-semibold text-[13px]">Date</th>
                       <th className="px-6 py-3.5 font-semibold text-[13px]">Voucher No</th>
                       <th className="px-6 py-3.5 font-semibold text-[13px]">Particulars</th>
                       <th className="px-6 py-3.5 font-semibold text-[13px] text-right">Debit (DR)</th>
                       <th className="px-6 py-3.5 font-semibold text-[13px] text-right">Credit (CR)</th>
                       <th className="px-6 py-3.5 font-semibold text-[13px] text-right">Balance</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     <tr className="hover:bg-slate-50/50 transition-colors">
                       <td className="px-6 py-4">01 Apr 2026</td>
                       <td className="px-6 py-4">
                         <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">OPENING</span>
                       </td>
                       <td className="px-6 py-4 text-slate-600 font-medium">Opening Balance Brought Forward</td>
                       <td className="px-6 py-4 text-right">{String(ledger.balanceSide || 'DR').toUpperCase() === 'DR' ? openingBalance : '—'}</td>
                       <td className="px-6 py-4 text-right">{String(ledger.balanceSide || 'DR').toUpperCase() === 'CR' ? openingBalance : '—'}</td>
                       <td className="px-6 py-4 text-right font-bold text-slate-900">{openingBalance} {String(ledger.balanceSide || 'DR').toUpperCase()}</td>
                     </tr>
                     {/* Add empty state below opening balance to signify no more transactions */}
                     <tr>
                       <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                         <div className="flex flex-col items-center justify-center">
                           <History size={24} className="text-slate-300 mb-2" />
                           <p className="text-[13px]">No additional transactions found for this period.</p>
                         </div>
                       </td>
                     </tr>
                   </tbody>
                 </table>
               </div>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Edit Ledger"
        onClose={closeEditor}
        width="min(960px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="ledger-form" disabled={saving} className="bg-[var(--primary,#1661F6)] hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] text-white shadow-sm rounded-[var(--radius-input,0.75rem)] px-6 border-none">
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


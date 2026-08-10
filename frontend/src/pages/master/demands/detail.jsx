import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, RotateCcw, UserRound, Building2, CheckCircle2, AlertCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { DemandForm } from './form';
import { buildDemandPayload, createDemandDraftFromRecord, formatMoney, getBranchLabel, getMemberLabel } from './demandUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || 'â€”'}</div>
    </div>
  );
}

export function DemandDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [demand, setDemand] = useState(null);
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('info');

  const canManage = hasPermission('demands.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      api.resources.get('/banking/masters/demands', id, token),
      api.resources.list('/banking/masters/branches', token),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([demandRes, branchesRes, membersRes]) => {
        if (!mounted) return;
        setDemand(demandRes.data || null);
        setBranches(branchesRes.data || []);
        setMembers(membersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load demand');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!demand) return;
    setDraft(createDemandDraftFromRecord(demand));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDraft(null);
  }

  async function saveDemand(event) {
    event.preventDefault();
    if (!demand || !draft) return;

    setSaving(true);
    try {
      const payload = buildDemandPayload(draft);
      const response = await api.resources.update('/banking/masters/demands', demand.id, payload, token);
      setDemand(response.data || demand);
      toast.success('Demand updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save demand');
    } finally {
      setSaving(false);
    }
  }

  const branchLookup = useMemo(() => new Map(branches.map((branch) => [String(branch.code || '').toUpperCase(), branch])), [branches]);
  const memberLookup = useMemo(() => new Map(members.map((member) => [String(member.code || '').toUpperCase(), member])), [members]);
  const allocations = Array.isArray(demand?.allocations) ? demand.allocations : [];
  const demandListDate = demand?.demandListDate || demand?.dueDate || demand?.payload?.demandListDate || '';
  const demandYear = demand?.year || demand?.payload?.year || '';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!demand) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Demand not found
      </div>
    );
  }

  const demandNo = demand.demandNo || 'â€”';
  const branch = branchLookup.get(String(demand.branchCode || '').trim().toUpperCase());
  const member = memberLookup.get(String(demand.memberCode || '').trim().toUpperCase());
  const status = String(demand.status || 'Pending');
  const statusBadge = status.toLowerCase() === 'recovered'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status.toLowerCase() === 'partially recovered'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Demand Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 px-8 py-8 md:flex-row md:items-start md:justify-between border-b border-slate-100">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[18px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)] shadow-sm">
              <FileText size={36} strokeWidth={1.5} />
            </div>
            <div>
              <p className="mb-1 text-[13px] font-bold text-[var(--primary,#1661F6)] tracking-wide">{demandNo}</p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{demand.month || 'Demand'}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold ${statusBadge}`}>
                  <CheckCircle2 size={14} />
                  {status}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
                  <RotateCcw size={14} />
                  {formatMoney(demand.recovered ?? 0)} Recovered
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-4">
            {canManage && (
              <Button variant="outline" type="button" onClick={openEditor} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold">
                <Edit2 size={16} />
                Edit Demand
              </Button>
            )}
            
            <div className="flex items-center gap-5 mt-1 bg-slate-50/80 border border-slate-100 rounded-[14px] px-5 py-3 shadow-sm">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Amount</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{formatMoney(demand.total ?? 0)}</p>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Balance</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{formatMoney(Math.max((Number(demand.total || 0) - Number(demand.recovered || 0)), 0))}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-100 bg-slate-50/50 px-6">
          {[
            { id: 'info', label: 'Demand Info', icon: FileText },
            { id: 'amounts', label: 'Amounts', icon: Wallet }
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
          {activeTab === 'info' && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Demand No" value={demandNo} />
                <DetailRow label="Month" value={demand.month} />
                <DetailRow label="Branch" value={getBranchLabel(branch) || demand.branchCode} />
                <DetailRow label="Member" value={getMemberLabel(member) || demand.memberCode} />
                <DetailRow label="Demand List Date" value={demandListDate} />
                <DetailRow label="Year" value={demandYear} />
                <DetailRow label="Status" value={demand.status} />
              </div>
            </Card>
          )}

          {activeTab === 'amounts' && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Total" value={formatMoney(demand.total ?? 0)} />
                <DetailRow label="Recovered" value={formatMoney(demand.recovered ?? 0)} />
                <DetailRow label="Pending" value={formatMoney(Math.max((Number(demand.total || 0) - Number(demand.recovered || 0)), 0))} />
                <div className="pt-4">
                  <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500">Loaded Members</p>
                  {allocations.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="grid grid-cols-[1.2fr_0.5fr] gap-0 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                        <div>Member</div>
                        <div className="text-right">Amount</div>
                      </div>
                      {allocations.map((row, index) => (
                        <div key={`${row.memberCode || index}`} className="grid grid-cols-[1.2fr_0.5fr] gap-0 border-b border-slate-100 bg-white px-4 py-3 last:border-b-0">
                          <div className="text-[13px] font-medium text-slate-900">{row.head || row.memberCode || "-"}</div>
                          <div className="text-right text-[13px] font-medium text-slate-700">{formatMoney(row.amount ?? 0)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">No allocations loaded.</div>
                  )}
                </div>
                <DetailRow label="Remarks" value={demand.remarks} />
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Edit Demand"
        onClose={closeEditor}
        width="min(1000px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="demand-form" disabled={saving} className="bg-[var(--primary,#1661F6)] hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] text-white shadow-sm rounded-[var(--radius-input,0.75rem)] px-6 border-none">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? (
          <DemandForm
            value={draft}
            setValue={setDraft}
            onSubmit={saveDemand}
            branches={branches}
            members={members}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export default DemandDetailPage;



import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, RotateCcw, UserRound, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
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
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
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

  const demandNo = demand.demandNo || '—';
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
        <div className="flex flex-col gap-6 bg-[#3b79f6] px-8 py-10 text-white md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/20 bg-white/15 shadow-xl">
              <FileText size={34} />
            </div>
            <div>
              <p className="mb-2 text-sm text-blue-50">{demandNo}</p>
              <h1 className="text-3xl font-bold tracking-tight">{demand.month || 'Demand'}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${statusBadge}`}>
                  <CheckCircle2 size={14} />
                  {status}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                  <RotateCcw size={14} />
                  {formatMoney(demand.recovered ?? 0)} Recovered
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                  <AlertCircle size={14} />
                  Balance {formatMoney(Math.max((Number(demand.total || 0) - Number(demand.recovered || 0)), 0))}
                </span>
              </div>
            </div>
          </div>

          {canManage ? (
            <Button variant="secondary" type="button" onClick={openEditor} className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
              <Edit2 size={16} />
              Edit Demand
            </Button>
          ) : null}
        </div>

        <div className="p-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Demand Info</h2>
                <p className="mt-1 text-sm text-slate-500">Branch and member linkage.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Demand No" value={demandNo} />
                <DetailRow label="Month" value={demand.month} />
                <DetailRow label="Branch" value={getBranchLabel(branch) || demand.branchCode} />
                <DetailRow label="Member" value={getMemberLabel(member) || demand.memberCode} />
                <DetailRow label="Due Date" value={demand.dueDate} />
                <DetailRow label="Status" value={demand.status} />
              </div>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Amounts</h2>
                <p className="mt-1 text-sm text-slate-500">Demand and recovery values.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Total" value={formatMoney(demand.total ?? 0)} />
                <DetailRow label="Recovered" value={formatMoney(demand.recovered ?? 0)} />
                <DetailRow label="Pending" value={formatMoney(Math.max((Number(demand.total || 0) - Number(demand.recovered || 0)), 0))} />
                <DetailRow label="Remarks" value={demand.remarks} />
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Edit Demand"
        subtitle="Update branch, member, and recovery amounts."
        onClose={closeEditor}
        width="min(1000px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="demand-form" disabled={saving} className="bg-[#3b79f6] hover:bg-blue-700 text-white shadow-sm rounded-lg px-6">
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


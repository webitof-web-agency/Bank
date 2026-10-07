import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../api/api';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { ConfirmDialog } from '../../../../components/overlays/ConfirmDialog';
import { useAuth } from '../../../../context/AuthContext';
import { useFY } from '../../../../context/FYContext';
import { DemandForm } from './form';
import { DEMAND_HEADS, MONTH_OPTIONS, buildDemandEntryPayload, demandLineTotal, draftFromEntry, isRecoveredLine } from './demandEntryDraft';
import { DemandStatusPill, formatAmount } from './index';

// One demand list: header and member lines, each Pending or Recovered (with
// the recovery voucher that collected it).
export function DemandEntryDetailPage({ basePath = '/app/transactions/other/demand-entry' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const { activeFY } = useFY();
  const [entry, setEntry] = useState(null);
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canManage = hasPermission('demands.write');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.banking.demandEntry.get(token, id),
      api.resources.list('/banking/masters/branches', token),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([entryRes, branchesRes, membersRes]) => {
        if (!mounted) return;
        setEntry(entryRes.data || null);
        setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : []);
        setMembers(Array.isArray(membersRes.data) ? membersRes.data : []);
      })
      .catch((error) => mounted && toast.error(error.message || 'Unable to load demand list'));
    return () => { mounted = false; };
  }, [id, token]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.banking.demandEntry.update(token, id, buildDemandEntryPayload(draft, activeFY), { fyStart: activeFY?.start || '', fyEnd: activeFY?.end || '' });
      setEntry(response.data);
      setDraft(null);
      toast.success('Demand list updated');
    } catch (error) {
      toast.error(error.message || 'Unable to save demand list');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await api.banking.demandEntry.remove(token, id);
      toast.success('Demand list deleted');
      navigate(basePath);
    } catch (error) {
      toast.error(error.message || 'Unable to delete demand list');
    } finally {
      setConfirmOpen(false);
    }
  }

  if (!entry) return <div className="p-10 text-center text-slate-500">Loading...</div>;
  const month = MONTH_OPTIONS.find((option) => option.value === String(entry.month))?.label || entry.month;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={() => navigate(basePath)} className="mb-2 inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Demand Entry</button>
          <h1 className="text-2xl font-bold text-slate-900">Demand List {entry.demandListNo}</h1>
          <p className="text-[13px] text-slate-600">{entry.branchCode} - {entry.branchName} · {month} {entry.year} · {entry.demandListDate || 'no date'}</p>
        </div>
        <div className="flex items-center gap-2">
          <DemandStatusPill status={entry.status} />
          {canManage ? (
            <>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setDraft(draftFromEntry(entry))}><Edit2 size={15} /> Edit</Button>
              <Button type="button" variant="outline" className="gap-2" disabled={entry.recoveredCount > 0} title={entry.recoveredCount > 0 ? 'Has recovered members: delete the recovery first' : ''} onClick={() => setConfirmOpen(true)}><Trash2 size={15} /> Delete</Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[['Members', entry.memberCount], ['Total Demand', formatAmount(entry.totalAmount)], ['Pending', entry.pendingCount], ['Recovered', entry.recoveredCount]].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Designation</th>
              {DEMAND_HEADS.map(([key, label]) => <th key={key} className="px-3 py-2 text-right">{label}</th>)}
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entry.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-3 py-2"><span className="font-medium">{line.memberCode}</span> {line.memberName}</td>
                <td className="px-3 py-2 text-slate-600">{line.designation}</td>
                {DEMAND_HEADS.map(([key]) => <td key={key} className="px-3 py-2 text-right">{Number(line[key]) ? formatAmount(line[key]) : '-'}</td>)}
                <td className="px-3 py-2 text-right font-semibold">{formatAmount(demandLineTotal(line))}</td>
                <td className="px-3 py-2">{isRecoveredLine(line) ? `Recovered${line.recoveryVoucherNo ? ` · voucher ${line.recoveryVoucherNo}` : ''}` : 'Pending'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entry.remarks ? <p className="text-[13px] text-slate-600">Remarks: {entry.remarks}</p> : null}

      <Modal
        open={Boolean(draft)}
        title={`Edit Demand List ${entry.demandListNo}`}
        onClose={() => setDraft(null)}
        width="min(1200px, 97vw)"
        footer={(
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="demand-form" disabled={saving} className="bg-[var(--primary,#1661F6)] text-white">{saving ? 'Saving...' : 'Save Demand'}</Button>
          </div>
        )}
      >
        {draft ? (
          <DemandForm
            value={draft}
            setValue={(update) => setDraft((current) => (typeof update === 'function' ? update(current) : update))}
            onSubmit={save}
            branches={branches}
            members={members}
            fy={activeFY}
            locked={entry.recoveredCount > 0}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete demand list"
        description={`Delete demand list ${entry.demandListNo} and its ${entry.memberCount} member line(s)?`}
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={remove}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default DemandEntryDetailPage;

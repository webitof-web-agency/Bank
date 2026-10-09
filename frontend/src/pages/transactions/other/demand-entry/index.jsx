import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Edit2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../api/api';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { ConfirmDialog } from '../../../../components/overlays/ConfirmDialog';
import { useAuth } from '../../../../context/AuthContext';
import { useFY } from '../../../../context/FYContext';
import { DemandForm } from './form';
import { MONTH_OPTIONS, buildDemandEntryPayload, draftFromEntry, emptyDemandDraft } from './demandEntryDraft';

const STATUS_LABELS = { PENDING: 'Pending', PARTIAL: 'Partly recovered', RECOVERED: 'Recovered' };
const STATUS_CLASS = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  PARTIAL: 'border-blue-200 bg-blue-50 text-blue-700',
  RECOVERED: 'border-emerald-200 bg-emerald-50 text-emerald-700'
};

export function DemandStatusPill({ status = 'PENDING' }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status] || STATUS_CLASS.PENDING}`}>{STATUS_LABELS[status] || status}</span>;
}

export function formatAmount(value) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

const monthLabel = (month) => MONTH_OPTIONS.find((option) => option.value === String(month))?.label || month || '-';

// Demand Entry: one row per demand list (branch + month); members and amounts
// are on the list. Lines stay Pending until a saved recovery collects them.
export function DemandEntryPage({ detailPathBase = '/app/transactions/other/demand-entry' }) {
  const navigate = useNavigate();
  const { token, pageAccess } = useAuth();
  const { activeFY } = useFY();
  const [entries, setEntries] = useState([]);
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null); // { id, draft, locked }
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { canCreate, canEdit, canDelete } = pageAccess('master', 'demands', 'transactions.supporting');
  const fyQuery = { fyStart: activeFY?.start || '', fyEnd: activeFY?.end || '' };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      api.banking.demandEntry.list(token, fyQuery),
      api.resources.list('/banking/masters/branches', token),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([entriesRes, branchesRes, membersRes]) => {
        if (!mounted) return;
        setEntries(Array.isArray(entriesRes.data) ? entriesRes.data : []);
        setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : []);
        setMembers(Array.isArray(membersRes.data) ? membersRes.data : []);
      })
      .catch((error) => mounted && toast.error(error.message || 'Unable to load demand lists'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeFY?.start]);

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return entries.filter((entry) => (!filterBranch || String(entry.branchCode) === String(filterBranch))
      && (!filterMonth || String(entry.month) === String(filterMonth))
      && (!text || [entry.demandListNo, entry.branchCode, entry.branchName, entry.remarks].some((value) => String(value || '').toLowerCase().includes(text))));
  }, [entries, filterBranch, filterMonth, search]);

  const stats = useMemo(() => ({
    lists: rows.length,
    members: rows.reduce((sum, row) => sum + row.memberCount, 0),
    pending: rows.reduce((sum, row) => sum + row.pendingCount, 0),
    total: Math.round(rows.reduce((sum, row) => sum + Math.round(Number(row.totalAmount || 0) * 100), 0)) / 100
  }), [rows]);

  async function openEdit(entry) {
    try {
      const response = await api.banking.demandEntry.get(token, entry.id);
      const full = response.data || {};
      setEditor({ id: entry.id, draft: draftFromEntry(full), locked: full.recoveredCount > 0 });
    } catch (error) {
      toast.error(error.message || 'Unable to open demand list');
    }
  }

  async function saveDemand(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildDemandEntryPayload(editor.draft, activeFY);
      const response = editor.id
        ? await api.banking.demandEntry.update(token, editor.id, payload, fyQuery)
        : await api.banking.demandEntry.create(token, payload, fyQuery);
      const saved = response.data;
      const { lines, ...summary } = saved;
      setEntries((current) => (editor.id ? current.map((row) => (row.id === saved.id ? summary : row)) : [summary, ...current]));
      toast.success(editor.id ? 'Demand list updated' : `Demand list saved: ${saved.memberCount} member(s), all pending`);
      setEditor(null);
    } catch (error) {
      toast.error(error.message || 'Unable to save demand list');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    try {
      await api.banking.demandEntry.remove(token, deleteTarget.id);
      setEntries((current) => current.filter((row) => row.id !== deleteTarget.id));
      toast.success('Demand list deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete demand list');
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--primary,#1661F6)]">Other Transactions</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Demand Entry</h1>
          <p className="text-[13px] text-slate-500">Monthly demand per branch for FY {activeFY?.label}. Recovery collects it member by member.</p>
        </div>
        {canCreate ? (
          <Button type="button" className="gap-2 bg-[var(--primary,#1661F6)] text-white" onClick={() => setEditor({ id: null, draft: emptyDemandDraft(activeFY, entries), locked: false })}>
            <Plus size={16} /> New Demand List
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Demand Lists', stats.lists],
          ['Members', stats.members],
          ['Pending Members', stats.pending],
          ['Total Demand', formatAmount(stats.total)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_260px_180px]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search list no, branch or remarks" className="h-10 rounded-[0.75rem] border border-slate-200 px-3 text-[13px] outline-none focus:border-[var(--primary)]" />
          <Select searchable value={filterBranch} onChange={setFilterBranch} options={[{ value: '', label: 'All branches' }, ...branches.map((branch) => ({ value: branch.code, label: `${branch.code} - ${branch.place || branch.label || ''}` }))]} />
          <Select value={filterMonth} onChange={setFilterMonth} options={[{ value: '', label: 'All months' }, ...MONTH_OPTIONS]} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-4 py-3">List No.</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-right">Total Demand</th>
                <th className="px-4 py-3 text-right">Pending / Recovered</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.demandListNo}</td>
                  <td className="px-4 py-3 text-slate-700">{row.demandListDate || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.branchCode} - {row.branchName}</td>
                  <td className="px-4 py-3 text-slate-700">{monthLabel(row.month)} {row.year}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.memberCount}</td>
                  <td className="px-4 py-3 text-right text-slate-900">{formatAmount(row.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.pendingCount} / {row.recoveredCount}</td>
                  <td className="px-4 py-3"><DemandStatusPill status={row.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => navigate(`${detailPathBase}/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View"><Eye size={16} /></button>
                      {canEdit ? (
                            <button type="button" onClick={() => openEdit(row)} className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Edit"><Edit2 size={16} /></button>
                      ) : null}
                      {canDelete ? (
                            <button type="button" onClick={() => setDeleteTarget(row)} disabled={row.recoveredCount > 0} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" title={row.recoveredCount > 0 ? 'Has recovered members: delete the recovery first' : 'Delete'}><Trash2 size={16} /></button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">{loading ? 'Loading...' : 'No demand lists for this financial year.'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(editor)}
        title={editor?.id ? `Edit Demand List ${editor?.draft?.demandListNo || ''}` : 'New Demand List'}
        onClose={() => setEditor(null)}
        width="min(1200px, 97vw)"
        footer={(
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setEditor(null)}>Cancel</Button>
            <Button type="submit" form="demand-form" disabled={saving} className="bg-[var(--primary,#1661F6)] text-white">{saving ? 'Saving...' : 'Save Demand'}</Button>
          </div>
        )}
      >
        {editor ? (
          <DemandForm
            value={editor.draft}
            setValue={(update) => setEditor((current) => ({ ...current, draft: typeof update === 'function' ? update(current.draft) : update }))}
            onSubmit={saveDemand}
            branches={branches}
            members={members}
            fy={activeFY}
            locked={editor.locked}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete demand list"
        description={`Delete demand list ${deleteTarget?.demandListNo || ''} (${deleteTarget?.branchName || ''}) and its ${deleteTarget?.memberCount || 0} member line(s)?`}
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default DemandEntryPage;

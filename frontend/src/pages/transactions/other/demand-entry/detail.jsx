import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, Layers3, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../api/api';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Modal } from '../../../../components/ui/Modal';
import { ConfirmDialog } from '../../../../components/overlays/ConfirmDialog';
import { useAuth } from '../../../../context/AuthContext';
import { DemandForm } from '../../../master/demands/form';
import { buildDemandPayload, createDemandDraftFromRecord, formatMoney, getBranchLabel, getMemberLabel } from '../../../master/demands/demandUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
    </div>
  );
}

function StatusBadge({ status = '' }) {
  const value = String(status || '').toLowerCase();
  const className =
    value === 'recovered' || value === 'fully recovered'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value === 'partially recovered'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium ${className}`}>
      {status || 'Pending'}
    </span>
  );
}

function SimpleTable({ headers = [], rows = [], emptyMessage = 'No records found.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[13px]">
        <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-[0.05em] text-[11px]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3.5">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={row.key || rowIndex} className="hover:bg-slate-50/50">
              {row.cells.map((cell, cellIndex) => (
                <td key={`${row.key || rowIndex}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-slate-500">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DemandEntryDetailPage({ basePath = '/app/transactions/other/demand-entry' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [record, setRecord] = useState(null);
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('info');

  const canManage = hasPermission('demands.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      api.resources.get('/banking/masters/demand-lists', id, token),
      api.resources.list('/banking/masters/branches', token),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([demandRes, branchesRes, membersRes]) => {
        if (!mounted) return;
        setRecord(demandRes.data || null);
        setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : []);
        setMembers(Array.isArray(membersRes.data) ? membersRes.data : []);
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
    if (!record) return;
    setDraft(createDemandDraftFromRecord(record));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDraft(null);
  }

  async function saveDemand(event) {
    event.preventDefault();
    if (!record || !draft) return;

    setSaving(true);
    try {
      const payload = buildDemandPayload(draft);
      const response = await api.resources.update('/banking/masters/demand-lists', record.id, payload, token);
      setRecord(response.data || response);
      toast.success('Demand updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save demand');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!record) return;
    try {
      await api.resources.remove('/banking/masters/demand-lists', record.id, token);
      toast.success('Demand deleted');
      navigate(basePath);
    } catch (error) {
      toast.error(error.message || 'Unable to delete demand');
    } finally {
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Demand not found
      </div>
    );
  }

  const branchLookup = new Map(branches.map((branch) => [String(branch.code || '').trim().toUpperCase(), branch]));
  const memberLookup = new Map(members.map((member) => [String(member.code || '').trim().toUpperCase(), member]));
  const branch = branchLookup.get(String(record.branchCode || '').trim().toUpperCase());
  const member = memberLookup.get(String(record.memberCode || '').trim().toUpperCase());
  const allocations = Array.isArray(record.allocations) ? record.allocations : [];
  const demandListDate = record.dueDate || record.payload?.demandListDate || '';
  const yearValue = record.payload?.year || new Date(record.dueDate || record.updatedAt || Date.now()).getFullYear();
  const pendingAmount = Math.max(Number(record.total || 0) - Number(record.recovered || 0), 0);
  const statusValue = String(record.status || 'Pending').toLowerCase();
  const statusBadge = statusValue === 'recovered' || statusValue === 'fully recovered'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : statusValue === 'partially recovered'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 print:hidden">
        <button type="button" onClick={() => navigate(basePath)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
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
              <p className="mb-1 text-[13px] font-bold text-[var(--primary,#1661F6)] tracking-wide">{record.demandNo || '—'}</p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{record.month || 'Demand'}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold ${statusBadge}`}>
                  {record.status || 'Pending'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
                  <RotateCcw size={14} />
                  {formatMoney(record.recovered ?? 0)} Recovered
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-4">
            {canManage ? (
              <Button type="button" variant="outline" onClick={openEditor} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold">
                <Edit2 size={16} />
                Edit Demand
              </Button>
            ) : null}
                <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold">
                  <Trash2 size={16} />
                  Delete Demand
                </Button>

            <div className="flex items-center gap-5 mt-1 bg-slate-50/80 border border-slate-100 rounded-[14px] px-5 py-3 shadow-sm overflow-x-auto">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Amount</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{formatMoney(record.total ?? 0)}</p>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Balance</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{formatMoney(pendingAmount)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-100 bg-slate-50/50 px-6">
          {[
            { id: 'info', label: 'Demand Info', icon: FileText },
            { id: 'amounts', label: 'Amounts', icon: Layers3 }
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
          {activeTab === 'info' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Demand No" value={record.demandNo} />
                <DetailRow label="Month" value={record.month} />
                <DetailRow label="Branch" value={getBranchLabel(branch) || record.branchCode} />
                <DetailRow label="Member" value={getMemberLabel(member) || record.memberCode} />
                <DetailRow label="Demand List Date" value={demandListDate} />
                <DetailRow label="Year" value={yearValue} />
                <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
                <DetailRow label="Remarks" value={record.remarks} />
              </div>
            </Card>
          ) : null}

          {activeTab === 'amounts' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Total" value={formatMoney(record.total ?? 0)} />
                <DetailRow label="Recovered" value={formatMoney(record.recovered ?? 0)} />
                <DetailRow label="Pending" value={formatMoney(pendingAmount)} />
                <div className="pt-4">
                  <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500">Loaded Members</p>
                  {allocations.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <SimpleTable
                        headers={['Member', 'Head', 'Amount']}
                        rows={allocations.map((row, index) => ({
                          key: `${row.memberCode || index}`,
                          cells: [
                            row.memberCode || '—',
                            row.head || '—',
                            formatMoney(row.amount ?? 0)
                          ]
                        }))}
                        emptyMessage="No allocations loaded."
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">No allocations loaded.</div>
                  )}
                </div>
              </div>
            </Card>
          ) : null}
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

      <ConfirmDialog
        open={deleteOpen}
        title="Delete demand"
        description={`Delete ${record.demandNo || 'this demand'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}

export default DemandEntryDetailPage;

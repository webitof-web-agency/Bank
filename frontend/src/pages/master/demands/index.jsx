import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Edit2, Eye, FileText, Plus, RotateCcw, Trash2, UserRound, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { DemandForm } from './form';
import { buildDemandPayload, createDemandDraftFromRecord, createEmptyDemandDraft, formatMoney, getBranchLabel, getMemberLabel } from './demandUtils';

function getDemandStatus(demand) {
  return String(demand?.status || 'Pending');
}

export function DemandsPage() {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyDemandDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = hasPermission('demands.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLookupsLoading(true);

    Promise.all([
      api.resources.list('/banking/masters/demands', token, search),
      api.resources.list('/banking/masters/branches', token),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([demandsRes, branchesRes, membersRes]) => {
        if (!mounted) return;
        setRows(demandsRes.data || []);
        setBranches(branchesRes.data || []);
        setMembers(membersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load demands');
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
          setLookupsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [search, token]);

  function openCreate() {
    setActiveRecord(null);
    setDraft(createEmptyDemandDraft(rows));
    setEditorOpen(true);
  }

  function openEdit(demand) {
    setActiveRecord(demand);
    setDraft(createDemandDraftFromRecord(demand));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyDemandDraft(rows));
  }

  async function saveDemand(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildDemandPayload(draft);
      const response = activeRecord
        ? await api.resources.update('/banking/masters/demands', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/demands', payload, token);

      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Demand updated' : 'Demand created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save demand');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/demands', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Demand deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete demand');
    } finally {
      setDeleteTarget(null);
    }
  }

  const branchLookup = useMemo(() => new Map(branches.map((branch) => [String(branch.code || '').toUpperCase(), branch])), [branches]);
  const memberLookup = useMemo(() => new Map(members.map((member) => [String(member.code || '').toUpperCase(), member])), [members]);

  const stats = useMemo(() => {
    const total = rows.length;
    const recovered = rows.filter((row) => getDemandStatus(row).toLowerCase() === 'recovered').length;
    const pending = rows.filter((row) => getDemandStatus(row).toLowerCase() === 'pending').length;
    const amount = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    return { total, recovered, pending, amount };
  }, [rows]);

  const columns = [
    { key: 'demandNo', label: 'Demand No', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.demandNo || '-'}</span> },
    { key: 'month', label: 'Month', sortable: true, render: (row) => <span className="text-slate-700">{row.month || '-'}</span> },
    {
      key: 'branchCode',
      label: 'Branch',
      sortable: true,
      render: (row) => {
        const branch = branchLookup.get(String(row.branchCode || '').trim().toUpperCase());
        return <span className="text-slate-700">{getBranchLabel(branch) || row.branchCode || '-'}</span>;
      }
    },
    {
      key: 'memberCode',
      label: 'Member',
      sortable: true,
      render: (row) => {
        const member = memberLookup.get(String(row.memberCode || '').trim().toUpperCase());
        return <span className="text-slate-700">{getMemberLabel(member) || row.memberCode || '-'}</span>;
      }
    },
    { key: 'total', label: 'Total', sortable: true, render: (row) => <span className="text-slate-700">{formatMoney(row.total ?? 0)}</span> },
    { key: 'recovered', label: 'Recovered', sortable: true, render: (row) => <span className="text-slate-700">{formatMoney(row.recovered ?? 0)}</span> },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => {
        const status = getDemandStatus(row).toLowerCase();
        if (status === 'recovered') {
          return <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">Recovered</span>;
        }
        if (status === 'partially recovered') {
          return <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">Partially Recovered</span>;
        }
        return <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">Pending</span>;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <button type="button" onClick={() => navigate(`/app/master/demands/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View">
            <Eye size={16} />
          </button>
          {canManage ? (
            <>
              <button type="button" onClick={() => openEdit(row)} className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                <Edit2 size={16} />
              </button>
              <button type="button" onClick={() => setDeleteTarget(row)} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                <Trash2 size={16} />
              </button>
            </>
          ) : null}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Demands</h1>
          <p className="mt-1 text-sm text-slate-500">Track monthly demands, recoveries, and member-wise dues from a dedicated master screen.</p>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Demand
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Demands', value: stats.total, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50', subLabel: 'All demand records' },
          { label: 'Recovered', value: stats.recovered, icon: RotateCcw, color: 'text-emerald-500', bg: 'bg-emerald-50', subLabel: 'Recovered entries' },
          { label: 'Pending', value: stats.pending, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50', subLabel: 'Open demand records' },
          { label: 'Total Amount', value: formatMoney(stats.amount), icon: UserRound, color: 'text-purple-500', bg: 'bg-purple-50', subLabel: 'Demand amount summary' }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${item.bg} ${item.color}`}>
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
                <p className="text-xl font-bold text-slate-900">{loading ? '...' : item.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{item.subLabel}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading demands...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No demands found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search demands..."
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Demand' : 'Add Demand'}
        subtitle="Maintain demand number, branch/member mapping, and recovery status."
        onClose={closeEditor}
        width="min(1000px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="demand-form" disabled={saving || lookupsLoading} className="bg-[#3b79f6] hover:bg-blue-700 text-white shadow-sm rounded-lg px-6">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Demand')}
            </Button>
          </div>
        }
      >
        <DemandForm
          value={draft}
          setValue={setDraft}
          onSubmit={saveDemand}
          branches={branches}
          members={members}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete demand"
        description={`Delete ${deleteTarget?.demandNo || 'this demand'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default DemandsPage;


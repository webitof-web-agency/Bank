import { useEffect, useMemo, useState } from 'react';
import { Building2, Edit2, Plus, Trash2, Users, BadgeHelp } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Select } from '../../components/ui/Select';
import { formatBranchLabel } from '../master/employees/employeeUtils';

function createEmptyManagerDraft() {
  return {
    name: '',
    designation: '',
    branchCode: '',
    isActive: true
  };
}

function createManagerDraftFromRecord(record = {}) {
  return {
    name: record.name || '',
    designation: record.designation || '',
    branchCode: record.branchCode || '',
    isActive: record.isActive !== false
  };
}

function buildManagerPayload(draft = {}) {
  return {
    name: String(draft.name || '').trim(),
    designation: String(draft.designation || '').trim(),
    branchCode: String(draft.branchCode || '').trim().toUpperCase(),
    isActive: Boolean(draft.isActive),
    payload: {}
  };
}

function isActiveManager(record = {}) {
  return record.isActive !== false;
}

export function ManagerMasterPage() {
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyManagerDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = hasPermission('employees.write', 'users.manage');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLookupsLoading(true);

    Promise.all([
      api.resources.list('/banking/masters/managers', token, search),
      api.resources.list('/banking/masters/branches', token)
    ])
      .then(([recordsRes, branchesRes]) => {
        if (!mounted) return;
        setRows(recordsRes.data || []);
        setBranches(branchesRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load managers');
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

  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [String(branch.code || '').trim().toUpperCase(), branch])),
    [branches]
  );

  const branchOptions = useMemo(
    () => branches
      .map((branch) => ({
        value: String(branch.code || '').trim().toUpperCase(),
        label: formatBranchLabel(branch) || branch.code || 'Branch'
      }))
      .filter((option) => option.value),
    [branches]
  );

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => isActiveManager(row)).length,
    branches: new Set(rows.map((row) => String(row.branchCode || '').trim().toUpperCase()).filter(Boolean)).size
  }), [rows]);

  function openCreate() {
    setActiveRecord(null);
    setDraft(createEmptyManagerDraft());
    setEditorOpen(true);
  }

  function openEdit(record) {
    setActiveRecord(record);
    setDraft(createManagerDraftFromRecord(record));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyManagerDraft());
  }

  async function saveRecord(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildManagerPayload(draft);
      const response = activeRecord
        ? await api.resources.update('/banking/masters/managers', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/managers', payload, token);

      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Manager updated' : 'Manager created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save manager');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/managers', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Manager deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete manager');
    } finally {
      setDeleteTarget(null);
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Manager Name',
      sortable: true,
      render: (row) => <span className="font-medium text-slate-900">{row.name || '-'}</span>
    },
    {
      key: 'designation',
      label: 'Designation',
      sortable: true,
      render: (row) => <span className="text-slate-700">{row.designation || '-'}</span>
    },
    {
      key: 'branchCode',
      label: 'Branch',
      sortable: true,
      render: (row) => {
        const branch = branchMap.get(String(row.branchCode || '').trim().toUpperCase());
        return <span className="text-slate-700">{formatBranchLabel(branch) || row.branchCode || '-'}</span>;
      }
    },
    {
      key: 'isActive',
      label: 'Status',
      sortable: true,
      render: (row) => (
        isActiveManager(row)
          ? <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">Active</span>
          : <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700">Inactive</span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manager Master</h1>
          <p className="mt-1 text-sm text-slate-500">Prototype ke manager form ke core fields yahan backend se save ho rahe hain.</p>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Manager
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Total Managers', value: stats.total, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50', subLabel: 'All manager rows' },
          { label: 'Active', value: stats.active, icon: BadgeHelp, color: 'text-emerald-500', bg: 'bg-emerald-50', subLabel: 'Enabled managers' },
          { label: 'Branches Used', value: stats.branches, icon: Building2, color: 'text-purple-500', bg: 'bg-purple-50', subLabel: 'Unique branch mapping' }
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
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading managers...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No manager records found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search managers..."
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Manager' : 'Add Manager'}
        onClose={closeEditor}
        width="min(760px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="manager-form" disabled={saving || lookupsLoading} className="bg-[var(--primary,#1661F6)] hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] text-white shadow-sm rounded-[var(--radius-input,0.75rem)] px-6 border-none">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Manager')}
            </Button>
          </div>
        }
      >
        <form id="manager-form" onSubmit={saveRecord} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Manager Name</label>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Enter manager name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Designation</label>
              <Input
                value={draft.designation}
                onChange={(event) => setDraft((current) => ({ ...current, designation: event.target.value }))}
                placeholder="Enter designation"
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Branch</label>
              <Select
                value={draft.branchCode}
                onChange={(value) => setDraft((current) => ({ ...current, branchCode: value }))}
                options={branchOptions}
                searchable
                placeholder="Select branch"
                disabled={!branchOptions.length}
              />
            </div>
            <div className="space-y-2 md:pt-8">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--primary,#1661F6)] focus:ring-[var(--primary,#1661F6)]"
                />
                Active
              </label>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete manager"
        description={`Delete ${deleteTarget?.name || deleteTarget?.designation || 'this manager'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default ManagerMasterPage;

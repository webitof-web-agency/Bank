import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Edit2, Eye, GitBranch, Plus, Trash2, MapPin, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { BranchForm } from './form';
import { buildBranchPayload, createBranchDraftFromRecord, createEmptyBranchDraft } from './branchUtils';

function isActiveBranch(branch) {
  return branch?.isActive !== false;
}

export function BranchesPage() {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyBranchDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = hasPermission('branches.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    api.resources.list('/banking/masters/branches', token, search)
      .then((response) => {
        if (!mounted) return;
        setRows(response.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load branches');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [search, token]);

  function openCreate() {
    setActiveRecord(null);
    setDraft(createEmptyBranchDraft(rows));
    setEditorOpen(true);
  }

  function openEdit(branch) {
    setActiveRecord(branch);
    setDraft(createBranchDraftFromRecord(branch));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyBranchDraft(rows));
  }

  async function saveBranch(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildBranchPayload(draft);
      const response = activeRecord
        ? await api.resources.update('/banking/masters/branches', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/branches', payload, token);

      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Branch updated' : 'Branch created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save branch');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/branches', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Branch deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete branch');
    } finally {
      setDeleteTarget(null);
    }
  }

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => isActiveBranch(row)).length,
    inactive: rows.filter((row) => !isActiveBranch(row)).length,
    places: new Set(rows.map((row) => String(row.place || '').trim()).filter(Boolean)).size
  }), [rows]);

  const columns = [
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.code || '-'}</span> },
    { key: 'headOfficeCode', label: 'Head Office', sortable: true, render: (row) => <span className="text-slate-700">{row.headOfficeCode || 'HO01'}</span> },
    { key: 'label', label: 'Branch Name', sortable: true, render: (row) => <span className="text-slate-700">{row.label || '-'}</span> },
    { key: 'place', label: 'Place', sortable: true, render: (row) => <span className="text-slate-700">{row.place || '-'}</span> },
    { key: 'district', label: 'District', sortable: true, render: (row) => <span className="text-slate-700">{row.district || '-'}</span> },
    { key: 'phone', label: 'Phone', sortable: true, render: (row) => <span className="text-slate-700">{row.phone || '-'}</span> },
    {
      key: 'isActive',
      label: 'Status',
      sortable: true,
      render: (row) => (
        isActiveBranch(row)
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
          <button type="button" onClick={() => navigate(`/app/master/branches/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View">
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Branches</h1>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Branch
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Branches', value: stats.total, icon: GitBranch, color: 'text-blue-500', bg: 'bg-blue-50', subLabel: 'All branch rows' },
          { label: 'Active', value: stats.active, icon: Building2, color: 'text-emerald-500', bg: 'bg-emerald-50', subLabel: 'Enabled branches' },
          { label: 'Inactive', value: stats.inactive, icon: MapPin, color: 'text-rose-500', bg: 'bg-rose-50', subLabel: 'Disabled branches' },
          { label: 'Places', value: stats.places, icon: Phone, color: 'text-purple-500', bg: 'bg-purple-50', subLabel: 'Unique locations' }
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
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading branches...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No branches found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search branches..."
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Branch' : 'Add Branch'}
        onClose={closeEditor}
        width="min(980px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="branch-form" disabled={saving} className="bg-[var(--primary,#1661F6)] hover:opacity-90 text-white shadow-sm rounded-[var(--radius-button,1rem)] px-6">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Branch')}
            </Button>
          </div>
        }
      >
        <BranchForm
          value={draft}
          setValue={setDraft}
          onSubmit={saveBranch}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete branch"
        description={`Delete ${deleteTarget?.label || deleteTarget?.code || 'this branch'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default BranchesPage;


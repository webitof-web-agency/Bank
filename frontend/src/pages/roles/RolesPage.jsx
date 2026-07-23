import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ShieldCheck, Trash2, Edit2, CheckCircle, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Table } from '../../components/ui/Table';

export function RolesPage() {
  const { token, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canEdit = hasPermission('roles.manage');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.roles.list(token, search)
      .then((rolesRes) => {
        if (!mounted) return;
        setRows(rolesRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load roles');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [search, token]);

  function openCreate() {
    navigate('/app/roles/new');
  }

  function openEdit(role) {
    navigate(`/app/roles/${role.id}`);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.roles.remove(token, deleteTarget.id);
      setRows((current) => current.filter((row) => row.id !== deleteTarget.id));
      toast.success('Role deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete role');
    } finally {
      setDeleteTarget(null);
    }
  }

  const stats = {
    total: rows.length,
    active: rows.filter((row) => row.isActive !== false).length,
    system: rows.filter((row) => row.isSystem).length,
    assignments: rows.reduce((acc, row) => acc + (row.permissions || []).length, 0)
  };

  const columns = [
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="text-slate-700">{row.code}</span> },
    { key: 'name', label: 'Name', sortable: true, render: (row) => <span className="text-slate-700">{row.name}</span> },
    { key: 'description', label: 'Description', sortable: true, render: (row) => <span className="text-slate-700">{row.description || '—'}</span> },
    { key: 'permissions', label: 'Permissions', sortable: true, sortValue: (row) => (row.permissions || []).length, render: (row) => <span className="text-slate-700">{(row.permissions || []).length}</span> },
    { key: 'isSystem', label: 'System', sortable: true, render: (row) => (
      row.isSystem 
        ? <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">Yes</span>
        : <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">No</span>
    )},
    { key: 'isActive', label: 'Status', sortable: true, render: (row) => (
      row.isActive !== false
        ? <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">Yes</span>
        : <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700">No</span>
    )},
    { key: 'actions', label: 'Actions', sortable: false, align: 'right', render: (row) => (
      <div className="flex justify-end gap-1">
        <button type="button" onClick={() => openEdit(row)} className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600">
          <Edit2 size={16} />
        </button>
        <button type="button" onClick={() => setDeleteTarget(row)} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
          <Trash2 size={16} />
        </button>
      </div>
    ) }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Roles & Permissions</h1>
          <p className="mt-1 text-sm text-slate-500">Map permissions to roles and keep access control aligned with your backend RBAC rules.</p>
        </div>
        {canEdit ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Role
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Roles', subLabel: 'All role groups', value: stats.total, icon: ShieldCheck, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Active', subLabel: 'Enabled roles', value: stats.active, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'System', subLabel: 'Built-in roles', value: stats.system, icon: Shield, color: 'text-purple-500', bg: 'bg-purple-50' },
          { label: 'Assignments', subLabel: 'Total permission links', value: stats.assignments, icon: Users, color: 'text-amber-500', bg: 'bg-amber-50' }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4 rounded-2xl">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${item.bg} ${item.color}`}>
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-bold text-slate-900">{loading ? '...' : item.value}</p>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{item.subLabel}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="border border-slate-200 bg-white shadow-sm p-4 rounded-2xl">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading roles...</div>
        ) : (
          <Table 
            columns={columns} 
            data={rows} 
            defaultRowsPerPage={10} 
            emptyMessage="No roles found." 
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search roles..."
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Role"
        description={`Delete ${deleteTarget?.name || deleteTarget?.code || 'this role'}? System roles cannot be deleted.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

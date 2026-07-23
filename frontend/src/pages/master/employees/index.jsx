import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Eye, Users, UserCheck, User, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { Table } from '../../../components/ui/Table';
import {
  buildEmployeePayload,
  buildNextEmployeeCode,
  createEmptyEmployeeDraft,
  createEmployeeDraftFromRecord,
  formatBranchLabel,
  formatEmployeePhone,
  getBranchMap,
  prepareEmployeeAvatarFile
} from './employeeUtils';
import { uploadDocumentMap } from '../documentUpload';
import { EmployeeForm } from './form';

function getEmployeeStatus(user) {
  if (!user) return 'Active';
  if (typeof user.status === 'string' && user.status.trim()) {
    return user.status;
  }
  return user.isActive === false ? 'Inactive' : 'Active';
}

function isEmployeeActive(user) {
  return getEmployeeStatus(user).toLowerCase() !== 'inactive';
}

function UserForm(props) {
  return <EmployeeForm {...props} />;
}

export function EmployeesPage() {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyEmployeeDraft());
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarCleared, setAvatarCleared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const branchLookup = useMemo(() => getBranchMap(branches), [branches]);

  const canManage = hasPermission('employees.write', 'users.manage');

  useEffect(() => {
    return () => {
      if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.roles.list(token),
      api.resources.list('/banking/masters/branches', token)
    ])
      .then(([rolesRes, branchesRes]) => {
        if (!mounted) return;
        setRoles(rolesRes.data || []);
        setBranches(branchesRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load employee lookups');
      })
      .finally(() => {
        if (mounted) setLookupsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    let mounted = true;
    api.users.list(token, search)
      .then((usersRes) => {
        if (!mounted) return;
        setRows((usersRes.data || []).filter((user) => user.email !== 'admin@bank.local'));
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load employees');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [search, token]);

  function openCreate() {
    navigate('/app/master/employees/new');
  }

  function openEdit(user) {
    if (!user?.id) return;
    navigate(`/app/master/employees/${user.id}/edit`);
  }

  function handleAvatarClear() {
    if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview('');
    setAvatarCleared(true);
  }

  function handleDocumentRemove(key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const basePayload = {
        ...buildEmployeePayload(draft)
      };
      delete basePayload.documents;

      let response;
      const baseResponse = activeRecord
        ? await api.users.update(token, activeRecord.id, basePayload)
        : await api.users.create(token, basePayload);
      const savedRecord = baseResponse.data || {};
      const entityId = savedRecord.id || activeRecord?.id;
      const folderId = savedRecord.documentsFolderId || null;

      let avatarPayload = {};
      if (avatarFile) {
        const uploadData = new FormData();
        uploadData.append('file', avatarFile);
        uploadData.append('moduleName', 'users');
        if (entityId) uploadData.append('entityId', entityId);
        if (folderId) uploadData.append('folderId', folderId);
        const uploadResponse = await api.files.upload(token, uploadData);
        const uploaded = uploadResponse.data?.[0] || uploadResponse.data;
        if (!uploaded) {
          throw new Error('Avatar upload failed');
        }
        avatarPayload = {
          avatarUrl: uploaded.viewUrl,
          avatarFileId: uploaded.id
        };
      } else if (avatarCleared) {
        avatarPayload = {
          avatarUrl: '',
          avatarFileId: null
        };
      }

      const documents = await uploadDocumentMap(token, draft.documents || {}, {
        moduleName: 'employees',
        entityId,
        folderId
      });

      const finalPayload = {};
      if (Object.keys(avatarPayload).length > 0) {
        Object.assign(finalPayload, avatarPayload);
      }
      if (Object.keys(documents).length > 0) {
        finalPayload.documents = documents;
      }
      if (Object.keys(finalPayload).length > 0) {
        response = await api.users.update(token, entityId, finalPayload);
      } else {
        response = baseResponse;
      }

      if (removedDocumentIds.length) {
        await Promise.allSettled(removedDocumentIds.map((fileId) => api.files.remove(token, fileId)));
      }

      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === response.data.id ? response.data : item))
          : [response.data, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Employee updated' : 'Employee created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save employee');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.users.remove(token, deleteTarget.id);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Employee deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete employee');
    } finally {
      setDeleteTarget(null);
    }
  }

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => isEmployeeActive(row)).length,
    assigned: rows.filter((row) => (row.roles || []).length > 0).length,
    inactive: rows.filter((row) => !isEmployeeActive(row)).length
  }), [rows]);

  const columns = [
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="text-slate-700">{row.code || '-'}</span> },
    {
      key: 'name',
      label: 'Employee',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <UserAvatar name={row.fullName || row.name} url={row.avatarUrl} gender={row.gender} className="h-8 w-8" fallbackSize={12} />
          <span className="font-medium text-slate-900">{row.fullName || row.name || '-'}</span>
        </div>
      )
    },
    { key: 'designation', label: 'Designation', sortable: true, render: (row) => <span className="text-slate-700">{row.designation || '-'}</span> },
    { key: 'mobileNo', label: 'Mobile No', sortable: true, render: (row) => <span className="text-slate-700">{formatEmployeePhone(row.mobileNo || row.phone || '') || '-'}</span> },
    { key: 'username', label: 'Login Username', sortable: true, render: (row) => <span className="text-slate-700">{row.username}</span> },
    {
      key: 'branchCode',
      label: 'Branch',
      sortable: true,
      render: (row) => {
        const branch = branchLookup.get(String(row.branchCode || '').trim().toUpperCase());
        return <span className="text-slate-700">{formatBranchLabel(branch) || row.branchCode || '-'}</span>;
      }
    },
    { key: 'roles', label: 'Roles', sortable: true, sortValue: (row) => (row.roles || []).map((r) => r.name).join(', '), render: (row) => <span className="text-slate-700">{(row.roles || []).map((r) => r.name).join(', ') || '-'}</span> },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (row) => getEmployeeStatus(row),
      render: (row) => (
        isEmployeeActive(row)
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
          <button
            type="button"
            onClick={() => navigate(`/app/master/employees/${row.id}`)}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
            title="View"
          >
            <Eye size={16} />
          </button>
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => openEdit(row)}
                className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                title="Edit"
              >
                <Edit2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(row)}
                className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Delete"
              >
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Employees</h1>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Employee
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Employees', subLabel: 'All staff accounts', value: stats.total, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Active', subLabel: 'Enabled logins', value: stats.active, icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Role Assigned', subLabel: 'Employees mapped to roles', value: stats.assigned, icon: User, color: 'text-purple-500', bg: 'bg-purple-50' },
          { label: 'Inactive', subLabel: 'Disabled employees', value: stats.inactive, icon: UserX, color: 'text-rose-500', bg: 'bg-rose-50' }
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
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading employees...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No employees found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search employees..."
          />
        )}
      </Card>


      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete employee"
        description={`Delete ${deleteTarget?.fullName || deleteTarget?.name || 'this employee'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default EmployeesPage;

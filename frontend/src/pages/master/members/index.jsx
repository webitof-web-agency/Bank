import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Eye, Users, UserCheck, UserX, Building2 } from 'lucide-react';
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
import { MemberForm } from './form';
import {
  buildNextMemberCode,
  buildNextMembershipNo,
  createEmptyMemberDraft,
  createMemberDraftFromRecord,
  buildMemberPayload,
  formatBranchLabel,
  formatMemberPhone,
  getBranchMap,
  formatMoney
} from './memberUtils';
import { uploadDocumentMap } from '../documentUpload';

function getMemberStatus(member) {
  if (!member) return 'Active';
  if (typeof member.status === 'string' && member.status.trim()) {
    return member.status;
  }
  return 'Active';
}

function isMemberActive(member) {
  const status = String(getMemberStatus(member)).toLowerCase();
  return status !== 'inactive' && status !== 'exited';
}

export function MembersPage() {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyMemberDraft());
  const [saving, setSaving] = useState(false);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const branchLookup = useMemo(() => getBranchMap(branches), [branches]);

  const canManage = hasPermission('members.write');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.resources.list('/banking/masters/branches', token),
      api.resources.list('/banking/masters/members', token, search)
    ])
      .then(([branchesRes, membersRes]) => {
        if (!mounted) return;
        setBranches(branchesRes.data || []);
        setRows(membersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load members');
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
    navigate('/app/master/members/new');
  }

  function openEdit(member) {
    navigate(`/app/master/members/${member.id}/edit`);
  }

  function handleDocumentRemove(key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
  }

  async function saveMember(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildMemberPayload(draft);
      let response;

      delete payload.documents;

      const baseResponse = activeRecord
        ? await api.resources.update('/banking/masters/members', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/members', payload, token);
      const savedRecord = baseResponse.data || {};
      const entityId = savedRecord.id || activeRecord?.id;
      const folderId = savedRecord.documentsFolderId || null;

      let avatarPayload = {};
      if (draft.photoFileId || draft.photoUrl) {
        avatarPayload = {
          photoUrl: draft.photoUrl || '',
          photoFileId: draft.photoFileId || null
        };
      }

      const documents = await uploadDocumentMap(token, draft.documents || {}, {
        moduleName: 'members',
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
        response = await api.resources.update('/banking/masters/members', entityId, finalPayload, token);
      } else {
        response = baseResponse;
      }

      if (removedDocumentIds.length) {
        await Promise.allSettled(removedDocumentIds.map((fileId) => api.files.remove(token, fileId)));
      }

      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Member updated' : 'Member created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save member');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/members', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Member deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete member');
    } finally {
      setDeleteTarget(null);
    }
  }

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => isMemberActive(row)).length,
    inactive: rows.filter((row) => String(getMemberStatus(row)).toLowerCase() === 'inactive').length,
    exited: rows.filter((row) => String(getMemberStatus(row)).toLowerCase() === 'exited').length
  }), [rows]);

  const columns = [
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="text-slate-700">{row.code || '-'}</span> },
    {
      key: 'name',
      label: 'Member',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <UserAvatar name={row.name} url={row.photoUrl} className="h-8 w-8" fallbackSize={12} />
          <span className="font-medium text-slate-900">{row.name || '-'}</span>
        </div>
      )
    },
    {
      key: 'branchCode',
      label: 'Branch',
      sortable: true,
      render: (row) => {
        const branch = branchLookup.get(String(row.branchCode || '').trim().toUpperCase());
        return <span className="text-slate-700">{formatBranchLabel(branch) || row.branchCode || '-'}</span>;
      }
    },
    { key: 'membershipNo', label: 'Membership No', sortable: true, render: (row) => <span className="text-slate-700">{row.membershipNo || '-'}</span> },
    { key: 'mobileNo', label: 'Mobile No', sortable: true, render: (row) => <span className="text-slate-700">{formatMemberPhone(row.mobileNo || '') || '-'}</span> },
    { key: 'depositBalance', label: 'Deposit', sortable: true, render: (row) => <span className="text-slate-700">{formatMoney(row.depositBalance ?? row.balances?.compulsoryDeposit ?? 0)}</span> },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (row) => getMemberStatus(row),
      render: (row) => {
        const status = String(getMemberStatus(row)).toLowerCase();
        if (status === 'inactive') {
          return <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700">Inactive</span>;
        }
        if (status === 'exited') {
          return <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">Exited</span>;
        }
        return <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">Active</span>;
      }
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
            onClick={() => navigate(`/app/master/members/${row.id}`)}
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Members</h1>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Member
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Members', subLabel: 'All accounts', value: stats.total, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Active', subLabel: 'Enabled members', value: stats.active, icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Inactive', subLabel: 'Inactive records', value: stats.inactive, icon: UserX, color: 'text-rose-500', bg: 'bg-rose-50' },
          { label: 'Exited', subLabel: 'Closed members', value: stats.exited, icon: Building2, color: 'text-amber-500', bg: 'bg-amber-50' }
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
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading members...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No members found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search members..."
          />
        )}
      </Card>



      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete member"
        description={`Delete ${deleteTarget?.name || deleteTarget?.code || 'this member'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default MembersPage;

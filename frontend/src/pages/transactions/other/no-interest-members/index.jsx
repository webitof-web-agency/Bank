import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Edit2, Eye, Plus, Trash2, UserRound, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../api/api';
import { useAuth } from '../../../../context/AuthContext';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Modal } from '../../../../components/ui/Modal';
import { ConfirmDialog } from '../../../../components/overlays/ConfirmDialog';
import { Table } from '../../../../components/ui/Table';
import { NoInterestMemberForm } from './form';
import { buildNoInterestMemberPayload, createEmptyNoInterestMemberDraft, createNoInterestMemberDraftFromRecord, getMemberLabel } from './noInterestMemberUtils';

function isActive(record) {
  return String(record?.status || 'Active').toLowerCase() !== 'inactive';
}

export function NoInterestMembersPage({ basePath = '/app/master/no-interest-members' } = {}) {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyNoInterestMemberDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = hasPermission('no-interest-members.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLookupsLoading(true);

    Promise.all([
      api.resources.list('/banking/masters/no-interest-members', token, search),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([recordsRes, membersRes]) => {
        if (!mounted) return;
        setRows(recordsRes.data || []);
        setMembers(membersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load no-interest members');
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
    setDraft(createEmptyNoInterestMemberDraft(rows));
    setEditorOpen(true);
  }

  function openEdit(record) {
    setActiveRecord(record);
    setDraft(createNoInterestMemberDraftFromRecord(record));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyNoInterestMemberDraft(rows));
  }

  async function saveRecord(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildNoInterestMemberPayload(draft);
      const response = activeRecord
        ? await api.resources.update('/banking/masters/no-interest-members', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/no-interest-members', payload, token);

      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Record updated' : 'Record created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save record');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/no-interest-members', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Record deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete record');
    } finally {
      setDeleteTarget(null);
    }
  }

  const memberLookup = useMemo(() => new Map(members.map((member) => [String(member.code || '').toUpperCase(), member])), [members]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => isActive(row)).length,
    inactive: rows.filter((row) => !isActive(row)).length,
    linked: rows.filter((row) => String(row.memberCode || '').trim()).length
  }), [rows]);

  const columns = [
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.code || '-'}</span> },
    {
      key: 'memberCode',
      label: 'Member',
      sortable: true,
      render: (row) => {
        const member = memberLookup.get(String(row.memberCode || '').trim().toUpperCase());
        return <span className="text-slate-700">{getMemberLabel(member) || row.memberCode || '-'}</span>;
      }
    },
    { key: 'reason', label: 'Reason', sortable: true, render: (row) => <span className="text-slate-700">{row.reason || '-'}</span> },
    { key: 'fromDate', label: 'From Date', sortable: true, render: (row) => <span className="text-slate-700">{row.fromDate || '-'}</span> },
    { key: 'toDate', label: 'To Date', sortable: true, render: (row) => <span className="text-slate-700">{row.toDate || '-'}</span> },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        isActive(row)
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
          <button type="button" onClick={() => navigate(`/app/master/no-interest-members/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View">
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">No Interest Members</h1>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Record
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Records', value: stats.total, icon: Ban, color: 'text-blue-500', bg: 'bg-blue-50', subLabel: 'All no-interest rows' },
          { label: 'Active', value: stats.active, icon: AlertCircle, color: 'text-emerald-500', bg: 'bg-emerald-50', subLabel: 'Active exclusions' },
          { label: 'Inactive', value: stats.inactive, icon: UserRound, color: 'text-rose-500', bg: 'bg-rose-50', subLabel: 'Disabled records' },
          { label: 'Linked Members', value: stats.linked, icon: Calendar, color: 'text-purple-500', bg: 'bg-purple-50', subLabel: 'Member mappings' }
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
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading records...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No no-interest member records found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search members..."
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Record' : 'Add Record'}
        onClose={closeEditor}
        width="min(980px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="no-interest-member-form" disabled={saving || lookupsLoading} className="bg-[var(--primary,#1661F6)] hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] text-white shadow-sm rounded-[var(--radius-input,0.75rem)] px-6 border-none">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Record')}
            </Button>
          </div>
        }
      >
        <NoInterestMemberForm
          value={draft}
          setValue={setDraft}
          onSubmit={saveRecord}
          members={members}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete record"
        description={`Delete ${deleteTarget?.code || deleteTarget?.memberCode || 'this record'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default NoInterestMembersPage;



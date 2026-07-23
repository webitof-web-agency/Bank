import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Edit2, Eye, Landmark, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { LedgerForm } from './form';
import { buildLedgerPayload, createEmptyLedgerDraft, createLedgerDraftFromRecord, formatMoney } from './ledgerUtils';

function getLedgerNature(ledger) {
  return String(ledger?.nature || 'ASSET').toUpperCase();
}

function isLedgerActive(ledger) {
  return ledger?.isActive !== false;
}

export function LedgersPage() {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyLedgerDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = hasPermission('ledgers.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    api.resources.list('/banking/masters/ledgers', token, search)
      .then((response) => {
        if (!mounted) return;
        setRows(response.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load ledgers');
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
    setDraft(createEmptyLedgerDraft(rows));
    setEditorOpen(true);
  }

  function openEdit(ledger) {
    setActiveRecord(ledger);
    setDraft(createLedgerDraftFromRecord(ledger));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyLedgerDraft(rows));
  }

  async function saveLedger(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildLedgerPayload(draft);
      const response = activeRecord
        ? await api.resources.update('/banking/masters/ledgers', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/ledgers', payload, token);

      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Ledger updated' : 'Ledger created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save ledger');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/ledgers', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Ledger deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete ledger');
    } finally {
      setDeleteTarget(null);
    }
  }

  const stats = useMemo(() => {
    const active = rows.filter((row) => isLedgerActive(row)).length;
    const asset = rows.filter((row) => getLedgerNature(row) === 'ASSET').length;
    const liability = rows.filter((row) => getLedgerNature(row) === 'LIABILITY').length;
    const bankAccounts = rows.filter((row) => row.isBankAccount).length;

    return { total: rows.length, active, asset, liability, bankAccounts };
  }, [rows]);

  const columns = [
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.code || '-'}</span> },
    { key: 'name', label: 'Ledger Name', sortable: true, render: (row) => <span className="text-slate-700">{row.name || '-'}</span> },
    { key: 'nature', label: 'Nature', sortable: true, render: (row) => <span className="text-slate-700">{getLedgerNature(row)}</span> },
    { key: 'group', label: 'Group', sortable: true, render: (row) => <span className="text-slate-700">{row.group || '-'}</span> },
    { key: 'openingBalance', label: 'Opening Balance', sortable: true, render: (row) => <span className="text-slate-700">{formatMoney(row.openingBalance ?? 0)}</span> },
    {
      key: 'balanceSide',
      label: 'Side',
      sortable: true,
      render: (row) => <span className="text-slate-700">{String(row.balanceSide || 'DR').toUpperCase()}</span>
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        isLedgerActive(row)
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
          <button type="button" onClick={() => navigate(`/app/master/ledgers/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View">
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Ledgers</h1>
          <p className="mt-1 text-sm text-slate-500">Create ledger masters, control nature and balances, and keep accounting heads aligned.</p>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Ledger
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Ledgers', value: stats.total, icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50', subLabel: 'All accounting heads' },
          { label: 'Active', value: stats.active, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50', subLabel: 'Enabled ledgers' },
          { label: 'Assets', value: stats.asset, icon: Landmark, color: 'text-purple-500', bg: 'bg-purple-50', subLabel: 'Asset nature ledgers' },
          { label: 'Liabilities', value: stats.liability, icon: TrendingDown, color: 'text-amber-500', bg: 'bg-amber-50', subLabel: 'Liability nature ledgers' }
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
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading ledgers...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No ledgers found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search ledgers..."
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Ledger' : 'Add Ledger'}
        subtitle="Maintain ledger code, nature, group, and opening balance."
        onClose={closeEditor}
        width="min(960px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="ledger-form" disabled={saving} className="bg-[#3b79f6] hover:bg-blue-700 text-white shadow-sm rounded-lg px-6">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Ledger')}
            </Button>
          </div>
        }
      >
        <LedgerForm
          value={draft}
          setValue={setDraft}
          onSubmit={saveLedger}
          isEdit={Boolean(activeRecord)}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete ledger"
        description={`Delete ${deleteTarget?.name || deleteTarget?.code || 'this ledger'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default LedgersPage;


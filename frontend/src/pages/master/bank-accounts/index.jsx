import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Eye, Landmark, Plus, Trash2, Building2, Wallet, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { BankAccountForm } from './form';
import { buildBankAccountPayload, createBankAccountDraftFromRecord, createEmptyBankAccountDraft, formatMoney, getLedgerLabel } from './bankAccountUtils';

function isActiveAccount(account) {
  return String(account?.status || 'Active').toLowerCase() !== 'inactive';
}

export function BankAccountsPage() {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyBankAccountDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = hasPermission('bank-accounts.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLookupsLoading(true);

    Promise.all([
      api.resources.list('/banking/masters/bank-accounts', token, search),
      api.resources.list('/banking/masters/ledgers', token)
    ])
      .then(([accountsRes, ledgersRes]) => {
        if (!mounted) return;
        setRows(accountsRes.data || []);
        setLedgers(ledgersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load bank accounts');
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
    setDraft(createEmptyBankAccountDraft(rows));
    setEditorOpen(true);
  }

  function openEdit(account) {
    setActiveRecord(account);
    setDraft(createBankAccountDraftFromRecord(account));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyBankAccountDraft(rows));
  }

  async function saveAccount(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildBankAccountPayload(draft);
      const response = activeRecord
        ? await api.resources.update('/banking/masters/bank-accounts', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/bank-accounts', payload, token);

      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Bank account updated' : 'Bank account created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save bank account');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/bank-accounts', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Bank account deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete bank account');
    } finally {
      setDeleteTarget(null);
    }
  }

  const ledgerLookup = useMemo(() => new Map(ledgers.map((ledger) => [String(ledger.code || '').toUpperCase(), ledger])), [ledgers]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => isActiveAccount(row)).length,
    primary: rows.filter((row) => row.isPrimary).length,
    linked: rows.filter((row) => String(row.linkedLedgerCode || '').trim()).length
  }), [rows]);

  const columns = [
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.code || '-'}</span> },
    { key: 'bankName', label: 'Bank Name', sortable: true, render: (row) => <span className="text-slate-700">{row.bankName || '-'}</span> },
    { key: 'accountNumber', label: 'Account No.', sortable: true, render: (row) => <span className="text-slate-700">{row.accountNumber || '-'}</span> },
    { key: 'branch', label: 'Branch', sortable: true, render: (row) => <span className="text-slate-700">{row.branch || '-'}</span> },
    { key: 'linkedLedgerCode', label: 'Linked Ledger', sortable: true, render: (row) => {
      const ledger = ledgerLookup.get(String(row.linkedLedgerCode || '').trim().toUpperCase());
      return <span className="text-slate-700">{getLedgerLabel(ledger) || row.linkedLedgerCode || '-'}</span>;
    } },
    { key: 'currentBalance', label: 'Current Balance', sortable: true, render: (row) => <span className="text-slate-700">{formatMoney(row.currentBalance ?? row.openingBalance ?? 0)}</span> },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        isActiveAccount(row)
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
          <button type="button" onClick={() => navigate(`/app/master/bank-accounts/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View">
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Bank Accounts</h1>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Bank Account
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Accounts', value: stats.total, icon: Building2, color: 'text-blue-500', bg: 'bg-blue-50', subLabel: 'All bank records' },
          { label: 'Active', value: stats.active, icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-50', subLabel: 'Enabled accounts' },
          { label: 'Primary', value: stats.primary, icon: CreditCard, color: 'text-purple-500', bg: 'bg-purple-50', subLabel: 'Primary account flags' },
          { label: 'Linked Ledgers', value: stats.linked, icon: Landmark, color: 'text-amber-500', bg: 'bg-amber-50', subLabel: 'Accounts tied to ledgers' }
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
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading bank accounts...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No bank accounts found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search bank accounts..."
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Bank Account' : 'Add Bank Account'}
        onClose={closeEditor}
        width="min(1080px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="bank-account-form" disabled={saving || lookupsLoading} className="bg-[var(--primary,#1661F6)] hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] text-white shadow-sm rounded-[var(--radius-input,0.75rem)] px-6 border-none">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Bank Account')}
            </Button>
          </div>
        }
      >
        <BankAccountForm
          value={draft}
          setValue={setDraft}
          onSubmit={saveAccount}
          ledgers={ledgers}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete bank account"
        description={`Delete ${deleteTarget?.bankName || deleteTarget?.code || 'this bank account'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default BankAccountsPage;


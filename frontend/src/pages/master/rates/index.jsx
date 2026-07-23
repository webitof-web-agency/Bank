import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Eye, Percent, Plus, Trash2, TrendingUp, Clock3, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { RateForm } from './form';
import { buildRatePayload, createEmptyRateDraft, createRateDraftFromRecord, formatMoney, getLedgerLabel } from './rateUtils';

function getRateValue(rate) {
  const num = Number(rate?.value);
  return Number.isFinite(num) ? num : 0;
}

export function RatesPage() {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyRateDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = hasPermission('rates.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLookupsLoading(true);

    Promise.all([
      api.resources.list('/banking/masters/rates', token, search),
      api.resources.list('/banking/masters/ledgers', token)
    ])
      .then(([ratesRes, ledgersRes]) => {
        if (!mounted) return;
        setRows(ratesRes.data || []);
        setLedgers(ledgersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load rates');
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
    setDraft(createEmptyRateDraft(rows));
    setEditorOpen(true);
  }

  function openEdit(rate) {
    setActiveRecord(rate);
    setDraft(createRateDraftFromRecord(rate));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyRateDraft(rows));
  }

  async function saveRate(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildRatePayload(draft);
      const response = activeRecord
        ? await api.resources.update('/banking/masters/rates', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/rates', payload, token);

      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Rate updated' : 'Rate created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save rate');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/rates', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Rate deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete rate');
    } finally {
      setDeleteTarget(null);
    }
  }

  const ledgerLookup = useMemo(() => new Map(ledgers.map((ledger) => [String(ledger.code || '').toUpperCase(), ledger])), [ledgers]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.length,
    average: rows.length ? rows.reduce((sum, rate) => sum + getRateValue(rate), 0) / rows.length : 0,
    ledgers: new Set(rows.map((rate) => String(rate.ledgerCode || '').toUpperCase()).filter(Boolean)).size
  }), [rows]);

  const columns = [
    { key: 'code', label: 'Code', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.code || '-'}</span> },
    {
      key: 'ledgerCode',
      label: 'Ledger',
      sortable: true,
      render: (row) => {
        const ledger = ledgerLookup.get(String(row.ledgerCode || '').trim().toUpperCase());
        return <span className="text-slate-700">{getLedgerLabel(ledger) || row.ledgerCode || '-'}</span>;
      }
    },
    { key: 'category', label: 'Category', sortable: true, render: (row) => <span className="text-slate-700">{row.category || '-'}</span> },
    { key: 'value', label: 'Value', sortable: true, render: (row) => <span className="text-slate-700">{formatMoney(row.value ?? 0)}</span> },
    { key: 'effectiveFrom', label: 'Effective From', sortable: true, render: (row) => <span className="text-slate-700">{row.effectiveFrom || '-'}</span> },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <button type="button" onClick={() => navigate(`/app/master/rates/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View">
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Rates</h1>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            Add Rate
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total Rates', value: stats.total, icon: Percent, color: 'text-blue-500', bg: 'bg-blue-50', subLabel: 'All rate records' },
          { label: 'Linked Ledgers', value: stats.ledgers, icon: BookOpen, color: 'text-emerald-500', bg: 'bg-emerald-50', subLabel: 'Unique linked ledgers' },
          { label: 'Average Rate', value: stats.average.toFixed(2), icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50', subLabel: 'Average percentage' },
          { label: 'Effective', value: stats.active, icon: Clock3, color: 'text-amber-500', bg: 'bg-amber-50', subLabel: 'Configured entries' }
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
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading rates...</div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            defaultRowsPerPage={10}
            emptyMessage="No rates found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search rates..."
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Rate' : 'Add Rate'}
        onClose={closeEditor}
        width="min(980px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="rate-form" disabled={saving || lookupsLoading} className="bg-[var(--primary,#1661F6)] hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] text-white shadow-sm rounded-[var(--radius-input,0.75rem)] px-6 border-none">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Rate')}
            </Button>
          </div>
        }
      >
        <RateForm
          value={draft}
          setValue={setDraft}
          onSubmit={saveRate}
          ledgers={ledgers}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete rate"
        description={`Delete ${deleteTarget?.code || deleteTarget?.ledgerName || 'this rate'}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default RatesPage;


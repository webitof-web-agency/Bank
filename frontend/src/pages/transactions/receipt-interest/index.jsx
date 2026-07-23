import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Edit2, Plus, Trash2, RotateCcw, ArrowRight, Sparkles, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { useAuth } from '../../../context/AuthContext';
import { uploadDocumentMap } from '../../master/documentUpload';
import { ReceiptInterestTransactionForm } from './form';
import {
  buildTransactionVoucherPayload,
  createEmptyTransactionDraft,
  createTransactionDraftFromRecord,
  filterTransactionRows,
  formatTransactionAmount,
  getSectionItems,
  getTransactionLedgerLabel,
  getTransactionPartyLabel,
  getTransactionVoucherTitle
} from './transactionUtils';
import { toneClassName } from './transactionUtils';

function getStatusBadge(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'posted') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'reversed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'draft') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function ReceiptInterestTransactionsPage({ sectionKey, detailPathBase }) {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState({});
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyTransactionDraft(sectionKey, []));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reverseTarget, setReverseTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPartyType, setFilterPartyType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);

  const section = useMemo(() => catalog.find((item) => item.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => getSectionItems(catalog, sectionKey), [catalog, sectionKey]);
  const visibleRows = useMemo(() => {
    const baseRows = filterTransactionRows(rows, sectionItems);
    const searchValue = String(search || '').trim().toLowerCase();

    return baseRows.filter((row) => {
      const matchesSearch = !searchValue || [
        row.voucherNo,
        row.voucherCategory,
        row.partyCode,
        row.narration,
        row.referenceNo,
        row.instrumentNo
      ].some((value) => String(value || '').toLowerCase().includes(searchValue));
      const matchesStatus = !filterStatus || String(row.status || '').toLowerCase() === String(filterStatus || '').toLowerCase();
      const matchesPartyType = !filterPartyType || String(row.partyType || '').toLowerCase() === String(filterPartyType || '').toLowerCase();
      const matchesFrom = !filterDateFrom || String(row.date || '') >= filterDateFrom;
      const matchesTo = !filterDateTo || String(row.date || '') <= filterDateTo;
      return matchesSearch && matchesStatus && matchesPartyType && matchesFrom && matchesTo;
    });
  }, [rows, sectionItems, search, filterStatus, filterPartyType, filterDateFrom, filterDateTo]);
  const canWrite = hasPermission('transactions.write');
  const canReverse = hasPermission('transactions.reverse');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      api.banking.getTransactionCatalog(token),
      api.banking.listTransactionVouchers(token),
      api.banking.getLookups(token)
    ])
      .then(([catalogRes, rowsRes, lookupsRes]) => {
        if (!mounted) return;
        setCatalog(Array.isArray(catalogRes.data) ? catalogRes.data : []);
        setRows(Array.isArray(rowsRes.data) ? rowsRes.data : []);
        setLookups(lookupsRes.data || {});
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load transactions');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  function openCreate(itemKey) {
    const item = sectionItems.find((entry) => entry.key === itemKey) || sectionItems[0] || null;
    setActiveRecord(null);
    setDraft(() => {
      const next = createEmptyTransactionDraft(sectionKey, sectionItems);
      return {
        ...next,
        voucherCategory: item?.label || next.voucherCategory,
        transactionType: item?.transactionType || next.transactionType,
        accent: item?.accent || next.accent,
        mode: item?.mode || next.mode,
        details: { ...(next.details || {}), key: item?.key || next.details?.key || '' },
        documents: next.documents || {}
      };
    });
    setEditorOpen(true);
  }

  function openEdit(record) {
    setActiveRecord(record);
    setDraft(createTransactionDraftFromRecord(record, sectionItems, sectionKey));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyTransactionDraft(sectionKey, sectionItems));
    setRemovedDocumentIds([]);
  }

  function handleDocumentRemove(key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
  }

  function exportCsv() {
    const headers = ['Voucher No', 'Date', 'Category', 'Party', 'Amount', 'Status', 'Narration'];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.map(escape).join(','),
      ...visibleRows.map((row) => ([
        row.voucherNo,
        row.date,
        row.voucherCategory,
        getTransactionPartyLabel(row.partyCode, lookups, row.partyType),
        row.amount ?? 0,
        row.status || 'Draft',
        row.narration || ''
      ].map(escape).join(',')))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sectionKey || 'transactions'}-export.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function persistVoucherDocuments(nextRecord, currentDraft = draft) {
    if (!nextRecord?.id) return nextRecord;

    const uploadedDocuments = await uploadDocumentMap(token, currentDraft.documents || {}, {
      moduleName: 'transactions',
      entityId: nextRecord.id
    });

    if (Object.keys(uploadedDocuments).length || removedDocumentIds.length) {
      const response = await api.banking.updateTransactionVoucher(token, nextRecord.id, {
        documents: uploadedDocuments
      });
      nextRecord = response.data || response;
    }

    if (removedDocumentIds.length > 0) {
      await Promise.allSettled(removedDocumentIds.map((fileId) => api.files.remove(token, fileId)));
    }

    return nextRecord;
  }

  async function saveVoucher(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildTransactionVoucherPayload(draft);
      const response = activeRecord
        ? await api.banking.updateTransactionVoucher(token, activeRecord.id, payload)
        : await api.banking.createTransactionVoucher(token, payload);

      let nextRecord = response.data || response;
      nextRecord = await persistVoucherDocuments(nextRecord, draft);
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Transaction updated' : 'Transaction created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save transaction');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.banking.deleteTransactionVoucher(token, deleteTarget.id);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Transaction deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete transaction');
    } finally {
      setDeleteTarget(null);
    }
  }

  async function confirmReverse() {
    if (!reverseTarget) return;
    try {
      const response = await api.banking.reverseTransactionVoucher(token, reverseTarget.id);
      const nextRecord = response.data || response;
      setRows((current) => [nextRecord, ...current.map((item) => (item.id === nextRecord.id ? nextRecord : item))]);
      toast.success('Transaction reversed');
    } catch (error) {
      toast.error(error.message || 'Unable to reverse transaction');
    } finally {
      setReverseTarget(null);
    }
  }

  const stats = useMemo(() => ({
    total: visibleRows.length,
    posted: visibleRows.filter((row) => String(row.status || '').toLowerCase() === 'posted').length,
    draft: visibleRows.filter((row) => String(row.status || '').toLowerCase() === 'draft').length,
    amount: visibleRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  }), [visibleRows]);

  const linkedItems = useMemo(() => (sectionItems || []).filter((item) => item.route), [sectionItems]);
  const editableItems = useMemo(() => (sectionItems || []).filter((item) => !item.route), [sectionItems]);

  const columns = [
    {
      key: 'voucherNo',
      label: 'Voucher No',
      sortable: true,
      render: (row) => <span className="font-medium text-slate-900">{row.voucherNo || '-'}</span>
    },
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      render: (row) => <span className="text-slate-700">{row.date || '-'}</span>
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      sortValue: (row) => getTransactionVoucherTitle(row, sectionItems),
      render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, sectionItems)}</span>
    },
    {
      key: 'party',
      label: 'Party',
      sortable: true,
      sortValue: (row) => getTransactionPartyLabel(row.partyCode, lookups, row.partyType),
      render: (row) => <span className="text-slate-700">{getTransactionPartyLabel(row.partyCode, lookups, row.partyType)}</span>
    },
    {
      key: 'settlement',
      label: 'Settlement',
      sortable: true,
      sortValue: (row) => getTransactionLedgerLabel(row.details?.settlementAccount || row.details?.ledgerTarget || row.details?.depositIn || row.details?.fromAccount || '', lookups),
      render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.settlementAccount || row.details?.ledgerTarget || row.details?.depositIn || row.details?.fromAccount || '', lookups)}</span>
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span>
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getStatusBadge(row.status)}`}>
          {row.status || 'Draft'}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <button type="button" onClick={() => navigate(`${detailPathBase}/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View">
            <Eye size={16} />
          </button>
          {canWrite ? (
            <>
              <button type="button" onClick={() => openEdit(row)} className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                <Edit2 size={16} />
              </button>
              <button type="button" onClick={() => setDeleteTarget(row)} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                <Trash2 size={16} />
              </button>
            </>
          ) : null}
          {canReverse && String(row.status || '').toLowerCase() === 'posted' ? (
            <button type="button" onClick={() => setReverseTarget(row)} className="rounded-full p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Reverse">
              <RotateCcw size={16} />
            </button>
          ) : null}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
            <button type="button" onClick={() => navigate('/app/transactions/overview')} className="inline-flex items-center gap-1.5 hover:text-slate-900">
              <ArrowRight size={14} className="rotate-180" />
              Transactions
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900">{section?.label || sectionKey}</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{section?.label || sectionKey} Transactions</h1>
          <p className="mt-1 text-sm text-slate-500">{section?.description || 'Transaction vouchers for this group.'}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => window.print()}>
            Print
          </Button>
          {editableItems.map((item) => (
            <Button key={item.key} onClick={() => openCreate(item.key)} className="gap-2">
              <Plus size={16} />
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${toneClassName(section?.tone || 'slate')}`}>
            {section?.label || 'Transactions'}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">{stats.total}</h2>
          <p className="mt-1 text-sm text-slate-500">Voucher records loaded in this section.</p>
        </Card>
        <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Posted</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">{stats.posted}</h2>
          <p className="mt-1 text-sm text-slate-500">Posted and active entries.</p>
        </Card>
        <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Amount</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">{formatTransactionAmount(stats.amount)}</h2>
          <p className="mt-1 text-sm text-slate-500">Total voucher amount for the filtered section.</p>
        </Card>
      </div>

      {linkedItems.length ? (
        <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-700">
            <Sparkles size={16} className="text-blue-500" />
            <h3 className="text-base font-semibold text-slate-900">Linked Master Pages</h3>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {linkedItems.map((item) => (
              <button key={item.key} type="button" onClick={() => navigate(item.route)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                <Link2 size={14} />
                {item.label}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-slate-600">Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All</option>
              <option value="Draft">Draft</option>
              <option value="Posted">Posted</option>
              <option value="Reversed">Reversed</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-slate-600">Party Type</label>
            <select value={filterPartyType} onChange={(e) => setFilterPartyType(e.target.value)} className="w-full rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">All</option>
              <option value="ledger">Ledger</option>
              <option value="member">Member</option>
              <option value="employee">Employee</option>
              <option value="bank">Bank</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-slate-600">Date From</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="w-full rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-slate-600">Date To</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="w-full rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setFilterStatus('');
                setFilterPartyType('');
                setFilterDateFrom('');
                setFilterDateTo('');
                setSearch('');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>

        <div className="mt-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading transactions...</div>
        ) : (
          <Table
            columns={columns}
            data={visibleRows}
            defaultRowsPerPage={10}
            emptyMessage="No transactions found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search voucher no, party, narration..."
          />
        )}
        </div>
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Transaction' : 'Create Transaction'}
        subtitle={section?.description || 'Maintain transaction voucher details.'}
        onClose={closeEditor}
        width="min(1100px, 96vw)"
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="transaction-voucher-form" disabled={saving || !canWrite} className="bg-[#3b79f6] text-white hover:bg-blue-700">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Voucher')}
            </Button>
          </div>
        }
      >
        <ReceiptInterestTransactionForm
          section={section}
          lookups={lookups}
          value={draft}
          setValue={setDraft}
          onSubmit={saveVoucher}
          onDocumentRemove={handleDocumentRemove}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete transaction"
        description={`Delete ${deleteTarget?.voucherNo || 'this transaction'}?`}
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(reverseTarget)}
        title="Reverse transaction"
        description={`Reverse ${reverseTarget?.voucherNo || 'this posted transaction'}?`}
        confirmLabel="Reverse"
        tone="outline"
        onConfirm={confirmReverse}
        onClose={() => setReverseTarget(null)}
      />
    </div>
  );
}

export default ReceiptInterestTransactionsPage;

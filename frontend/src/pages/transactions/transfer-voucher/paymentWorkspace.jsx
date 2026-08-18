import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Edit2, Plus, Trash2, RotateCcw, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { useAuth } from '../../../context/AuthContext';
import { useFY } from '../../../context/FYContext';
import { uploadDocumentMap } from '../../master/documentUpload';
import { TransferVoucherPaymentForm } from './paymentForm';
import {
  buildTransactionVoucherPayload,
  createEmptyTransactionDraft,
  createTransactionDraftFromRecord,
  filterTransactionRows,
  formatTransactionAmount,
  getSectionItems,
  getTransactionLedgerLabel,
  getTransactionPartyLabel,
  getTransactionVoucherTitle,
  getDefaultPartyType
} from './transactionUtils';

function badgeClass(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'posted') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'reversed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'draft') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function TransferVoucherPaymentWorkspacePage({ sectionKey, itemKey, detailPathBase }) {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const { activeFY } = useFY();
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
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);

  const section = useMemo(() => catalog.find((entry) => entry.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => {
    const items = getSectionItems(catalog, sectionKey);
    return itemKey ? items.filter((entry) => entry.key === itemKey) : items;
  }, [catalog, sectionKey, itemKey]);
  const activeItem = sectionItems[0] || null;
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
        toast.error(error.message || 'Unable to load transfer voucher payment records');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token, activeFY]);

  const visibleRows = useMemo(() => {
    const baseRows = filterTransactionRows(rows, sectionItems, sectionKey);
    const searchValue = String(search || '').trim().toLowerCase();

    return baseRows.filter((row) => {
      const payTo = getTransactionPartyLabel(row.partyCode, lookups, row.partyType);
      const paidFrom = getTransactionLedgerLabel(row.details?.settlementAccount || '', lookups);
      const matchesSearch = !searchValue || [
        row.voucherNo,
        payTo,
        paidFrom,
        row.mode,
        row.instrumentNo,
        row.narration,
        row.amount
      ].some((value) => String(value || '').toLowerCase().includes(searchValue));
      const matchesStatus = !filterStatus || String(row.status || '').toLowerCase() === String(filterStatus || '').toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [rows, sectionItems, sectionKey, search, filterStatus, lookups]);

  function openCreate() {
    const next = createEmptyTransactionDraft(sectionKey, sectionItems);
    setActiveRecord(null);
    setDraft({
      ...next,
      partyType: 'ledger',
      voucherCategory: activeItem?.label || next.voucherCategory,
      transactionType: activeItem?.transactionType || next.transactionType,
      accent: activeItem?.accent || next.accent,
      mode: 'Cash',
      details: { ...(next.details || {}), key: activeItem?.key || next.details?.key || '' }
    });
    setEditorOpen(true);
  }

  function openEdit(record) {
    setActiveRecord(record);
    const next = createTransactionDraftFromRecord(record, sectionItems, sectionKey);
    setDraft({
      ...next,
      partyType: 'ledger'
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyTransactionDraft(sectionKey, sectionItems));
    setRemovedDocumentIds([]);
  }

  function handleDocumentRemove(_key, document) {
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
      const response = await api.banking.updateTransactionVoucher(token, nextRecord.id, { documents: uploadedDocuments });
      nextRecord = response.data || response;
    }

    if (removedDocumentIds.length > 0) {
      await Promise.allSettled(removedDocumentIds.map((fileId) => api.files.remove(token, fileId)));
    }

    return nextRecord;
  }

  async function saveVoucher(event) {
    event.preventDefault();
    if (!activeItem) {
      toast.error('Transfer voucher payment template not found');
      return;
    }

    setSaving(true);
    try {
      const payload = buildTransactionVoucherPayload(draft);
      const response = activeRecord
        ? await api.banking.updateTransactionVoucher(token, activeRecord.id, payload)
        : await api.banking.createTransactionVoucher(token, payload);

      let nextRecord = response.data || response;
      nextRecord = await persistVoucherDocuments(nextRecord, draft);
      setRows((current) => (activeRecord ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item)) : [nextRecord, ...current]));
      toast.success(activeRecord ? 'Transfer voucher payment updated' : 'Transfer voucher payment created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save transfer voucher payment');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.banking.deleteTransactionVoucher(token, deleteTarget.id);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Transfer voucher payment deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete transfer voucher payment');
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
      toast.success('Transfer voucher payment reversed');
    } catch (error) {
      toast.error(error.message || 'Unable to reverse transfer voucher payment');
    } finally {
      setReverseTarget(null);
    }
  }

  const columns = [
    { key: 'voucherNo', label: 'Voucher No', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.voucherNo || '-'}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (row) => <span className="text-slate-700">{row.date || '-'}</span> },
    {
      key: 'party',
      label: 'Party',
      sortable: true,
      sortValue: (row) => getTransactionPartyLabel(row.partyCode, lookups, row.partyType),
      render: (row) => <span className="text-slate-700">{getTransactionPartyLabel(row.partyCode, lookups, row.partyType)}</span>
    },
    {
      key: 'paidFrom',
      label: 'Paid From',
      sortable: true,
      sortValue: (row) => getTransactionLedgerLabel(row.details?.settlementAccount || '', lookups),
      render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.settlementAccount || '', lookups)}</span>
    },
    { key: 'mode', label: 'Mode', sortable: true, render: (row) => <span className="text-slate-700">{row.mode || '-'}</span> },
    { key: 'instrumentNo', label: 'Instrument', sortable: true, render: (row) => <span className="text-slate-700">{row.instrumentNo || '-'}</span> },
    { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeClass(row.status)}`}>{row.status || 'Draft'}</span>
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
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-500">Transfer Voucher</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{activeItem?.label || section?.label || sectionKey} Transactions</h1>
        </div>
        <div className="flex gap-2">
          <Button type="button" className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90" onClick={openCreate} disabled={!activeItem || !canWrite}>
            <Plus size={16} />
            New Entry
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1.2fr_220px]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search voucher, party or narration" />
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'Draft', label: 'Draft' },
              { value: 'Posted', label: 'Posted' },
              { value: 'Reversed', label: 'Reversed' }
            ]}
          />
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Table loading={loading} columns={columns} rows={visibleRows} emptyMessage="No transfer voucher payment entries found." />
      </Card>

      <Modal open={editorOpen} onClose={closeEditor} title={activeRecord ? 'Edit Transfer Voucher Payment' : 'Create Transfer Voucher Payment'} width="min(1100px, 96vw)" footer={<div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Cancel</Button>
          <Button type="submit" form="transaction-voucher-form" className="bg-[var(--primary,#1661F6)] text-white hover:opacity-90" disabled={saving || !activeItem}>
            {saving ? 'Saving...' : activeRecord ? 'Update' : 'Save'}
          </Button>
        </div>}>
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          <TransferVoucherPaymentForm
            section={section}
            itemKey={itemKey}
            lookups={lookups}
            value={draft}
            setValue={setDraft}
            onSubmit={saveVoucher}
            onDocumentRemove={handleDocumentRemove}
          />
        </div>
        
      </Modal>

      <ConfirmDialog open={Boolean(deleteTarget)} title="Delete Transfer Voucher Payment" description="This payment voucher will be removed permanently." confirmLabel="Delete" onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      <ConfirmDialog open={Boolean(reverseTarget)} title="Reverse Transfer Voucher Payment" description="This payment voucher will be reversed and marked accordingly." confirmLabel="Reverse" onConfirm={confirmReverse} onCancel={() => setReverseTarget(null)} />
    </div>
  );
}

export default TransferVoucherPaymentWorkspacePage;

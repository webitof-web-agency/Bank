import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Banknote, CheckCircle, ChevronDown, Edit2, Eye, FileText, Filter, Landmark, Link2, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { Select } from '../../../components/ui/Select';
import { useAuth } from '../../../context/AuthContext';
import { useFY } from '../../../context/FYContext';
import { uploadDocumentMap } from '../../master/documentUpload';
import { BankTransactionForm } from './form';
import { getBankTransactionTypeByKey } from './bankConfig';
import {
  buildTransactionVoucherPayload,
  createEmptyTransactionDraft,
  createTransactionDraftFromRecord,
  formatTransactionAmount,
  getSectionItems,
  getTransactionLedgerLabel,
  getTransactionPartyLabel,
  getTransactionVoucherTitle
} from './transactionUtils';

function getStatusBadge(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'posted') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'reversed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'draft') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function matchesWorkspaceRow(row, itemKey, activeItems = []) {
  const normalizedKey = String(itemKey || '').trim().toLowerCase();
  const rowKey = String(row?.details?.key || row?.transactionKey || row?.sectionKey || '').trim().toLowerCase();
  const itemLabel = (activeItems.find((item) => String(item.key || '').toLowerCase() === normalizedKey)?.label || '').trim().toLowerCase();
  if (normalizedKey) {
    if (rowKey) return rowKey === normalizedKey;
    return String(row?.voucherCategory || '').trim().toLowerCase() === itemLabel;
  }
  return true;
}

export function BankTransactionWorkspacePage({ sectionKey, itemKey = '', detailPathBase = '/app/transactions/bank' }) {
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
  const [filterPartyType, setFilterPartyType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  const section = useMemo(() => catalog.find((item) => item.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => getSectionItems(catalog, sectionKey), [catalog, sectionKey]);
  const activeItem = useMemo(() => getBankTransactionTypeByKey(itemKey), [itemKey]);
  const activeItems = useMemo(() => (activeItem ? sectionItems.filter((entry) => entry.key === activeItem.key) : sectionItems), [activeItem, sectionItems]);
  const visibleRows = useMemo(() => {
    const searchValue = String(search || '').trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesWorkspaceRow(row, itemKey, activeItems)) return false;
      const matchesSearch = !searchValue || [row.voucherNo, row.voucherCategory, row.partyCode, row.narration, row.referenceNo, row.instrumentNo].some((value) => String(value || '').toLowerCase().includes(searchValue));
      const matchesStatus = !filterStatus || String(row.status || '').toLowerCase() === String(filterStatus || '').toLowerCase();
      const matchesPartyType = !filterPartyType || String(row.partyType || '').toLowerCase() === String(filterPartyType || '').toLowerCase();
      const matchesFrom = !filterDateFrom || String(row.date || '') >= filterDateFrom;
      const matchesTo = !filterDateTo || String(row.date || '') <= filterDateTo;
      return matchesSearch && matchesStatus && matchesPartyType && matchesFrom && matchesTo;
    });
  }, [rows, itemKey, activeItems, search, filterStatus, filterPartyType, filterDateFrom, filterDateTo]);
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
  }, [token, activeFY]);

  function openCreate(nextItemKey = '') {
    const key = nextItemKey || itemKey || activeItem?.key || activeItems[0]?.key || '';
    const item = activeItems.find((entry) => entry.key === key) || activeItems[0] || null;
    setActiveRecord(null);
    setDraft(() => {
      const next = createEmptyTransactionDraft(sectionKey, activeItems.length ? activeItems : sectionItems);
      return {
        ...next,
        voucherCategory: item?.label || next.voucherCategory,
        transactionType: item?.transactionType || next.transactionType,
        accent: item?.accent || next.accent,
        mode: item?.mode || next.mode,
        details: { ...(next.details || {}), key: item?.key || next.details?.key || key },
        documents: next.documents || {}
      };
    });
    setEditorOpen(true);
  }

  function openEdit(record) {
    setActiveRecord(record);
    setDraft(createTransactionDraftFromRecord(record, activeItems.length ? activeItems : sectionItems, sectionKey));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyTransactionDraft(sectionKey, activeItems.length ? activeItems : sectionItems));
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
    const uploadedDocuments = await uploadDocumentMap(token, currentDraft.documents || {}, { moduleName: 'transactions', entityId: nextRecord.id });
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
    setSaving(true);
    try {
      const payload = buildTransactionVoucherPayload(draft);
      const response = activeRecord
        ? await api.banking.updateTransactionVoucher(token, activeRecord.id, payload)
        : await api.banking.createTransactionVoucher(token, payload);
      let nextRecord = response.data || response;
      nextRecord = await persistVoucherDocuments(nextRecord, draft);
      setRows((current) => activeRecord ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item)) : [nextRecord, ...current]);
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

  const makeStatusColumn = () => ({
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (row) => <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getStatusBadge(row.status)}`}>{row.status || 'Draft'}</span>
  });

  const makeActionsColumn = () => ({
    key: 'actions',
    label: 'Actions',
    sortable: false,
    align: 'right',
    render: (row) => (
      <div className="flex justify-end gap-1">
        <button type="button" onClick={() => navigate(`${detailPathBase}/${row.id}`)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" title="View"><Eye size={16} /></button>
        {canWrite ? (
          <>
            <button type="button" onClick={() => openEdit(row)} className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Edit"><Edit2 size={16} /></button>
            <button type="button" onClick={() => setDeleteTarget(row)} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 size={16} /></button>
          </>
        ) : null}
        {canReverse && String(row.status || '').toLowerCase() === 'posted' ? (
          <button type="button" onClick={() => setReverseTarget(row)} className="rounded-full p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Reverse"><RotateCcw size={16} /></button>
        ) : null}
      </div>
    )
  });

  const baseColumns = [
    { key: 'voucherNo', label: 'Voucher No', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.voucherNo || '-'}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (row) => <span className="text-slate-700">{row.date || '-'}</span> }
  ];

  const bankColumnsByKey = {
    'loan-recv-cash': [
      ...baseColumns,
      { key: 'type', label: 'Type', sortable: true, sortValue: (row) => getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems), render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems)}</span> },
      { key: 'party', label: 'Party', sortable: true, sortValue: (row) => getTransactionPartyLabel(row.partyCode, lookups, row.partyType), render: (row) => <span className="text-slate-700">{getTransactionPartyLabel(row.partyCode, lookups, row.partyType)}</span> },
      { key: 'settlement', label: 'Settlement A/c', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.fixedSettlement || row.details?.settlementAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.fixedSettlement || row.details?.settlementAccount || '', lookups)}</span> },
      { key: 'instrument', label: 'Instrument / Ref', sortable: true, render: (row) => <span className="text-slate-700">{row.instrumentNo || row.referenceNo || '-'}</span> },
      { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
      makeStatusColumn(),
      makeActionsColumn()
    ],
    'loan-recv-saving': [
      ...baseColumns,
      { key: 'type', label: 'Type', sortable: true, sortValue: (row) => getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems), render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems)}</span> },
      { key: 'party', label: 'Party', sortable: true, sortValue: (row) => getTransactionPartyLabel(row.partyCode, lookups, row.partyType), render: (row) => <span className="text-slate-700">{getTransactionPartyLabel(row.partyCode, lookups, row.partyType)}</span> },
      { key: 'settlement', label: 'Settlement A/c', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.fixedSettlement || row.details?.settlementAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.fixedSettlement || row.details?.settlementAccount || '', lookups)}</span> },
      { key: 'instrument', label: 'Cheque / Ref', sortable: true, render: (row) => <span className="text-slate-700">{row.instrumentNo || row.referenceNo || '-'}</span> },
      { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
      makeStatusColumn(),
      makeActionsColumn()
    ],
    'deposit-in-bank': [
      ...baseColumns,
      { key: 'type', label: 'Type', sortable: true, sortValue: (row) => getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems), render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems)}</span> },
      { key: 'depositIn', label: 'Deposit In', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.depositIn || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.depositIn || '', lookups)}</span> },
      { key: 'depositBy', label: 'Deposit By', sortable: true, render: (row) => <span className="text-slate-700">{row.details?.depositBy || '-'}</span> },
      { key: 'instrument', label: 'Slip / Ref', sortable: true, render: (row) => <span className="text-slate-700">{row.instrumentNo || row.referenceNo || '-'}</span> },
      { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
      makeStatusColumn(),
      makeActionsColumn()
    ],
    'cheque-issue-saving': [
      ...baseColumns,
      { key: 'type', label: 'Type', sortable: true, sortValue: (row) => getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems), render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems)}</span> },
      { key: 'settlement', label: 'Settlement A/c', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.fixedSettlement || row.details?.settlementAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.fixedSettlement || row.details?.settlementAccount || '', lookups)}</span> },
      { key: 'selfUse', label: 'Self Use', sortable: true, render: (row) => <span className="text-slate-700">{row.details?.selfUse ? 'Yes' : 'No'}</span> },
      { key: 'instrument', label: 'Cheque No.', sortable: true, render: (row) => <span className="text-slate-700">{row.instrumentNo || '-'}</span> },
      { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
      makeStatusColumn(),
      makeActionsColumn()
    ],
    'cheque-issue-loan': [
      ...baseColumns,
      { key: 'type', label: 'Type', sortable: true, sortValue: (row) => getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems), render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems)}</span> },
      { key: 'settlement', label: 'Settlement A/c', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.fixedSettlement || row.details?.settlementAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.fixedSettlement || row.details?.settlementAccount || '', lookups)}</span> },
      { key: 'selfUse', label: 'Self Use', sortable: true, render: (row) => <span className="text-slate-700">{row.details?.selfUse ? 'Yes' : 'No'}</span> },
      { key: 'instrument', label: 'Cheque No.', sortable: true, render: (row) => <span className="text-slate-700">{row.instrumentNo || '-'}</span> },
      { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
      makeStatusColumn(),
      makeActionsColumn()
    ],
    'transfer-saving': [
      ...baseColumns,
      { key: 'type', label: 'Type', sortable: true, sortValue: (row) => getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems), render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems)}</span> },
      { key: 'transferType', label: 'Transfer Type', sortable: true, render: (row) => <span className="text-slate-700">{row.details?.transferType || '-'}</span> },
      { key: 'from', label: 'From Account', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.fixedFrom || row.details?.fromAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.fixedFrom || row.details?.fromAccount || '', lookups)}</span> },
      { key: 'to', label: 'To Account', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.fixedTo || row.details?.toAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.fixedTo || row.details?.toAccount || '', lookups)}</span> },
      { key: 'instrument', label: 'Ref / Cheque', sortable: true, render: (row) => <span className="text-slate-700">{row.instrumentNo || row.referenceNo || '-'}</span> },
      { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
      makeStatusColumn(),
      makeActionsColumn()
    ],
    'transfer-cashcredit': [
      ...baseColumns,
      { key: 'type', label: 'Type', sortable: true, sortValue: (row) => getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems), render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems)}</span> },
      { key: 'transferType', label: 'Transfer Type', sortable: true, render: (row) => <span className="text-slate-700">{row.details?.transferType || '-'}</span> },
      { key: 'from', label: 'From Account', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.fixedFrom || row.details?.fromAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.fixedFrom || row.details?.fromAccount || '', lookups)}</span> },
      { key: 'to', label: 'To Account', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.fixedTo || row.details?.toAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.fixedTo || row.details?.toAccount || '', lookups)}</span> },
      { key: 'instrument', label: 'Ref / Cheque', sortable: true, render: (row) => <span className="text-slate-700">{row.instrumentNo || row.referenceNo || '-'}</span> },
      { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
      makeStatusColumn(),
      makeActionsColumn()
    ]
  };

  const columns = bankColumnsByKey[itemKey] || [
    ...baseColumns,
    { key: 'type', label: 'Type', sortable: true, sortValue: (row) => getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems), render: (row) => <span className="text-slate-700">{getTransactionVoucherTitle(row, activeItems.length ? activeItems : sectionItems)}</span> },
    { key: 'reference', label: 'Reference / Instrument', sortable: true, sortValue: (row) => row.referenceNo || row.instrumentNo || '', render: (row) => <span className="text-slate-700">{row.referenceNo || row.instrumentNo || '-'}</span> },
    { key: 'bank', label: 'Bank A/c', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.settlementAccount || row.details?.ledgerTarget || row.details?.depositIn || row.details?.fromAccount || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.settlementAccount || row.details?.ledgerTarget || row.details?.depositIn || row.details?.fromAccount || '', lookups)}</span> },
    { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
    makeStatusColumn(),
    makeActionsColumn()
  ];  const stats = useMemo(() => ({
    total: visibleRows.length,
    posted: visibleRows.filter((row) => String(row.status || '').toLowerCase() === 'posted').length,
    draft: visibleRows.filter((row) => String(row.status || '').toLowerCase() === 'draft').length,
    amount: visibleRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  }), [visibleRows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">Bank Transactions</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{activeItem?.label || section?.label || sectionKey} Transactions</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={exportCsv}>
            Export CSV
          </Button>
          
          {activeItem ? (
            <Button type="button" className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90" onClick={() => openCreate(activeItem.key)}>
              <Plus size={16} />
              Create {activeItem.label}
            </Button>
          ) : (
            <div className="relative">
              <Button
                type="button"
                className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
              >
                <Plus size={16} />
                Create Transaction
                <ChevronDown size={14} className="ml-1 opacity-70" />
              </Button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-max min-w-[18rem] origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-900/5">
                  {(activeItems || sectionItems || []).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setDropdownOpen(false);
                        openCreate(item.key);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary)] transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
                        <Plus size={14} strokeWidth={2.5} />
                      </div>
                      <span className="line-clamp-1">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Total Transactions', subLabel: 'Voucher records loaded in this section', value: stats.total, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Posted', subLabel: 'Posted and active entries', value: stats.posted, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Amount', subLabel: 'Total voucher amount for the filtered section', value: formatTransactionAmount(stats.amount), icon: Banknote, color: 'text-purple-500', bg: 'bg-purple-50' }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4 rounded-2xl">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${item.bg} ${item.color}`}>
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{item.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-bold text-slate-900 truncate">{loading ? '...' : item.value}</p>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{item.subLabel}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
            searchPlaceholder="Search voucher no, reference, narration..."
            headerActions={
              <div className="relative">
                <Button type="button" variant="outline" className="gap-2 h-9 text-[13px] border-slate-200 bg-white hover:bg-slate-50" onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}>
                  <Filter size={14} />
                  Filter
                </Button>
                {filterDropdownOpen ? (
                  <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:w-[400px]">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Filters</h4>
                      <button type="button" onClick={() => setFilterDropdownOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-slate-600">Status</label>
                        <Select value={filterStatus} onChange={setFilterStatus} options={[{ value: '', label: 'All' }, { value: 'Draft', label: 'Draft' }, { value: 'Posted', label: 'Posted' }, { value: 'Reversed', label: 'Reversed' }]} size="sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-slate-600">Party Type</label>
                        <Select value={filterPartyType} onChange={setFilterPartyType} options={[{ value: '', label: 'All' }, { value: 'ledger', label: 'Ledger' }, { value: 'member', label: 'Member' }, { value: 'employee', label: 'Employee' }, { value: 'bank', label: 'Bank' }]} size="sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-slate-600">Date From</label>
                        <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9 w-full rounded-[0.75rem] border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-slate-600">Date To</label>
                        <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9 w-full rounded-[0.75rem] border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]" />
                      </div>
                    </div>
                    <div className="mt-6">
                      <Button type="button" className="h-10 w-full rounded-[0.75rem] bg-[var(--primary)] text-white hover:opacity-90" onClick={() => { setFilterStatus(''); setFilterPartyType(''); setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); setFilterDropdownOpen(false); }}>
                        Clear Filters
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            }
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? `Edit ${draft?.voucherCategory || activeItem?.label || 'Transaction'}` : `Create ${draft?.voucherCategory || activeItem?.label || 'Transaction'}`}
        onClose={closeEditor}
        width="min(1100px, 96vw)"
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="transaction-voucher-form" disabled={saving || !canWrite} className="bg-[#1661F6] text-white hover:bg-blue-700">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : `Create ${draft?.voucherCategory || activeItem?.label || 'Transaction'}`)}
            </Button>
          </div>
        }
      >
        <BankTransactionForm
          section={{ ...(section || { items: activeItems }) }}
          lookups={lookups}
          value={draft}
          setValue={setDraft}
          onSubmit={saveVoucher}
          onDocumentRemove={handleDocumentRemove}
        />
      </Modal>

      <ConfirmDialog open={Boolean(deleteTarget)} title="Delete transaction" description={`Delete ${deleteTarget?.voucherNo || 'this transaction'}?`} confirmLabel="Delete" tone="destructive" onConfirm={confirmDelete} onClose={() => setDeleteTarget(null)} />
      <ConfirmDialog open={Boolean(reverseTarget)} title="Reverse transaction" description={`Reverse ${reverseTarget?.voucherNo || 'this posted transaction'}?`} confirmLabel="Reverse" tone="outline" onConfirm={confirmReverse} onClose={() => setReverseTarget(null)} />
    </div>
  );
}

export default BankTransactionWorkspacePage;


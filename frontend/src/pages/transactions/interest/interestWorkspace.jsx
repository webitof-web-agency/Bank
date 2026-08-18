import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Edit2, Plus, Trash2, ChevronDown, FileText, Banknote, Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { Table } from '../../../components/ui/Table';
import { useAuth } from '../../../context/AuthContext';
import { useFY } from '../../../context/FYContext';
import { uploadDocumentMap } from '../../master/documentUpload';
import { InterestVoucherForm } from './interestForm';
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

export function InterestVoucherWorkspacePage({ sectionKey, itemKey, detailPathBase }) {
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
  const [search, setSearch] = useState('');
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const section = useMemo(() => catalog.find((entry) => entry.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => {
    const items = getSectionItems(catalog, sectionKey);
    return itemKey ? items.filter((entry) => entry.key === itemKey) : items;
  }, [catalog, sectionKey, itemKey]);
  const activeItem = sectionItems[0] || null;
  const canWrite = hasPermission('transactions.write');

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
        toast.error(error.message || 'Unable to load interest records');
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
      const member = getTransactionPartyLabel(row.partyCode, lookups, row.partyType);
      const accountHead = getTransactionLedgerLabel(row.details?.accountHead || '', lookups);
      const matchesSearch = !searchValue || [row.voucherNo, member, accountHead, row.narration, row.amount].some((value) => String(value || '').toLowerCase().includes(searchValue));
      return matchesSearch;
    });
  }, [rows, sectionItems, sectionKey, search, lookups]);

  function openCreate() {
    const next = createEmptyTransactionDraft(sectionKey, sectionItems);
    setActiveRecord(null);
    setDraft({
      ...next,
      partyType: 'member',
      voucherCategory: activeItem?.label || next.voucherCategory,
      transactionType: activeItem?.transactionType || next.transactionType,
      accent: activeItem?.accent || next.accent,
      mode: activeItem?.mode || 'Interest',
      details: { ...(next.details || {}), key: activeItem?.key || next.details?.key || '' }
    });
    setEditorOpen(true);
  }

  function openEdit(record) {
    setActiveRecord(record);
    const next = createTransactionDraftFromRecord(record, sectionItems, sectionKey);
    setDraft({ ...next, partyType: 'member' });
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
      toast.error('Interest template not found');
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
      toast.success(activeRecord ? 'Interest updated' : 'Interest created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save interest');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.banking.deleteTransactionVoucher(token, deleteTarget.id);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Interest deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete interest');
    } finally {
      setDeleteTarget(null);
    }
  }

  const columns = [
    { key: 'voucherNo', label: 'Voucher No', sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.voucherNo || '-'}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (row) => <span className="text-slate-700">{row.date || '-'}</span> },
    { key: 'member', label: 'Member', sortable: true, sortValue: (row) => getTransactionPartyLabel(row.partyCode, lookups, row.partyType), render: (row) => <span className="text-slate-700">{getTransactionPartyLabel(row.partyCode, lookups, row.partyType)}</span> },
    { key: 'accountHead', label: 'Account Head', sortable: true, sortValue: (row) => getTransactionLedgerLabel(row.details?.accountHead || '', lookups), render: (row) => <span className="text-slate-700">{getTransactionLedgerLabel(row.details?.accountHead || '', lookups)}</span> },
    { key: 'amount', label: 'Amount', sortable: true, render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.amount ?? 0)}</span> },
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
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{section?.label || sectionKey} Transactions</h1>
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

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { label: 'Total Transactions', value: visibleRows.length, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Amount', value: formatTransactionAmount(visibleRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)), icon: Banknote, color: 'text-purple-500', bg: 'bg-purple-50' }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${item.bg} ${item.color}`}>
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{item.label}</p>
                <p className="text-xl font-bold text-slate-900 truncate">{loading ? '...' : item.value}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm mt-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading transactions...</div>
        ) : (
          <Table
            columns={columns}
            data={visibleRows}
            defaultRowsPerPage={10}
            emptyMessage="No interest entries found."
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search voucher no, member, narration..."
            headerActions={
              <div className="relative">
                {filterDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[320px] sm:w-[400px] z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-slate-900 text-sm">Filters</h4>
                      <button type="button" onClick={() => setFilterDropdownOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="grid gap-4">
                      <div className="flex items-end mt-2">
                        <Button type="button" className="w-full gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90" onClick={() => { setSearch(''); setFilterDropdownOpen(false); }}>
                          Clear Filters
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            }
          />
        )}
      </Card>

      <Modal
        open={editorOpen}
        onClose={closeEditor}
        title={activeRecord ? 'Edit Interest' : 'Create Interest'}
        width="min(1100px, 96vw)"
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="transaction-voucher-form" disabled={saving || !canWrite} className="bg-[var(--primary,#1661F6)] text-white hover:opacity-90">
              {saving ? 'Saving...' : activeRecord ? 'Save Changes' : 'Create Interest'}
            </Button>
          </div>
        }
      >
        <InterestVoucherForm section={section} lookups={lookups} value={draft} setValue={setDraft} onSubmit={saveVoucher} onDocumentRemove={handleDocumentRemove} />
      </Modal>

      <ConfirmDialog open={Boolean(deleteTarget)} title="Delete interest" description="This interest entry will be removed permanently." confirmLabel="Delete" tone="destructive" onConfirm={confirmDelete} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

export default InterestVoucherWorkspacePage;

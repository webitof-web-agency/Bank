import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Edit2, Trash2, RotateCcw, ChevronDown, Filter, X } from 'lucide-react';
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
import { EmployeeTransactionForm } from './form';
import {
  buildTransactionVoucherPayload,
  createEmptyTransactionDraft,
  createTransactionDraftFromRecord,
  filterTransactionRows,
  formatTransactionAmount,
  getSectionItems,
  getTransactionPartyLabel,
  getTransactionVoucherTitle,
  getEmployeeComponentTotal
} from './transactionUtils';

function badgeClass(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'posted') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'reversed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value === 'draft') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function EmployeeTransactionWorkspacePage({ sectionKey, itemKey, detailPathBase }) {
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
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);

  const section = useMemo(() => catalog.find((entry) => entry.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => {
    const items = getSectionItems(catalog, sectionKey);
    return itemKey ? items.filter((entry) => entry.key === itemKey) : items;
  }, [catalog, sectionKey, itemKey]);
  const activeItem = sectionItems[0] || null;
  const isAdvancePaid = activeItem?.key === 'advance-paid-emp';
  const isAdvanceRecovery = activeItem?.key === 'advance-recovery-emp';
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
        toast.error(error.message || 'Unable to load employee transactions');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token, activeFY]);

  const visibleRows = useMemo(() => {
    const baseRows = filterTransactionRows(rows, sectionItems);
    const searchValue = String(search || '').trim().toLowerCase();

    return baseRows.filter((row) => {
      const total = getEmployeeComponentTotal(row);
      const matchesSearch = !searchValue || [
        row.voucherNo,
        row.partyCode,
        getTransactionPartyLabel(row.partyCode, lookups, row.partyType),
        row.narration,
        row.mode,
        row.instrumentNo,
        String(total)
      ].some((value) => String(value || '').toLowerCase().includes(searchValue));
      const matchesStatus = !filterStatus || String(row.status || '').toLowerCase() === String(filterStatus || '').toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [rows, sectionItems, search, filterStatus, lookups]);

  function openCreate() {
    const next = createEmptyTransactionDraft(sectionKey, sectionItems);
    setActiveRecord(null);
    setDraft({
      ...next,
      voucherCategory: activeItem?.label || next.voucherCategory,
      transactionType: activeItem?.transactionType || next.transactionType,
      accent: activeItem?.accent || next.accent,
      mode: activeItem?.mode?.includes('Transfer') ? 'Transfer' : 'Cash',
      details: { ...(next.details || {}), key: activeItem?.key || next.details?.key || '' }
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

  function handleDocumentRemove(_key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
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
      toast.error('Employee transaction template not found');
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
      setRows((current) => (activeRecord
        ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
        : [nextRecord, ...current]
      ));
      toast.success(activeRecord ? 'Employee transaction updated' : 'Employee transaction created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save employee transaction');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.banking.deleteTransactionVoucher(token, deleteTarget.id);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Employee transaction deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete employee transaction');
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
      toast.success('Employee transaction reversed');
    } catch (error) {
      toast.error(error.message || 'Unable to reverse employee transaction');
    } finally {
      setReverseTarget(null);
    }
  }

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
      key: 'employee',
      label: 'Employee Name',
      sortable: true,
      sortValue: (row) => getTransactionPartyLabel(row.partyCode, lookups, row.partyType),
      render: (row) => <span className="text-slate-700">{getTransactionPartyLabel(row.partyCode, lookups, row.partyType)}</span>
    },
    {
      key: 'house',
      label: 'House Loan',
      sortable: true,
      render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.details?.components?.house ?? 0)}</span>
    },
    {
      key: 'vehicle',
      label: 'Vehicle Loan',
      sortable: true,
      render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.details?.components?.vehicle ?? 0)}</span>
    },
    {
      key: 'grain',
      label: 'Grain Advance',
      sortable: true,
      render: (row) => <span className="text-slate-700">{formatTransactionAmount(row.details?.components?.grain ?? 0)}</span>
    },
    {
      key: 'mode',
      label: isAdvanceRecovery ? 'Paymode' : 'Payment',
      sortable: true,
      render: (row) => <span className="text-slate-700">{row.mode || '-'}</span>
    },
    ...(isAdvancePaid ? [
      {
        key: 'instrumentNo',
        label: 'Instrument No',
        sortable: true,
        render: (row) => <span className="text-slate-700">{row.instrumentNo || '-'}</span>
      },
      {
        key: 'instrumentDate',
        label: 'Instrument Date',
        sortable: true,
        render: (row) => <span className="text-slate-700">{row.instrumentDate || '-'}</span>
      }
    ] : []),
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
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeClass(row.status)}`}>
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
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-500">Employee Transactions</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{activeItem?.label || section?.label || sectionKey} Transactions</h1>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={() => setFilterDropdownOpen((current) => !current)}>
            <Filter size={14} />
            Filter
          </Button>
          <Button type="button" className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90" onClick={openCreate} disabled={!activeItem}>
            <Plus size={16} />
            Create Entry
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Table
          columns={columns}
          data={visibleRows}
          defaultRowsPerPage={10}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search voucher no, employee, narration..."
          emptyMessage="No employee transactions found."
          headerActions={
            <div className="relative">
              {filterDropdownOpen ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Filters</h4>
                    <button type="button" onClick={() => setFilterDropdownOpen(false)} className="text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-semibold text-slate-600">Status</label>
                      <Select
                        value={filterStatus}
                        onChange={setFilterStatus}
                        options={[
                          { value: '', label: 'All' },
                          { value: 'Draft', label: 'Draft' },
                          { value: 'Posted', label: 'Posted' },
                          { value: 'Reversed', label: 'Reversed' }
                        ]}
                        size="sm"
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full bg-[var(--primary,#1661F6)] text-white hover:opacity-90"
                      onClick={() => {
                        setSearch('');
                        setFilterStatus('');
                        setFilterDropdownOpen(false);
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          }
        />
      </Card>

      <Modal
        open={editorOpen}
        title={activeRecord ? `Edit ${activeItem?.label || 'Employee Transaction'}` : `Create ${activeItem?.label || 'Employee Transaction'}`}
        onClose={closeEditor}
        width="min(1100px, 96vw)"
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="transaction-voucher-form" disabled={saving || !canWrite} className="bg-[#1661F6] text-white hover:bg-blue-700">
              {saving ? 'Saving...' : (activeRecord ? 'Save Changes' : 'Create Entry')}
            </Button>
          </div>
        }
      >
        {activeItem ? (
          <EmployeeTransactionForm
            section={section}
            itemKey={itemKey}
            lookups={lookups}
            value={draft}
            setValue={setDraft}
            onSubmit={saveVoucher}
            onDocumentRemove={handleDocumentRemove}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete employee transaction"
        description={`Delete ${deleteTarget?.voucherNo || 'this transaction'}?`}
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(reverseTarget)}
        title="Reverse employee transaction"
        description={`Reverse ${reverseTarget?.voucherNo || 'this posted transaction'}?`}
        confirmLabel="Reverse"
        tone="outline"
        onConfirm={confirmReverse}
        onClose={() => setReverseTarget(null)}
      />
    </div>
  );
}

export default EmployeeTransactionWorkspacePage;

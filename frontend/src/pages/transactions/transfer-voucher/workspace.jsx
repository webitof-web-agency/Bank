import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServerList } from '../../../lib/useServerList';
import { Eye, Edit2, Plus, Trash2 } from 'lucide-react';
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
import { TransferVoucherTransactionForm } from './form';
import {
  buildTransactionVoucherPayload,
  createEmptyTransactionDraft,
  createTransactionDraftFromRecord,
  filterTransactionRows,
  formatTransactionAmount,
  getSectionItems,
  getTransactionPartyLabel,
  getTransactionVoucherTitle,
  getTransferVoucherAllocationTotal
} from './transactionUtils';

export function TransferVoucherTransactionWorkspacePage({ sectionKey, itemKey, detailPathBase }) {
  const navigate = useNavigate();
  const { token, pageAccess } = useAuth();
  const { activeFY } = useFY();
  const [catalog, setCatalog] = useState([]);
  const [lookups, setLookups] = useState({});
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyTransactionDraft(sectionKey, []));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);

  const section = useMemo(() => catalog.find((entry) => entry.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => {
    const items = getSectionItems(catalog, sectionKey);
    return itemKey ? items.filter((entry) => entry.key === itemKey) : items;
  }, [catalog, sectionKey, itemKey]);
  const activeItem = sectionItems[0] || null;
  // Paid To Member / Recover From Member: actions use the page's full name.
  const transactionLabel = activeItem?.label || 'Transfer Voucher';
  const { canCreate, canEdit, canDelete } = pageAccess('transactions', 'transfer-voucher');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    // Independent: the catalog (page title, types) is quick; lookups (party
    // names) load every member/ledger and must not hold up the list.
    api.banking.getTransactionCatalog(token)
      .then((catalogRes) => {
        if (mounted) setCatalog(Array.isArray(catalogRes.data) ? catalogRes.data : []);
      })
      .catch((error) => {
        if (mounted) toast.error(error.message || 'Unable to load transfer vouchers');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    api.banking.getLookups(token)
      .then((lookupsRes) => {
        if (mounted) setLookups(lookupsRes.data || {});
      })
      .catch((error) => {
        if (mounted) toast.error(error.message || 'Unable to load transfer vouchers');
      });

    return () => {
      mounted = false;
    };
  }, [token, activeFY]);

  // The server filters, sorts and pages; only the visible page is loaded.
  const listFilters = { section: sectionKey, item: itemKey };
  const list = useServerList(
    (query) => api.banking.listTransactionVouchers(token, { ...listFilters, ...query }),
    [token, activeFY?.start, listFilters]
  );
  const visibleRows = list.rows;

  function openCreate() {
    const next = createEmptyTransactionDraft(sectionKey, sectionItems);
    setActiveRecord(null);
    setDraft({
      ...next,
      voucherCategory: activeItem?.label || next.voucherCategory,
      transactionType: activeItem?.transactionType || next.transactionType,
      accent: activeItem?.accent || next.accent,
      mode: activeItem?.mode || next.mode,
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

  async function exportCsv() {
    let exportRows;
    try {
      const response = await api.banking.listTransactionVouchers(token, { ...listFilters, ...list.query, page: 1, limit: 'all' });
      exportRows = Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      toast.error(error.message || 'Unable to export transactions');
      return;
    }
    const headers = ['Voucher No', 'Date', 'Category', 'Party', 'Amount', 'Narration'];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.map(escape).join(','),
      ...exportRows.map((row) => ([
        row.voucherNo,
        row.date,
        row.voucherCategory,
        getTransactionPartyLabel(row.partyCode, lookups, row.partyType),
        row.amount ?? 0,
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
    if (!activeItem) {
      toast.error('Transfer voucher template not found');
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
      list.reload();
      toast.success(activeRecord ? 'Transfer voucher updated' : 'Transfer voucher created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save transfer voucher');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.banking.deleteTransactionVoucher(token, deleteTarget.id);
      list.reload();
      toast.success('Transfer voucher deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete transfer voucher');
    } finally {
      setDeleteTarget(null);
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
      key: 'member',
      label: 'Member',
      sortable: true,
      sortField: 'partyCode',
      sortValue: (row) => getTransactionPartyLabel(row.partyCode, lookups, row.partyType),
      render: (row) => <span className="text-slate-700">{getTransactionPartyLabel(row.partyCode, lookups, row.partyType)}</span>
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (row) => {
        const total = getTransferVoucherAllocationTotal(row.details?.allocations || [], row.details?.key || itemKey);
        return <span className="text-slate-700">{formatTransactionAmount(row.amount ?? total ?? 0)}</span>;
      }
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
          {canEdit && !row.isHistorical ? (
            <button type="button" onClick={() => openEdit(row)} className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Edit">
              <Edit2 size={16} />
            </button>
          ) : null}
          {canDelete && !row.isHistorical ? (
            <button type="button" onClick={() => setDeleteTarget(row)} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
              <Trash2 size={16} />
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
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-500">Transfer Voucher</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{activeItem?.label || `${section?.label || sectionKey}`.replace(/( Transactions)?$/, ' Transactions')}</h1>
        </div>

        <div className="flex gap-2">
          <Button type="button" className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90" onClick={openCreate} disabled={!activeItem || !canCreate}>
            <Plus size={16} />
            Add Entry
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Table search={list.search} onSearch={list.setSearch} searchPlaceholder="Search voucher, member or narration" columns={columns} data={visibleRows} serverPagination={list.serverPagination} emptyMessage="No transfer voucher entries found." />
      </Card>

      <Modal open={editorOpen} onClose={closeEditor} title={`${activeRecord ? 'Edit' : 'Create'} ${transactionLabel}`} footer={<div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Cancel</Button>
          <Button type="submit" form="transaction-voucher-form" className="bg-[var(--primary,#1661F6)] text-white hover:opacity-90" disabled={saving || !activeItem}>
            {saving ? 'Saving...' : activeRecord ? 'Update' : 'Save'}
          </Button>
        </div>}>
        <TransferVoucherTransactionForm
          section={section}
          itemKey={itemKey}
          lookups={lookups}
          value={draft}
          setValue={setDraft}
          onSubmit={saveVoucher}
          onDocumentRemove={handleDocumentRemove}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${transactionLabel}`}
        description="This transfer voucher will be removed permanently."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default TransferVoucherTransactionWorkspacePage;


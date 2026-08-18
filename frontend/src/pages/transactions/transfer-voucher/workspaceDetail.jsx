import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, Layers3, RotateCcw, ShieldCheck, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { useAuth } from '../../../context/AuthContext';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { TransferVoucherTransactionForm } from './form';
import { getTransferVoucherDocumentDefinitions } from './transferVoucherDocumentUtils';
import { uploadDocumentMap } from '../../master/documentUpload';
import {
  buildTransactionVoucherPayload,
  createTransactionDraftFromRecord,
  filterTransactionRows,
  formatTransactionAmount,
  getSectionItems,
  getTransactionPartyLabel,
  getTransactionVoucherTitle,
  getTransferVoucherAllocationRows,
  getTransferVoucherAllocationTotal,
  getVoucherSectionItem,
  toCurrency
} from './transactionUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
    </div>
  );
}

function StatusBadge({ status = '' }) {
  const value = String(status || '').toLowerCase();
  const className =
    value === 'posted' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
    value === 'reversed' ? 'border-rose-200 bg-rose-50 text-rose-700' :
    value === 'draft' ? 'border-amber-200 bg-amber-50 text-amber-700' :
    'border-slate-200 bg-slate-50 text-slate-700';

  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium ${className}`}>{status || 'Draft'}</span>;
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function SimpleTable({ headers = [], rows = [], emptyMessage = 'No records found.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[13px]">
        <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-[0.05em] text-[11px]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3.5">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={row.key || rowIndex} className="hover:bg-slate-50/50">
              {row.cells.map((cell, cellIndex) => (
                <td key={`${row.key || rowIndex}-${cellIndex}`} className="px-4 py-3 text-slate-700">{cell}</td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-slate-500">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TransferVoucherTransactionWorkspaceDetailPage({ sectionKey, itemKey }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [lookups, setLookups] = useState({});
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);

  const section = useMemo(() => catalog.find((entry) => entry.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => {
    const items = getSectionItems(catalog, sectionKey);
    return itemKey ? items.filter((entry) => entry.key === itemKey) : items;
  }, [catalog, sectionKey, itemKey]);
  const canWrite = hasPermission('transactions.write');
  const canReverse = hasPermission('transactions.reverse');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      api.banking.getTransactionCatalog(token),
      api.banking.getTransactionVoucher(token, id),
      api.banking.getLookups(token)
    ])
      .then(([catalogRes, recordRes, lookupsRes]) => {
        if (!mounted) return;
        setCatalog(Array.isArray(catalogRes.data) ? catalogRes.data : []);
        setRecord(recordRes.data || null);
        setLookups(lookupsRes.data || {});
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load transfer voucher');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!record) return;
    setDraft(createTransactionDraftFromRecord(record, sectionItems, sectionKey));
    setRemovedDocumentIds([]);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDraft(null);
    setRemovedDocumentIds([]);
  }

  async function saveVoucher(event) {
    event.preventDefault();
    if (!record || !draft) return;

    setSaving(true);
    try {
      const payload = buildTransactionVoucherPayload(draft);
      const response = await api.banking.updateTransactionVoucher(token, record.id, payload);
      let nextRecord = response.data || response;
      const uploadedDocuments = await uploadDocumentMap(token, draft.documents || {}, {
        moduleName: 'transactions',
        entityId: nextRecord.id
      });
      if (Object.keys(uploadedDocuments).length || removedDocumentIds.length) {
        const updateResponse = await api.banking.updateTransactionVoucher(token, nextRecord.id, { documents: uploadedDocuments });
        nextRecord = updateResponse.data || nextRecord;
      }
      if (removedDocumentIds.length > 0) {
        await Promise.allSettled(removedDocumentIds.map((fileId) => api.files.remove(token, fileId)));
      }
      setRecord(nextRecord);
      toast.success('Transfer voucher updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save transfer voucher');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReverse() {
    if (!record) return;
    try {
      const response = await api.banking.reverseTransactionVoucher(token, record.id);
      setRecord(response.data || response);
      toast.success('Transfer voucher reversed');
    } catch (error) {
      toast.error(error.message || 'Unable to reverse transfer voucher');
    } finally {
      setReverseOpen(false);
    }
  }

  async function confirmDelete() {
    if (!record) return;
    try {
      await api.banking.deleteTransactionVoucher(token, record.id);
      toast.success('Transfer voucher deleted');
      navigate(`/app/transactions/transfer-voucher/${itemKey || (getVoucherSectionItem(record, sectionItems, sectionKey)?.key || '')}`);
    } catch (error) {
      toast.error(error.message || 'Unable to delete transfer voucher');
    } finally {
      setDeleteOpen(false);
    }
  }

  function handleDocumentRemove(_key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Transaction not found
      </div>
    );
  }

  const title = getTransactionVoucherTitle(record, sectionItems, sectionKey);
  const templateItem = getVoucherSectionItem(record, sectionItems, sectionKey);
  const documentDefs = getTransferVoucherDocumentDefinitions(templateItem?.key || record?.details?.key || '');
  const partyLabel = getTransactionPartyLabel(record.partyCode, lookups, record.partyType);
  const details = record.details || {};
  const allocationRows = getTransferVoucherAllocationRows(details.allocations || [], details.key || itemKey);
  const allocationTotal = getTransferVoucherAllocationTotal(allocationRows, details.key || itemKey);
  const journalLines = Array.isArray(record.journalLines) ? record.journalLines : [];
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Sparkles },
    { id: 'allocation', label: 'Allocation', icon: Layers3, badge: allocationRows.filter((row) => Number(row.amount || 0) > 0).length ? String(allocationRows.filter((row) => Number(row.amount || 0) > 0).length) : '' },
    { id: 'journal', label: 'Journal', icon: FileText, badge: journalLines.length ? String(journalLines.length) : '' },
    { id: 'attachments', label: 'Attachments', icon: FileText, badge: Object.keys(record.documents || {}).length ? String(Object.keys(record.documents || {}).length) : '' },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  const headerCards = [
    { label: 'Amount', value: formatTransactionAmount(record.amount ?? allocationTotal ?? 0) },
    { label: 'Status', value: record.status || 'Draft' },
    { label: 'Type', value: record.transactionType || 'payment' },
    { label: 'Rows', value: String(allocationRows.filter((row) => Number(row.amount || 0) > 0).length || journalLines.length || 0) }
  ];

  function exportCsv() {
    const headers = ['Field', 'Value'];
    const rows = [
      ['Voucher No', record.voucherNo],
      ['Date', record.date],
      ['Category', record.voucherCategory],
      ['Transaction Type', record.transactionType],
      ['Party Type', record.partyType],
      ['Party', partyLabel],
      ['Amount', formatTransactionAmount(record.amount ?? allocationTotal ?? 0)],
      ['Status', record.status],
      ['Mode', record.mode],
      ['Reference No', record.referenceNo],
      ['Narration', record.narration]
    ];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${record.voucherNo || 'transfer-voucher'}-detail.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteAttachment(key, document) {
    if (!canWrite || !document?.fileId || !record) return;
    try {
      await api.files.remove(token, document.fileId);
      const nextDocuments = { ...(record.documents || {}) };
      delete nextDocuments[key];
      const response = await api.banking.updateTransactionVoucher(token, record.id, { documents: nextDocuments });
      setRecord(response.data || { ...record, documents: nextDocuments });
      toast.success('Attachment removed');
    } catch (error) {
      toast.error(error.message || 'Unable to remove attachment');
    }
  }

  const allocationTableRows = allocationRows.map((row) => ({
    key: row.head,
    cells: [
      row.label,
      row.amount ? toCurrency(row.amount) : '—',
      row.side || '—'
    ]
  }));

  const journalTableRows = journalLines.map((line, index) => ({
    key: line.id || index,
    cells: [
      line.accountCode || line.ledgerCode || line.account || '—',
      line.description || line.narration || '—',
      line.side || line.drCr || '—',
      toCurrency(line.amount || 0)
    ]
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 print:hidden">
        <button type="button" onClick={() => navigate(`/app/transactions/transfer-voucher/${itemKey || ''}`)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">{section?.label || sectionKey} Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 border-b border-slate-100 bg-white px-8 py-10 text-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
                <FileText size={28} strokeWidth={1.8} />
              </div>
              <div>
                <p className="mb-1 text-[13px] font-semibold tracking-wider text-[var(--primary)] uppercase">{record.voucherNo || 'Voucher Detail'}</p>
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
              </div>
            </div>

            <div className="flex flex-col md:items-end gap-4 print:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={exportCsv} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4">
                  Export CSV
                </Button>
                <Button type="button" variant="outline" onClick={() => window.print()} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4">
                  Print
                </Button>
                {canReverse && String(record.status || '').toLowerCase() === 'posted' ? (
                  <Button type="button" variant="outline" onClick={() => setReverseOpen(true)} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4">
                    <RotateCcw size={16} />
                    Reverse
                  </Button>
                ) : null}

                {canWrite ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4">
                      <Trash2 size={16} />
                      Delete
                    </Button>
                    <Button type="button" variant="outline" onClick={openEditor} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4 bg-slate-50">
                      <Edit2 size={16} />
                      Edit Transaction
                    </Button>
                  </>
                ) : null}
              </div>

              <div className="flex items-center gap-5 mt-1 bg-slate-50/80 border border-slate-100 rounded-[14px] px-5 py-3 shadow-sm overflow-x-auto">
                {headerCards.map((item, index) => (
                  <div key={item.label} className="flex items-center gap-5 shrink-0">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{item.label}</p>
                      <p className="text-base font-bold text-slate-900 leading-tight mt-0.5 capitalize">{item.value}</p>
                    </div>
                    {index < headerCards.length - 1 && <div className="w-px h-8 bg-slate-200" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-200 px-8 pt-4 overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[14px] font-medium transition-colors ${
                activeTab === tab.id ? 'text-[var(--primary)]' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon && <tab.icon size={15} className="mb-0.5" />}
              {tab.label}
              {tab.badge ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {tab.badge}
                </span>
              ) : null}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--primary)]" />}
            </button>
          ))}
        </div>

        <div className="space-y-6 p-8">
          {activeTab === 'overview' ? (
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Voucher No" value={record.voucherNo} />
                  <DetailRow label="Date" value={record.date} />
                  <DetailRow label="Category" value={record.voucherCategory} />
                  <DetailRow label="Transaction Type" value={record.transactionType} />
                  <DetailRow label="Party" value={partyLabel} />
                  <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
                </div>
              </Card>

              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Amount" value={formatTransactionAmount(record.amount ?? allocationTotal ?? 0)} />
                  <DetailRow label="Mode" value={record.mode} />
                  <DetailRow label="Reference No" value={record.referenceNo} />
                  <DetailRow label="Narration" value={record.narration} />
                  <DetailRow label="Rows" value={String(allocationRows.filter((row) => Number(row.amount || 0) > 0).length || journalLines.length || 0)} />
                </div>
              </Card>
            </div>
          ) : null}

          {activeTab === 'allocation' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h3 className="text-sm font-semibold text-slate-900">Allocation Breakdown</h3>
                <p className="mt-1 text-sm text-slate-500">Head wise transfer allocation stored in the voucher.</p>
              </div>
              <SimpleTable
                headers={['Head', 'Amount', 'Side']}
                rows={allocationTableRows}
                emptyMessage="No allocation rows found."
              />
              <div className="border-t border-slate-100 px-6 py-5 text-right text-sm font-semibold text-slate-900">
                Total Allocation: {formatTransactionAmount(allocationTotal || 0)}
              </div>
            </Card>
          ) : null}

          {activeTab === 'journal' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h3 className="text-sm font-semibold text-slate-900">Journal Lines</h3>
                <p className="mt-1 text-sm text-slate-500">Backend generated debit and credit posting rows.</p>
              </div>
              <SimpleTable
                headers={['Account', 'Narration', 'Side', 'Amount']}
                rows={journalTableRows}
                emptyMessage="No journal lines available."
              />
            </Card>
          ) : null}

          {activeTab === 'attachments' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <DocumentSection
                title=""
                description=""
                definitions={documentDefs}
                documents={record.documents || {}}
                editable={false}
                onDeleteFile={handleDeleteAttachment}
              />
            </Card>
          ) : null}

          {activeTab === 'audit' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Created By" value={record.createdBy} />
                <DetailRow label="Approved By" value={record.approvedBy} />
                <DetailRow label="Branch" value={record.branchCode} />
                <DetailRow label="FY Code" value={record.fyCode} />
                <DetailRow label="Created At" value={record.createdAt} />
                <DetailRow label="Updated At" value={record.updatedAt} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal open={editorOpen} onClose={closeEditor} title="Edit Transfer Voucher" width="min(1100px, 96vw)" footer={<div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Cancel</Button>
          <Button type="submit" form="transaction-voucher-form" className="bg-[var(--primary,#1661F6)] text-white hover:opacity-90" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>}>
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          <TransferVoucherTransactionForm
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

      <ConfirmDialog
        open={reverseOpen}
        title="Reverse Transfer Voucher"
        description="This voucher will be reversed and marked accordingly."
        confirmLabel="Reverse"
        onConfirm={confirmReverse}
        onCancel={() => setReverseOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Transfer Voucher"
        description="This transfer voucher will be removed permanently."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

export default TransferVoucherTransactionWorkspaceDetailPage;





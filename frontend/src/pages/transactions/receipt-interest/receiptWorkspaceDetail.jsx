import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, RotateCcw, ShieldCheck, Trash2, Sparkles, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { useAuth } from '../../../context/AuthContext';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { ReceiptVoucherForm } from './receiptForm';
import { getReceiptInterestDocumentDefinitions } from './receiptInterestDocumentUtils';
import { uploadDocumentMap } from '../../master/documentUpload';
import {
  buildTransactionVoucherPayload,
  createTransactionDraftFromRecord,
  formatTransactionAmount,
  getSectionItems,
  getTransactionLedgerLabel,
  getTransactionPartyLabel,
  getVoucherSectionItem,
  getTransactionVoucherTitle
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

function SimpleTable({ headers = [], rows = [], emptyMessage = 'No records found.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[13px]">
        <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-[0.05em] text-[11px]">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3.5">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={row.key || rowIndex} className="hover:bg-slate-50/50">
              {row.cells.map((cell, cellIndex) => <td key={`${row.key || rowIndex}-${cellIndex}`} className="px-4 py-3 text-slate-700">{cell}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-slate-500">{emptyMessage}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ReceiptVoucherWorkspaceDetailPage({ sectionKey, itemKey, detailPathBase }) {
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
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const canWrite = hasPermission('transactions.write');
  const canReverse = hasPermission('transactions.reverse');

  const section = useMemo(() => catalog.find((entry) => entry.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => {
    const items = getSectionItems(catalog, sectionKey);
    return itemKey ? items.filter((entry) => entry.key === itemKey) : items;
  }, [catalog, sectionKey, itemKey]);

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
        toast.error(error.message || 'Unable to load receipt');
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
      toast.success('Receipt updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save receipt');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReverse() {
    if (!record) return;
    try {
      const response = await api.banking.reverseTransactionVoucher(token, record.id);
      setRecord(response.data || response);
      toast.success('Receipt reversed');
    } catch (error) {
      toast.error(error.message || 'Unable to reverse receipt');
    } finally {
      setReverseOpen(false);
    }
  }

  async function confirmDelete() {
    if (!record) return;
    try {
      await api.banking.deleteTransactionVoucher(token, record.id);
      toast.success('Receipt deleted');
      navigate(detailPathBase || '/app/transactions/receipt-interest/receipt-voucher');
    } catch (error) {
      toast.error(error.message || 'Unable to delete receipt');
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
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" /></div>;
  }

  if (!record) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">Transaction not found</div>;
  }

  const title = getTransactionVoucherTitle(record, sectionItems);
  const templateItem = getVoucherSectionItem(record, sectionItems);
  const documentDefs = getReceiptInterestDocumentDefinitions(templateItem?.key || record?.details?.key || 'receipt-voucher');
  const receiptToLabel = getTransactionPartyLabel(record.partyCode, lookups, record.partyType);
  const receiptByLabel = getTransactionLedgerLabel(record.details?.settlementAccount || '', lookups);
  const details = record.details || {};
  const journalLines = Array.isArray(record.journalLines) ? record.journalLines : [];
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Sparkles },
    { id: 'receipt', label: 'Receipt', icon: WalletCards },
    { id: 'journal', label: 'Journal', icon: FileText, badge: journalLines.length ? String(journalLines.length) : '' },
    { id: 'attachments', label: 'Attachments', icon: FileText, badge: Object.keys(record.documents || {}).length ? String(Object.keys(record.documents || {}).length) : '' },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 print:hidden">
        <button type="button" onClick={() => navigate(detailPathBase || '/app/transactions/receipt-interest/receipt-voucher')} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">{section?.label || sectionKey} Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 bg-white px-8 py-10 text-slate-900 border-b border-slate-100">
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
                <Button type="button" variant="outline" onClick={() => window.print()} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4">
                  Print
                </Button>
                {canReverse && String(record.status || '').toLowerCase() === 'posted' ? (
                  <Button type="button" variant="outline" onClick={() => setReverseOpen(true)} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4">
                    <RotateCcw size={16} /> Reverse
                  </Button>
                ) : null}
                {canWrite ? (
                  <Button type="button" variant="outline" onClick={openEditor} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4 bg-slate-50">
                    <Edit2 size={16} /> Edit Transaction
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-200 px-8 pt-4 overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[14px] font-medium transition-colors text-[var(--primary)]">
              {tab.icon && <tab.icon size={15} className="mb-0.5" />}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-8 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Voucher No" value={record.voucherNo} />
                <DetailRow label="Date" value={record.date} />
                <DetailRow label="Category" value={record.voucherCategory} />
                <DetailRow label="Receipt To" value={receiptToLabel} />
                <DetailRow label="Receipt By" value={receiptByLabel} />
                <DetailRow label="Branch" value={record.branchCode} />
                <DetailRow label="FY Code" value={record.fyCode} />
                <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
              </div>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Amount" value={formatTransactionAmount(record.amount ?? 0)} />
                <DetailRow label="Mode" value={record.mode} />
                <DetailRow label="Reference No" value={record.referenceNo} />
                <DetailRow label="Instrument No" value={record.instrumentNo} />
                <DetailRow label="Instrument Date" value={record.instrumentDate} />
                <DetailRow label="Approved By" value={record.approvedBy} />
                <DetailRow label="Created By" value={record.createdBy} />
                <DetailRow label="Narration" value={record.narration} />
              </div>
            </Card>
          </div>

          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100 px-6">
              <DetailRow label="Receipt By" value={details.settlementAccount} />
              <DetailRow label="Receipt To" value={record.partyCode} />
              <DetailRow label="Total Amount" value={formatTransactionAmount(record.amount ?? 0)} />
            </div>
          </Card>

          {journalLines.length ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <SimpleTable
                headers={['Ledger', 'Debit', 'Credit', 'Memo']}
                rows={journalLines.map((line, index) => ({
                  key: `${line.ledgerCode}-${index}`,
                  cells: [line.ledgerCode, formatTransactionAmount(line.dr || 0), formatTransactionAmount(line.cr || 0), line.memo || '-']
                }))}
                emptyMessage="No journal lines available."
              />
            </Card>
          ) : null}

          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
            <DocumentSection title="" description="" definitions={documentDefs} documents={record.documents || {}} editable={false} onDeleteFile={async () => {}} />
          </Card>
        </div>
      </div>

      <Modal open={editorOpen} onClose={closeEditor} title="Edit Receipt" size="xl">
        {draft ? <ReceiptVoucherForm section={section} lookups={lookups} value={draft} setValue={setDraft} onSubmit={saveVoucher} onDocumentRemove={handleDocumentRemove} /> : null}
      </Modal>

      <ConfirmDialog open={reverseOpen} title="Reverse receipt" description="This receipt will be reversed and marked accordingly." confirmLabel="Reverse" onConfirm={confirmReverse} onClose={() => setReverseOpen(false)} />
      <ConfirmDialog open={deleteOpen} title="Delete receipt" description="This receipt will be removed permanently." confirmLabel="Delete" onConfirm={confirmDelete} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

export default ReceiptVoucherWorkspaceDetailPage;




import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, Layers3, RotateCcw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { useAuth } from '../../../context/AuthContext';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { BankTransactionForm } from './form';
import { getBankTransactionTypeByKey } from './bankConfig';
import { getBankDocumentDefinitions } from './bankDocumentUtils';
import { uploadDocumentMap } from '../../master/documentUpload';
import {
  buildTransactionVoucherPayload,
  createTransactionDraftFromRecord,
  formatTransactionAmount,
  getSectionItems,
  getTransactionLedgerLabel,
  getTransactionPartyLabel,
  getTransactionVoucherTitle
} from './transactionUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '-'}</div>
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

function getPrimitiveEntries(details = {}) {
  const entries = [];
  Object.entries(details || {}).forEach(([key, value]) => {
    if (['components', 'recoveryLines', 'allocations'].includes(key)) return;
    if (value == null || value === '' || typeof value === 'object') return;
    entries.push({ label: key, value: String(value) });
  });
  const components = details.components || {};
  Object.entries(components).forEach(([key, value]) => {
    if (value === '' || value == null) return;
    entries.push({ label: `components.${key}`, value: String(value) });
  });
  return entries;
}

function toTitleCase(value = '') {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (match) => match.toUpperCase());
}

export function BankTransactionWorkspaceDetailPage({ sectionKey, itemKey = '', detailPathBase = '/app/transactions/bank' }) {
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

  const section = useMemo(() => catalog.find((item) => item.key === sectionKey) || null, [catalog, sectionKey]);
  const sectionItems = useMemo(() => getSectionItems(catalog, sectionKey), [catalog, sectionKey]);
  const activeItem = useMemo(() => getBankTransactionTypeByKey(itemKey) || sectionItems.find((item) => item.key === itemKey) || null, [itemKey, sectionItems]);
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
        toast.error(error.message || 'Unable to load transaction');
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
      const uploadedDocuments = await uploadDocumentMap(token, draft.documents || {}, { moduleName: 'transactions', entityId: nextRecord.id });
      if (Object.keys(uploadedDocuments).length || removedDocumentIds.length) {
        const updateResponse = await api.banking.updateTransactionVoucher(token, nextRecord.id, { documents: uploadedDocuments });
        nextRecord = updateResponse.data || nextRecord;
      }
      if (removedDocumentIds.length > 0) {
        await Promise.allSettled(removedDocumentIds.map((fileId) => api.files.remove(token, fileId)));
      }
      setRecord(nextRecord);
      toast.success('Transaction updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save transaction');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReverse() {
    if (!record) return;
    try {
      const response = await api.banking.reverseTransactionVoucher(token, record.id);
      setRecord(response.data || response);
      toast.success('Transaction reversed');
    } catch (error) {
      toast.error(error.message || 'Unable to reverse transaction');
    } finally {
      setReverseOpen(false);
    }
  }

  async function confirmDelete() {
    if (!record) return;
    try {
      await api.banking.deleteTransactionVoucher(token, record.id);
      toast.success('Transaction deleted');
      navigate(detailPathBase);
    } catch (error) {
      toast.error(error.message || 'Unable to delete transaction');
    } finally {
      setDeleteOpen(false);
    }
  }

  function handleDocumentRemove(_key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
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

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" /></div>;
  }

  if (!record) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">Transaction not found</div>;
  }

  const title = getTransactionVoucherTitle(record, sectionItems, itemKey);
  const templateItem = activeItem || sectionItems.find((item) => item.key === record?.details?.key) || null;
  const documentDefs = getBankDocumentDefinitions(templateItem?.key || record?.details?.key || itemKey || '');
  const partyLabel = getTransactionPartyLabel(record.partyCode, lookups, record.partyType);
  const settlementLabel = getTransactionLedgerLabel(record.details?.settlementAccount || record.details?.ledgerTarget || record.details?.depositIn || record.details?.fromAccount || '', lookups);
  const mainAmount = formatTransactionAmount(record.amount ?? 0);
  const details = record.details || {};
  const primitiveEntries = getPrimitiveEntries(details);
  const attachmentsCount = Object.keys(record.documents || {}).length;
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Sparkles },
    { id: 'meta', label: 'Meta Details', icon: Layers3 },
    { id: 'attachments', label: 'Attachments', icon: FileText, badge: attachmentsCount ? String(attachmentsCount) : '' },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 print:hidden">
        <button type="button" onClick={() => navigate(detailPathBase)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900"><ArrowLeft size={14} /> Back</button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">{activeItem?.label || section?.label || sectionKey} Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 border-b border-slate-100 bg-white px-8 py-10 text-slate-900">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]"><FileText size={28} strokeWidth={1.8} /></div>
              <div>
                <p className="mb-1 text-[13px] font-semibold tracking-wider text-[var(--primary)] uppercase">{record.voucherNo || 'Voucher Detail'}</p>
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Button type="button" variant="outline" onClick={() => window.print()} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4">Print</Button>
              {canReverse && String(record.status || '').toLowerCase() === 'posted' ? <Button type="button" variant="outline" onClick={() => setReverseOpen(true)} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4"><RotateCcw size={16} /> Reverse</Button> : null}
              {canWrite ? <Button type="button" variant="outline" onClick={openEditor} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4 bg-slate-50"><Edit2 size={16} /> Edit Transaction</Button> : null}
              {canWrite ? <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold text-sm h-10 px-4"><Trash2 size={16} /> Delete</Button> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5 overflow-x-auto rounded-[14px] border border-slate-100 bg-slate-50/80 px-5 py-3 shadow-sm">
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Amount</p><p className="mt-0.5 text-base font-bold text-slate-900">{mainAmount}</p></div>
            <div className="w-px h-8 bg-slate-200" />
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</p><p className="mt-0.5 text-base font-bold text-slate-900"><StatusBadge status={record.status} /></p></div>
            <div className="w-px h-8 bg-slate-200" />
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Type</p><p className="mt-0.5 text-base font-bold text-slate-900">{record.transactionType || '-'}</p></div>
          </div>
        </div>

        <div className="flex overflow-x-auto border-b border-slate-200 px-8 pt-4 hide-scrollbar">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[14px] font-medium transition-colors ${activeTab === tab.id ? 'text-[var(--primary)]' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab.icon && <tab.icon size={15} className="mb-0.5" />}
              {tab.label}
              {tab.badge ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{tab.badge}</span> : null}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--primary)]" />}
            </button>
          ))}
        </div>

        <div className="space-y-6 p-8">
          {activeTab === 'overview' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Voucher No" value={record.voucherNo} />
                <DetailRow label="Date" value={record.date} />
                <DetailRow label="Category" value={record.voucherCategory} />
                <DetailRow label="Transaction Type" value={record.transactionType} />
                <DetailRow label="Party Type" value={record.partyType} />
                <DetailRow label="Party" value={partyLabel} />
                <DetailRow label="Reference / Instrument" value={record.referenceNo || record.instrumentNo || '-'} />
                <DetailRow label="Bank A/c" value={settlementLabel} />
                <DetailRow label="Branch" value={record.branchCode} />
                <DetailRow label="FY Code" value={record.fyCode} />
                <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
              </div>
            </Card>
          ) : null}

          {activeTab === 'meta' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Amount" value={mainAmount} />
                <DetailRow label="Mode" value={record.mode} />
                <DetailRow label="Reference No" value={record.referenceNo} />
                <DetailRow label="Instrument No" value={record.instrumentNo} />
                <DetailRow label="Instrument Date" value={record.instrumentDate} />
                <DetailRow label="Approved By" value={record.approvedBy} />
                <DetailRow label="Created By" value={record.createdBy} />
                <DetailRow label="Narration" value={record.narration} />
              </div>
            </Card>
          ) : null}

          {activeTab === 'attachments' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <DocumentSection title="" description="" definitions={documentDefs} documents={record.documents || {}} editable={false} onDeleteFile={handleDeleteAttachment} />
            </Card>
          ) : null}

          {activeTab === 'audit' ? (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Voucher No" value={record.voucherNo} />
                  <DetailRow label="Category" value={record.voucherCategory} />
                  <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
                  <DetailRow label="Created By" value={record.createdBy || '-'} />
                  <DetailRow label="Approved By" value={record.approvedBy || '-'} />
                  <DetailRow label="Party Type" value={record.partyType} />
                  <DetailRow label="Branch" value={record.branchCode || '-'} />
                  <DetailRow label="FY Code" value={record.fyCode || '-'} />
                  <DetailRow label="Transaction Type" value={record.transactionType || '-'} />
                </div>
              </Card>

              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="px-6 py-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {primitiveEntries.length ? primitiveEntries.map((entry) => (
                      <div key={entry.label} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{toTitleCase(entry.label)}</p>
                        <p className="mt-1 text-[14px] font-semibold text-slate-900">{entry.value}</p>
                      </div>
                    )) : <div className="md:col-span-2"><EmptyState title="No extra payload" description="This voucher currently has no additional nested payload fields." /></div>}
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <Modal open={editorOpen} title={`Edit ${draft?.voucherCategory || activeItem?.label || 'Transaction'}`} onClose={closeEditor} width="min(1100px, 96vw)" footer={<div className="flex w-full justify-end gap-3"><Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button><Button type="submit" form="transaction-voucher-form" disabled={saving} className="bg-[#1661F6] text-white hover:bg-blue-700">{saving ? 'Saving...' : 'Save Changes'}</Button></div>}>
        <BankTransactionForm section={{ ...(section || { items: sectionItems }) }} lookups={lookups} value={draft} setValue={setDraft} onSubmit={saveVoucher} onDocumentRemove={handleDocumentRemove} />
      </Modal>

      <ConfirmDialog open={deleteOpen} title="Delete transaction" description={`Delete ${record.voucherNo || 'this transaction'}?`} confirmLabel="Delete" tone="destructive" onConfirm={confirmDelete} onClose={() => setDeleteOpen(false)} />
      <ConfirmDialog open={reverseOpen} title="Reverse transaction" description={`Reverse ${record.voucherNo || 'this posted transaction'}?`} confirmLabel="Reverse" tone="outline" onConfirm={confirmReverse} onClose={() => setReverseOpen(false)} />
    </div>
  );
}

export default BankTransactionWorkspaceDetailPage;


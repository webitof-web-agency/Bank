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
import { InterestVoucherForm } from './interestForm';
import { getReceiptInterestDocumentDefinitions } from './receiptInterestDocumentUtils';
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

export function InterestVoucherWorkspaceDetailPage({ sectionKey, itemKey, detailPathBase }) {
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
        toast.error(error.message || 'Unable to load interest');
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
      toast.success('Interest updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save interest');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReverse() {
    if (!record) return;
    try {
      const response = await api.banking.reverseTransactionVoucher(token, record.id);
      setRecord(response.data || response);
      toast.success('Interest reversed');
    } catch (error) {
      toast.error(error.message || 'Unable to reverse interest');
    } finally {
      setReverseOpen(false);
    }
  }

  async function confirmDelete() {
    if (!record) return;
    try {
      await api.banking.deleteTransactionVoucher(token, record.id);
      toast.success('Interest deleted');
      navigate(detailPathBase || '/app/transactions/receipt-interest/interest-paid-member');
    } catch (error) {
      toast.error(error.message || 'Unable to delete interest');
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
  const templateItem = sectionItems.find((item) => item.key === (record?.details?.key || itemKey)) || sectionItems[0] || null;
  const documentDefs = getReceiptInterestDocumentDefinitions(templateItem?.key || record?.details?.key || 'interest-paid-member');
  const selectedMember = (lookups.members || []).find((member) => String(member.code || '').trim().toUpperCase() === String(record.partyCode || '').trim().toUpperCase()) || null;
  const accountHead = getTransactionLedgerLabel(record.details?.accountHead || '', lookups);
  const journalLines = Array.isArray(record.journalLines) ? record.journalLines : [];
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Sparkles },
    { id: 'interest', label: 'Interest', icon: WalletCards },
    { id: 'journal', label: 'Journal', icon: FileText, badge: journalLines.length ? String(journalLines.length) : '' },
    { id: 'attachments', label: 'Attachments', icon: FileText, badge: Object.keys(record.documents || {}).length ? String(Object.keys(record.documents || {}).length) : '' },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  const overviewRows = [
    { label: 'Voucher No', value: record.voucherNo },
    { label: 'Date', value: record.date },
    { label: 'Category', value: record.voucherCategory },
    { label: 'Member', value: selectedMember ? `${selectedMember.code} - ${selectedMember.name || ''}`.trim() : record.partyCode },
    { label: 'Account Head', value: accountHead },
    { label: 'Amount', value: formatTransactionAmount(record.amount ?? 0) },
    { label: 'Interest', value: formatTransactionAmount(record.details?.interestAmount ?? 0) },
    { label: 'Status', value: <StatusBadge status={record.status} /> }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 print:hidden">
        <button type="button" onClick={() => navigate(detailPathBase || '/app/transactions/receipt-interest/interest-paid-member')} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
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
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[14px] font-medium transition-colors ${activeTab === tab.id ? 'text-[var(--primary)]' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab.icon && <tab.icon size={15} className="mb-0.5" />}
              {tab.label}
              {tab.badge ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{tab.badge}</span> : null}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--primary)]" />}
            </button>
          ))}
        </div>

        <div className="p-8 space-y-6">
          {activeTab === 'overview' ? (
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  {overviewRows.map((row) => <DetailRow key={row.label} label={row.label} value={row.value} />)}
                </div>
              </Card>

              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Party Type" value={record.partyType} />
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
          ) : null}

          {activeTab === 'interest' ? (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Member Code" value={selectedMember?.code || record.partyCode} />
                  <DetailRow label="Member Name" value={selectedMember?.name} />
                  <DetailRow label="Branch" value={selectedMember?.branchCode || selectedMember?.branch} />
                  <DetailRow label="Designation" value={selectedMember?.designation} />
                  <DetailRow label="Account Head" value={record.details?.accountHead} />
                  <DetailRow label="Amount" value={formatTransactionAmount(record.amount ?? 0)} />
                  <DetailRow label="Interest" value={formatTransactionAmount(record.details?.interestAmount ?? 0)} />
                </div>
              </Card>

              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
                  <DetailRow label="Receipt Date" value={record.date} />
                  <DetailRow label="Narration" value={record.narration} />
                  <DetailRow label="Branch Code" value={record.branchCode || '—'} />
                  <DetailRow label="FY Code" value={record.fyCode || '—'} />
                </div>
              </Card>
            </div>
          ) : null}

          {activeTab === 'journal' ? (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Journal Lines" value={journalLines.length} />
                  <DetailRow label="Main Amount" value={formatTransactionAmount(record.amount ?? 0)} />
                  <DetailRow label="Posted Status" value={<StatusBadge status={record.status} />} />
                  <DetailRow label="Reversal Of" value={record.reversalOf || '—'} />
                </div>
              </Card>

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
            </div>
          ) : null}

          {activeTab === 'attachments' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <DocumentSection title="" description="" definitions={documentDefs} documents={record.documents || {}} editable={false} onDeleteFile={async () => {}} />
            </Card>
          ) : null}

          {activeTab === 'audit' ? (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Voucher No" value={record.voucherNo} />
                  <DetailRow label="Category" value={record.voucherCategory} />
                  <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
                  <DetailRow label="Created By" value={record.createdBy || '—'} />
                  <DetailRow label="Approved By" value={record.approvedBy || '—'} />
                  <DetailRow label="Party Type" value={record.partyType} />
                  <DetailRow label="Branch" value={record.branchCode || '—'} />
                  <DetailRow label="FY Code" value={record.fyCode || '—'} />
                  <DetailRow label="Transaction Type" value={record.transactionType || '—'} />
                  <DetailRow label="Reversal Of" value={record.reversalOf || '—'} />
                </div>
              </Card>

              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-4 md:grid-cols-2 px-6 py-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Member</p>
                    <p className="mt-1 text-[14px] font-semibold text-slate-900">{selectedMember?.code ? `${selectedMember.code} - ${selectedMember.name || ''}`.trim() : record.partyCode || '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Interest</p>
                    <p className="mt-1 text-[14px] font-semibold text-slate-900">{formatTransactionAmount(record.details?.interestAmount ?? 0)}</p>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <Modal 
        open={editorOpen} 
        onClose={closeEditor} 
        title="Edit Interest" 
        width="min(1100px, 96vw)"
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="transaction-voucher-form" disabled={saving || !canWrite} className="bg-[var(--primary,#1661F6)] text-white hover:opacity-90">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? <InterestVoucherForm section={section} lookups={lookups} value={draft} setValue={setDraft} onSubmit={saveVoucher} onDocumentRemove={handleDocumentRemove} /> : null}
      </Modal>

      <ConfirmDialog open={reverseOpen} title="Reverse interest" description="This interest will be reversed and marked accordingly." confirmLabel="Reverse" onConfirm={confirmReverse} onClose={() => setReverseOpen(false)} />
      <ConfirmDialog open={deleteOpen} title="Delete interest" description="This interest will be removed permanently." confirmLabel="Delete" onConfirm={confirmDelete} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

export default InterestVoucherWorkspaceDetailPage;


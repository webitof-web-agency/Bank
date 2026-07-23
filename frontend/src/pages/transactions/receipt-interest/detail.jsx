import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, Layers3, RotateCcw, Sparkles, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/overlays/ConfirmDialog';
import { useAuth } from '../../../context/AuthContext';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { ReceiptInterestTransactionForm } from './form';
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
import { toneClassName } from './transactionUtils';
import { TRANSACTION_DOCUMENT_DEFS } from '../transactionDocumentUtils';

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
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium ${className}`}>
      {status || 'Draft'}
    </span>
  );
}

function TabButton({ active, label, icon: Icon, onClick, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
        active ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon size={14} />
      {label}
      {badge ? (
        <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${active ? 'border-blue-200 bg-white text-blue-600' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
          {badge}
        </span>
      ) : null}
    </button>
  );
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
                <td key={`${row.key || rowIndex}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                  {cell}
                </td>
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

function getPrimitiveEntries(details = {}) {
  const entries = [];
  Object.entries(details || {}).forEach(([key, value]) => {
    if (key === 'components' || key === 'recoveryLines' || key === 'allocations') return;
    if (value == null || value === '') return;
    if (typeof value === 'object') return;
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

export function ReceiptInterestTransactionDetailPage({ sectionKey }) {
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
      navigate(`/app/transactions/${sectionKey}`);
    } catch (error) {
      toast.error(error.message || 'Unable to delete transaction');
    } finally {
      setDeleteOpen(false);
    }
  }

  function exportCsv() {
    const headers = ['Field', 'Value'];
    const rows = [
      ['Voucher No', record.voucherNo],
      ['Date', record.date],
      ['Category', record.voucherCategory],
      ['Transaction Type', record.transactionType],
      ['Party Type', record.partyType],
      ['Party', getTransactionPartyLabel(record.partyCode, lookups, record.partyType)],
      ['Settlement', getTransactionLedgerLabel(record.details?.settlementAccount || record.details?.ledgerTarget || record.details?.depositIn || record.details?.fromAccount || '', lookups)],
      ['Branch', record.branchCode],
      ['FY Code', record.fyCode],
      ['Amount', formatTransactionAmount(record.amount ?? 0)],
      ['Status', record.status],
      ['Mode', record.mode],
      ['Reference No', record.referenceNo],
      ['Instrument No', record.instrumentNo],
      ['Instrument Date', record.instrumentDate],
      ['Approved By', record.approvedBy],
      ['Created By', record.createdBy],
      ['Narration', record.narration]
    ];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${record.voucherNo || 'transaction'}-detail.csv`;
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

  const title = getTransactionVoucherTitle(record, sectionItems);
  const partyLabel = getTransactionPartyLabel(record.partyCode, lookups, record.partyType);
  const settlementLabel = getTransactionLedgerLabel(
    record.details?.settlementAccount || record.details?.ledgerTarget || record.details?.depositIn || record.details?.fromAccount || '',
    lookups
  );
  const mainAmount = formatTransactionAmount(record.amount ?? 0);
  const details = record.details || {};
  const recoveryLines = Array.isArray(details.recoveryLines) ? details.recoveryLines : [];
  const allocations = Array.isArray(details.allocations) ? details.allocations : [];
  const journalLines = Array.isArray(record.journalLines) ? record.journalLines : [];
  const primitiveEntries = getPrimitiveEntries(details);
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Sparkles },
    { id: 'breakdown', label: 'Breakdown', icon: Layers3, badge: recoveryLines.length || allocations.length ? String(recoveryLines.length + allocations.length) : '' },
    { id: 'journal', label: 'Journal', icon: FileText, badge: journalLines.length ? String(journalLines.length) : '' },
    { id: 'attachments', label: 'Attachments', icon: FileText, badge: Object.keys(record.documents || {}).length ? String(Object.keys(record.documents || {}).length) : '' },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  const headerCards = [
    { label: 'Amount', value: mainAmount },
    { label: 'Status', value: record.status || 'Draft' },
    { label: 'Type', value: record.transactionType || 'payment' },
    { label: 'Rows', value: String(journalLines.length || recoveryLines.length || allocations.length || 0) }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <button type="button" onClick={() => navigate(`/app/transactions/${sectionKey}`)} className="inline-flex items-center gap-1.5 hover:text-slate-900">
          <ArrowLeft size={14} />
          Back
        </button>
        <span>/</span>
        <span>{section?.label || sectionKey}</span>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative bg-gradient-to-r from-[#0f172a] via-[#2563eb] to-[#3b82f6] px-6 py-8 text-white md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur">
                <Sparkles size={13} />
                Transaction Detail
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
                <p className="mt-2 max-w-2xl text-sm text-blue-50 md:text-[15px]">{record.voucherNo || 'Voucher detail view'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[420px] lg:grid-cols-4">
              {headerCards.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <Button type="button" onClick={openEditor} className="gap-2">
            <Edit2 size={16} />
            Edit Transaction
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={exportCsv} className="gap-2">
          Export CSV
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()} className="gap-2">
          Print
        </Button>
        {canReverse && String(record.status || '').toLowerCase() === 'posted' ? (
          <Button type="button" variant="outline" onClick={() => setReverseOpen(true)} className="gap-2">
            <RotateCcw size={16} />
            Reverse
          </Button>
        ) : null}
        {canWrite ? (
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)} className="gap-2">
            <Trash2 size={16} />
            Delete
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            label={tab.label}
            icon={tab.icon}
            badge={tab.badge}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">Transaction Info</h2>
              <p className="mt-1 text-sm text-slate-500">Voucher, party, and settlement summary.</p>
            </div>
            <div className="divide-y divide-slate-100 px-6">
              <DetailRow label="Voucher No" value={record.voucherNo} />
              <DetailRow label="Date" value={record.date} />
              <DetailRow label="Category" value={record.voucherCategory} />
              <DetailRow label="Transaction Type" value={record.transactionType} />
              <DetailRow label="Party Type" value={record.partyType} />
              <DetailRow label="Party" value={partyLabel} />
              <DetailRow label="Settlement" value={settlementLabel} />
              <DetailRow label="Branch" value={record.branchCode} />
              <DetailRow label="FY Code" value={record.fyCode} />
              <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
            </div>
          </Card>

          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">Meta</h2>
              <p className="mt-1 text-sm text-slate-500">Amounts and reference values.</p>
            </div>
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
        </div>
      ) : null}

      {activeTab === 'breakdown' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">Structured Details</h2>
              <p className="mt-1 text-sm text-slate-500">Nested fields used for posting and member updates.</p>
            </div>
            <div className="divide-y divide-slate-100 px-6">
              <DetailRow label="Settlement Account" value={details.settlementAccount} />
              <DetailRow label="Ledger Target" value={details.ledgerTarget} />
              <DetailRow label="Receipt By" value={details.receiptBy} />
              <DetailRow label="Deposit By" value={details.depositBy} />
              <DetailRow label="Deposit In" value={details.depositIn} />
              <DetailRow label="From Account" value={details.fromAccount} />
              <DetailRow label="To Account" value={details.toAccount} />
              <DetailRow label="Account Head" value={details.accountHead} />
              <DetailRow label="Component Loan Amt" value={details.components?.loanAmt} />
              <DetailRow label="Component LAD" value={details.components?.lad} />
            </div>
          </Card>

          <div className="space-y-6">
            {recoveryLines.length ? (
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <h2 className="text-lg font-semibold text-slate-900">Recovery Lines</h2>
                  <p className="mt-1 text-sm text-slate-500">Member-wise recovery breakdown.</p>
                </div>
                <SimpleTable
                  headers={['Member', 'Head', 'Amount', 'Memo']}
                  rows={recoveryLines.map((line, index) => ({
                    key: `${line.memberCode || line.member || index}`,
                    cells: [
                      line.memberCode || line.member || '—',
                      line.head || '—',
                      formatTransactionAmount(line.amount ?? line.total ?? 0),
                      line.memo || '—'
                    ]
                  }))}
                  emptyMessage="No recovery lines found."
                />
              </Card>
            ) : null}

            {allocations.length ? (
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <h2 className="text-lg font-semibold text-slate-900">Allocations</h2>
                  <p className="mt-1 text-sm text-slate-500">Transfer voucher allocation rows.</p>
                </div>
                <SimpleTable
                  headers={['Member', 'Head', 'Side', 'Amount']}
                  rows={allocations.map((line, index) => ({
                    key: `${line.memberCode || line.member || index}`,
                    cells: [
                      line.memberCode || line.member || '—',
                      line.head || '—',
                      line.side || '—',
                      formatTransactionAmount(line.amount ?? 0)
                    ]
                  }))}
                  emptyMessage="No allocations found."
                />
              </Card>
            ) : null}

            {!recoveryLines.length && !allocations.length ? (
              <EmptyState
                title="No structured breakdown"
                description="This voucher template does not carry row-based breakdown data."
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'journal' ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">Posting Summary</h2>
              <p className="mt-1 text-sm text-slate-500">Debit and credit totals for the voucher.</p>
            </div>
            <div className="divide-y divide-slate-100 px-6">
              <DetailRow label="Journal Lines" value={journalLines.length} />
              <DetailRow label="Main Amount" value={mainAmount} />
              <DetailRow label="Posted Status" value={<StatusBadge status={record.status} />} />
              <DetailRow label="Reversal Of" value={record.reversalOf || '—'} />
            </div>
          </Card>

          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">Journal Lines</h2>
              <p className="mt-1 text-sm text-slate-500">Posting preview returned by the backend.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-[0.05em] text-[11px]">
                  <tr>
                    <th className="px-4 py-3.5">Ledger</th>
                    <th className="px-4 py-3.5">Debit</th>
                    <th className="px-4 py-3.5">Credit</th>
                    <th className="px-4 py-3.5">Memo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {journalLines.length ? journalLines.map((line, index) => (
                    <tr key={`${line.ledgerCode}-${index}`} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-700">{line.ledgerCode}</td>
                      <td className="px-4 py-3 text-slate-700">{formatTransactionAmount(line.dr || 0)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatTransactionAmount(line.cr || 0)}</td>
                      <td className="px-4 py-3 text-slate-700">{line.memo || '-'}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No journal lines available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'attachments' ? (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-semibold text-slate-900">Attachments</h2>
            <p className="mt-1 text-sm text-slate-500">Voucher files stored in the file manager under the transactions module.</p>
          </div>
          <div className="mt-5">
            <DocumentSection
              title=""
              description=""
              definitions={TRANSACTION_DOCUMENT_DEFS}
              documents={record.documents || {}}
              editable={false}
              onDeleteFile={handleDeleteAttachment}
            />
          </div>
        </Card>
      ) : null}

      {activeTab === 'audit' ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">Audit Summary</h2>
              <p className="mt-1 text-sm text-slate-500">Who created, approved, and posted the voucher.</p>
            </div>
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
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">Structured Payload</h2>
              <p className="mt-1 text-sm text-slate-500">Readable field map without raw JSON.</p>
            </div>
            <div className="px-6">
              <div className="grid gap-4 md:grid-cols-2">
                {primitiveEntries.length ? primitiveEntries.map((entry) => (
                  <div key={entry.label} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{toTitleCase(entry.label)}</p>
                    <p className="mt-1 text-[14px] font-semibold text-slate-900">{entry.value}</p>
                  </div>
                )) : (
                  <div className="md:col-span-2">
                    <EmptyState
                      title="No extra payload"
                      description="This voucher currently has no additional nested payload fields."
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      <Modal
        open={editorOpen}
        title="Edit Transaction"
        subtitle={section?.description || 'Update transaction voucher details.'}
        onClose={closeEditor}
        width="min(1100px, 96vw)"
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="transaction-voucher-form" disabled={saving || !canWrite} className="bg-[#3b79f6] text-white hover:bg-blue-700">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? (
          <ReceiptInterestTransactionForm
            section={section}
            lookups={lookups}
            value={draft}
            setValue={setDraft}
            onSubmit={saveVoucher}
            onDocumentRemove={handleDocumentRemove}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={reverseOpen}
        title="Reverse transaction"
        description={`Reverse ${record.voucherNo || 'this transaction'}?`}
        confirmLabel="Reverse"
        tone="outline"
        onConfirm={confirmReverse}
        onClose={() => setReverseOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete transaction"
        description={`Delete ${record.voucherNo || 'this transaction'}?`}
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={confirmDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}

export default ReceiptInterestTransactionDetailPage;

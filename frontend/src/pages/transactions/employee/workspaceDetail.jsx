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
import { EmployeeTransactionForm } from './form';
import { getEmployeeDocumentDefinitions } from './employeeDocumentUtils';
import { uploadDocumentMap } from '../../master/documentUpload';
import {
  buildTransactionVoucherPayload,
  createTransactionDraftFromRecord,
  filterTransactionRows,
  formatTransactionAmount,
  getEmployeeComponentTotal,
  getSectionItems,
  getTransactionPartyLabel,
  getTransactionVoucherTitle,
  getVoucherSectionItem
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

function toTitleCase(value = '') {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (match) => match.toUpperCase());
}

export function EmployeeTransactionWorkspaceDetailPage({ sectionKey, itemKey }) {
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
        toast.error(error.message || 'Unable to load employee transaction');
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
      toast.success('Employee transaction updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save employee transaction');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReverse() {
    if (!record) return;
    try {
      const response = await api.banking.reverseTransactionVoucher(token, record.id);
      setRecord(response.data || response);
      toast.success('Employee transaction reversed');
    } catch (error) {
      toast.error(error.message || 'Unable to reverse employee transaction');
    } finally {
      setReverseOpen(false);
    }
  }

  async function confirmDelete() {
    if (!record) return;
    try {
      await api.banking.deleteTransactionVoucher(token, record.id);
      toast.success('Employee transaction deleted');
      navigate(`/app/transactions/employee/${itemKey || (getVoucherSectionItem(record, sectionItems)?.key || '')}`);
    } catch (error) {
      toast.error(error.message || 'Unable to delete employee transaction');
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
        Employee transaction not found
      </div>
    );
  }

  const title = getTransactionVoucherTitle(record, sectionItems);
  const templateItem = getVoucherSectionItem(record, sectionItems) || sectionItems[0] || null;
  const documentDefs = getEmployeeDocumentDefinitions(templateItem?.key || record?.details?.key || '');
  const partyLabel = getTransactionPartyLabel(record.partyCode, lookups, record.partyType);
  const mainAmount = formatTransactionAmount(record.amount ?? 0);
  const componentTotal = getEmployeeComponentTotal(record);
  const details = record.details || {};
  const components = details.components || {};
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Sparkles },
    { id: 'breakdown', label: 'Breakdown', icon: Layers3 },
    { id: 'attachments', label: 'Attachments', icon: FileText, badge: Object.keys(record.documents || {}).length ? String(Object.keys(record.documents || {}).length) : '' },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 print:hidden">
        <button type="button" onClick={() => navigate(`/app/transactions/employee/${itemKey || ''}`)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
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

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {canReverse && String(record.status || '').toLowerCase() === 'posted' ? (
                <Button type="button" variant="outline" onClick={() => setReverseOpen(true)} className="gap-2 border-slate-200 text-slate-700">
                  <RotateCcw size={16} />
                  Reverse
                </Button>
              ) : null}
              {canWrite ? (
                <Button type="button" variant="outline" onClick={openEditor} className="gap-2 border-slate-200 text-slate-700">
                  <Edit2 size={16} />
                  Edit Entry
                </Button>
              ) : null}
              {canWrite ? (
                <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)} className="gap-2 border-slate-200 text-slate-700">
                  <Trash2 size={16} />
                  Delete
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Amount', value: mainAmount },
              { label: 'Status', value: <StatusBadge status={record.status} /> },
              { label: 'Mode', value: record.mode || '—' },
              { label: 'Total Head Amount', value: formatTransactionAmount(componentTotal) }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
                <div className="mt-1 text-base font-bold text-slate-900">{item.value}</div>
              </div>
            ))}
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
                  <DetailRow label="Employee Name" value={partyLabel} />
                  <DetailRow label="Branch" value={record.branchCode || '—'} />
                  <DetailRow label="Designation" value={record.designation || '—'} />
                  <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
                </div>
              </Card>

              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Amount" value={mainAmount} />
                  <DetailRow label="Mode" value={record.mode} />
                  <DetailRow label="Instrument No" value={record.instrumentNo} />
                  <DetailRow label="Instrument Date" value={record.instrumentDate} />
                  <DetailRow label="Narration" value={record.narration} />
                </div>
              </Card>
            </div>
          ) : null}

          {activeTab === 'breakdown' ? (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="House Loan" value={formatTransactionAmount(components.house ?? 0)} />
                  <DetailRow label="Vehicle Loan" value={formatTransactionAmount(components.vehicle ?? 0)} />
                  <DetailRow label="Grain Advance" value={formatTransactionAmount(components.grain ?? 0)} />
                  <DetailRow label="Total Amount" value={formatTransactionAmount(componentTotal)} />
                </div>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(details).filter(([key]) => !['components', 'recoveryLines', 'allocations'].includes(key)).map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{toTitleCase(key)}</p>
                        <p className="mt-1 text-[14px] font-semibold text-slate-900">{String(value || '—')}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <EmptyState title="No structured breakdown table" description="Employee vouchers use component amounts instead of a row-based allocation grid." />
              </div>
            </div>
          ) : null}

          {activeTab === 'attachments' ? (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <DocumentSection
                title=""
                description=""
                definitions={documentDefs}
                documents={record.documents || {}}
                editable={false}
                onDeleteFile={async (_key, document) => {
                  if (!canWrite || !document?.fileId || !record) return;
                  try {
                    await api.files.remove(token, document.fileId);
                    const nextDocuments = { ...(record.documents || {}) };
                    Object.keys(nextDocuments).forEach((docKey) => {
                      if (nextDocuments[docKey]?.fileId === document.fileId) {
                        delete nextDocuments[docKey];
                      }
                    });
                    const response = await api.banking.updateTransactionVoucher(token, record.id, { documents: nextDocuments });
                    setRecord(response.data || { ...record, documents: nextDocuments });
                    toast.success('Attachment removed');
                  } catch (error) {
                    toast.error(error.message || 'Unable to remove attachment');
                  }
                }}
              />
            </Card>
          ) : null}

          {activeTab === 'audit' ? (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Voucher No" value={record.voucherNo} />
                  <DetailRow label="Category" value={record.voucherCategory} />
                  <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
                  <DetailRow label="Party Type" value={record.partyType} />
                  <DetailRow label="Branch" value={record.branchCode || '—'} />
                  <DetailRow label="Transaction Type" value={record.transactionType || '—'} />
                  <DetailRow label="Reversal Of" value={record.reversalOf || '—'} />
                </div>
              </Card>

              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="px-6 py-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(details).length ? Object.entries(details).map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{toTitleCase(key)}</p>
                        <p className="mt-1 text-[14px] font-semibold text-slate-900">{typeof value === 'object' ? JSON.stringify(value) : String(value || '—')}</p>
                      </div>
                    )) : (
                      <div className="md:col-span-2">
                        <EmptyState title="No extra payload" description="This voucher currently has no additional nested payload fields." />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        open={editorOpen}
        title={`Edit ${activeItem?.label || 'Employee Transaction'}`}
        subtitle={section?.description || 'Update employee transaction voucher details.'}
        onClose={closeEditor}
        width="min(1100px, 96vw)"
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="transaction-voucher-form" disabled={saving || !canWrite} className="bg-[#1661F6] text-white hover:bg-blue-700">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? (
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
        open={reverseOpen}
        title="Reverse employee transaction"
        description={`Reverse ${record.voucherNo || 'this transaction'}?`}
        confirmLabel="Reverse"
        tone="outline"
        onConfirm={confirmReverse}
        onClose={() => setReverseOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete employee transaction"
        description={`Delete ${record.voucherNo || 'this transaction'}?`}
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={confirmDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}

export default EmployeeTransactionWorkspaceDetailPage;

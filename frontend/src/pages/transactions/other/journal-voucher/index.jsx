import { useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../api/api';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Input } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { Table } from '../../../../components/ui/Table';
import { ConfirmDialog } from '../../../../components/overlays/ConfirmDialog';
import { useAuth } from '../../../../context/AuthContext';
import { useFY } from '../../../../context/FYContext';
import { formatTransactionAmount } from '../transactionUtils';
import { emptyJournalDraft, journalDraftFromRecord, journalPayload, journalTotals } from './journalUtils';

// Transactions -> Other -> Journal Voucher: a balanced entry across any
// ledgers (year-end interest, depreciation, profit appropriation, ...).
export function JournalVoucherPage() {
  const { token, pageAccess } = useAuth();
  const { activeFY } = useFY();
  const { canCreate, canEdit, canDelete } = pageAccess('transactions', 'receipt-interest');
  const [rows, setRows] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [vouchers, lookups] = await Promise.all([
        api.banking.listTransactionVouchers(token, { fyStart: activeFY?.start || '', fyEnd: activeFY?.end || '' }),
        api.banking.getLookups(token)
      ]);
      setRows((vouchers.data || []).filter((row) => row.details?.key === 'journal-voucher'));
      setLedgers(lookups.data?.ledgers || []);
    } catch (error) {
      toast.error(error.message || 'Unable to load journal vouchers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token, activeFY?.start, activeFY?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const ledgerOptions = useMemo(() => ledgers.map((l) => ({ label: `${l.code} - ${l.name}`, value: String(l.code) })), [ledgers]);
  const ledgerName = (code) => ledgers.find((l) => String(l.code) === String(code))?.name || code;
  const totals = editor ? journalTotals(editor.draft.lines) : null;
  const canSave = editor && (editor.id ? canEdit : canCreate) && totals.balanced && totals.debit > 0;

  function setLine(index, patch) {
    setEditor((current) => ({ ...current, draft: { ...current.draft, lines: current.draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) } }));
  }

  async function save(event) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = journalPayload(editor.draft);
      if (editor.id) await api.banking.updateTransactionVoucher(token, editor.id, payload);
      else await api.banking.createTransactionVoucher(token, payload);
      toast.success(editor.id ? 'Journal voucher updated' : 'Journal voucher created');
      setEditor(null);
      await load();
    } catch (error) {
      toast.error(error.message || 'Unable to save the journal voucher');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    try {
      await api.banking.deleteTransactionVoucher(token, deleteTarget.id);
      toast.success('Journal voucher deleted');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(error.message || 'Unable to delete the journal voucher');
    }
  }

  const columns = [
    { key: 'voucherNo', label: 'Voucher No', sortable: true },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'narration', label: 'Narration', render: (row) => <span className="text-slate-700">{row.narration || '-'}{row.details?.system === 'fy-close' ? <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Year-end close</span> : null}</span> },
    { key: 'lines', label: 'Lines', render: (row) => (row.details?.journalLines || []).length },
    { key: 'amount', label: 'Amount', align: 'right', render: (row) => formatTransactionAmount(row.amount ?? 0) },
    {
      key: 'actions', label: 'Actions', sortable: false, align: 'right', render: (row) => {
        // The close's own vouchers change only by reopening the year.
        const system = row.details?.system === 'fy-close';
        return (
          <div className="flex justify-end gap-1">
            {canEdit && !system ? (
              <button type="button" onClick={() => setEditor({ id: row.id, draft: journalDraftFromRecord(row) })} className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                <Edit2 size={16} />
              </button>
            ) : null}
            {canDelete && !system ? (
              <button type="button" onClick={() => setDeleteTarget(row)} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">Other Transactions</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Journal Voucher</h1>
          <p className="mt-1 text-sm text-slate-500">A balanced entry across any ledgers: total debit must equal total credit.</p>
        </div>
        {canCreate ? (
          <Button type="button" className="gap-2" onClick={() => setEditor({ id: null, draft: emptyJournalDraft() })}>
            <Plus size={16} /> New Journal Voucher
          </Button>
        ) : null}
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Table columns={columns} data={rows} emptyMessage={loading ? 'Loading...' : 'No journal vouchers in this year'} />
      </Card>

      <Modal
        open={Boolean(editor)}
        title={editor?.id ? 'Edit Journal Voucher' : 'New Journal Voucher'}
        onClose={() => setEditor(null)}
        footer={(
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm font-medium ${totals?.balanced ? 'text-emerald-600' : 'text-rose-600'}`}>
              {totals ? `Debit ${formatTransactionAmount(totals.debit)} · Credit ${formatTransactionAmount(totals.credit)}${totals.balanced ? '' : ` · Difference ${formatTransactionAmount(Math.abs(totals.debit - totals.credit))}`}` : ''}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
              <Button type="submit" form="journal-voucher-form" disabled={saving || !canSave}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        )}
      >
        {editor ? (
          <form id="journal-voucher-form" className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-slate-700">Date</label>
                <Input type="date" value={editor.draft.date} onChange={(e) => setEditor((c) => ({ ...c, draft: { ...c.draft, date: e.target.value } }))} required />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[13px] font-semibold text-slate-700">Narration</label>
                <Input value={editor.draft.narration} onChange={(e) => setEditor((c) => ({ ...c, draft: { ...c.draft, narration: e.target.value } }))} placeholder="e.g. Depreciation on furniture 2026-27" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_140px_140px_36px] gap-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Ledger</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span />
              </div>
              {editor.draft.lines.map((line, index) => (
                <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_140px_140px_36px] items-center gap-2">
                  <Select searchable options={ledgerOptions} value={line.ledgerCode} onChange={(value) => setLine(index, { ledgerCode: value || '' })} placeholder="Select ledger" />
                  <Input type="number" min="0" step="0.01" className="text-right" value={line.debit} onChange={(e) => setLine(index, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} />
                  <Input type="number" min="0" step="0.01" className="text-right" value={line.credit} onChange={(e) => setLine(index, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} />
                  <button type="button" disabled={editor.draft.lines.length <= 2} onClick={() => setEditor((c) => ({ ...c, draft: { ...c.draft, lines: c.draft.lines.filter((_, i) => i !== index) } }))} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" title="Remove line">
                    <X size={16} />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setEditor((c) => ({ ...c, draft: { ...c.draft, lines: [...c.draft.lines, emptyJournalDraft().lines[0]] } }))}>
                <Plus size={14} /> Add line
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete journal voucher"
        description={deleteTarget ? `Delete journal voucher ${deleteTarget.voucherNo} (${(deleteTarget.details?.journalLines || []).map((l) => ledgerName(l.ledgerCode)).join(', ')})?` : ''}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default JournalVoucherPage;

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../overlays/ConfirmProvider';
import { Modal } from '../ui/Modal';
import { entryVariantFor } from '../../lib/entryVariant';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';

// Edits a voucher that came over from the old software (an archived legacy
// voucher, row.isHistorical) while its FY is open. The server moves the
// balances by the change (archivedVoucher.service), so only what the voucher
// was entered with is shown: its date, cheque, narration and amounts — by
// heads (the total is their sum), by member lines (Recovery) or by total.
// The member / type can't change here: delete it and enter a new one.

const HEAD_LABELS = {
  RLoanAmt: 'Regular Loan',
  DLoanAmt: 'Loan Against Deposit',
  CDAmt: 'Compulsory Deposit',
  SSAamt: 'Special Saving (SSA)',
  ShareAmt: 'Share',
  PremiumAmt: 'Premium',
  HomeLoan: 'Home Loan',
  VehicleLoan: 'Vehicle Loan',
  GrainAdvance: 'Grain Advance'
};
const LINE_COLUMNS = [['Share', 'Share'], ['CD', 'CD'], ['SSA', 'SSA'], ['RLoan', 'Loan'], ['DLoan', 'LAD'], ['Premium', 'Premium'], ['Admission', 'Admission'], ['Suspense', 'Suspense']];

// One formatter for every cell (a monthly recovery has ~560 lines).
const MONEY = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WHOLE = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const money = (value) => MONEY.format(Number(value || 0));
const lineSum = (line = {}) => LINE_COLUMNS.reduce((sum, [field]) => sum + num(line?.[field]), 0);
// The four demand heads always show; the rest only when some line uses them.
const CORE_LINE_COLUMNS = new Set(['CD', 'SSA', 'RLoan', 'DLoan']);
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function canChangeVoucherRow(row) {
  return !row?.isHistorical || row?.details?.archiveEditable === true;
}

// Asks before a change that puts the Trial Balance out (an archived voucher
// whose other side can't be found), then sends it again confirmed.
async function withImbalanceCheck(confirm, send) {
  try {
    return await send(false);
  } catch (error) {
    if (error?.payload?.code !== 'TB_IMBALANCE') throw error;
    const ok = await confirm({ title: 'Trial Balance will not agree', description: error.message, confirmLabel: 'Go ahead', tone: 'danger' });
    if (!ok) return null;
    return send(true);
  }
}

// The list pages' delete: an archived voucher's other side goes with it;
// one without a found side asks first. Returns false when cancelled.
export async function deleteVoucherRow(token, row, confirm) {
  if (!row?.isHistorical) {
    await api.banking.deleteTransactionVoucher(token, row.id);
    return true;
  }
  const result = await withImbalanceCheck(confirm, (accept) => api.banking.deleteTransactionVoucher(token, accept ? `${row.id}?acceptImbalance=1` : row.id));
  return result !== null;
}

export function ArchivedVoucherDialog({ voucher, onClose, onSaved }) {
  const { token } = useAuth();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const open = Boolean(voucher);
  // The pages pass an inline onClose; held in a ref so it doesn't reload.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!voucher) return undefined;
    let cancelled = false;
    setData(null);
    api.banking.getArchivedVoucher(token, voucher.id)
      .then((response) => {
        if (cancelled) return;
        const record = response?.data || response;
        setData(record);
        setForm({
          voucherDate: record.voucherDate || '',
          chequeNo: record.chequeNo || '',
          chequeDate: record.chequeDate || '',
          narration: record.narration || '',
          heads: Object.fromEntries((record.heads || []).map((head) => [head.field, head.value])),
          totalAmt: record.totalAmt
        });
        setLines((record.lines || []).map((line) => ({ ...line })));
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error.message || 'Unable to open the voucher');
          onCloseRef.current();
        }
      });
    return () => { cancelled = true; };
  }, [voucher, token]);

  const total = useMemo(() => {
    if (!data || !form) return 0;
    if (data.enteredBy === 'lines') return lines.reduce((sum, line) => sum + LINE_COLUMNS.reduce((s, [field]) => s + num(line[field]), 0), 0);
    if (data.enteredBy === 'heads') return Object.values(form.heads).reduce((sum, value) => sum + num(value), 0);
    return num(form.totalAmt);
  }, [data, form, lines]);

  // Member lines (Recovery): what changed against the voucher as it was.
  const [lineFilter, setLineFilter] = useState('ALL');
  const originalById = useMemo(() => new Map((data?.lines || []).map((line) => [line.id, line])), [data]);
  const isChanged = (line) => LINE_COLUMNS.some(([field]) => num(line[field]) !== num(originalById.get(line.id)?.[field]));
  const changedCount = lines.filter(isChanged).length;
  const originalTotal = useMemo(() => (data?.lines || []).reduce((sum, line) => sum + lineSum(line), 0), [data]);
  const lineColumns = LINE_COLUMNS.filter(([field]) => CORE_LINE_COLUMNS.has(field)
    || lines.some((line) => num(line[field]) !== 0) || (data?.lines || []).some((line) => num(line[field]) !== 0));
  const columnTotals = Object.fromEntries(lineColumns.map(([field]) => [field, lines.reduce((sum, line) => sum + num(line[field]), 0)]));
  const visibleLines = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lines.filter((line) => (!term || `${line.memberCode} ${line.memberName}`.toLowerCase().includes(term))
      && (lineFilter !== 'CHANGED' || LINE_COLUMNS.some(([field]) => num(line[field]) !== num(originalById.get(line.id)?.[field]))));
  }, [lines, search, lineFilter, originalById]);

  function setLine(id, field, value) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  }

  async function save() {
    const original = new Map((data.lines || []).map((line) => [line.id, line]));
    const payload = {
      voucherDate: form.voucherDate,
      chequeNo: form.chequeNo,
      chequeDate: form.chequeDate,
      narration: form.narration
    };
    if (data.enteredBy === 'heads') payload.amounts = form.heads;
    if (data.enteredBy === 'total') payload.amounts = { TotalAmt: form.totalAmt };
    if (data.enteredBy === 'lines') {
      // Only the lines that changed.
      payload.lines = lines
        .filter((line) => LINE_COLUMNS.some(([field]) => num(line[field]) !== num(original.get(line.id)?.[field])))
        .map((line) => ({ id: line.id, ...Object.fromEntries(LINE_COLUMNS.map(([field]) => [field, num(line[field])])) }));
    }
    setSaving(true);
    try {
      const response = await withImbalanceCheck(confirm, (accept) => api.banking.updateTransactionVoucher(token, voucher.id, { ...payload, acceptImbalance: accept }));
      if (!response) return;
      const partner = response?.data?.partner;
      toast.success(partner ? `Voucher updated, with its ${partner.label} voucher ${partner.voucherNo}` : 'Voucher updated; balances adjusted');
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Unable to update the voucher');
    } finally {
      setSaving(false);
    }
  }

  const field = (key) => ({ value: form?.[key] ?? '', onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })) });

  return (
    <Modal
      // Same colour as the transaction's own Add / Edit form.
      variant={entryVariantFor(voucher)}
      open={open}
      onClose={onClose}
      fill={data?.enteredBy === 'lines'}
      title={`Edit voucher ${data?.voucherNo || voucher?.voucherNo || ''}`}
      subtitle="From the old software. Saving adjusts the member and ledger balances by the change."
      footer={data && form ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-slate-600">Total <strong className="text-slate-900">{money(total)}</strong>{data.enteredBy === 'lines' ? <span className="ml-2 text-slate-500">· {changedCount ? `${changedCount} line(s) changed` : 'no line changed'}</span> : null}</span>
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={saving || !data.editable || !(total > 0)}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      ) : null}
    >
      {!data || !form ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          {!data.editable ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Its financial year is closed, so it can't be changed.</p>
          ) : null}
          {data.editable && data.partner ? (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-[13px] text-blue-800">
              {data.partner.matchedBy === 'date'
                ? <>Its other side is {data.partner.label} voucher {data.partner.voucherNo} (same day and amount): it takes the new date{data.partner.followsAmount ? ' and amount' : ''} too.</>
                : <>Its other side is {data.partner.label} voucher {data.partner.voucherNo} (same cheque): it takes the new date and cheque{data.partner.followsAmount ? ' and amount' : ''} too.</>}
              {data.partner.followsAmount ? '' : ' Its amount is entered by heads, so change it there as well.'}
            </p>
          ) : null}
          {data.editable && !data.partner && !data.selfBalancing ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Its other side is a separate voucher that can't be found. Changing the amount puts the Trial Balance out until that voucher is changed too; you'll be asked first.
            </p>
          ) : null}
          {data.enteredBy === 'lines' ? (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
              <MiniLabel label="Voucher date" className="w-40"><Input className="h-9 text-[13px]" type="date" min={data.fyFrom} max={data.fyTo} {...field('voucherDate')} /></MiniLabel>
              <MiniLabel label="Cheque no." className="w-40"><Input className="h-9 text-[13px]" {...field('chequeNo')} /></MiniLabel>
              <MiniLabel label="Cheque date" className="w-40"><Input className="h-9 text-[13px]" type="date" {...field('chequeDate')} /></MiniLabel>
              <MiniLabel label="Narration" className="min-w-[220px] flex-1"><Input className="h-9 text-[13px]" {...field('narration')} placeholder="Recovery remarks" /></MiniLabel>
              <div className="ml-auto pl-2 text-right">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Total Recovery</div>
                <div className="text-xl font-bold tabular-nums text-slate-900">₹ {WHOLE.format(total)}</div>
              </div>
            </div>
          ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-[13px] font-medium text-slate-700">
              <span>Voucher date</span>
              <Input type="date" min={data.fyFrom} max={data.fyTo} {...field('voucherDate')} />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-slate-700">
              <span>Cheque no.</span>
              <Input {...field('chequeNo')} />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-slate-700">
              <span>Cheque date</span>
              <Input type="date" {...field('chequeDate')} />
            </label>
          </div>
          )}

          {data.enteredBy === 'heads' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {data.heads.map((head) => (
                <label key={head.field} className="space-y-1.5 text-[13px] font-medium text-slate-700">
                  <span>{HEAD_LABELS[head.field] || head.field}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.heads[head.field] ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, heads: { ...current.heads, [head.field]: event.target.value } }))}
                  />
                </label>
              ))}
            </div>
          ) : null}

          {data.enteredBy === 'total' ? (
            <label className="block max-w-xs space-y-1.5 text-[13px] font-medium text-slate-700">
              <span>Amount</span>
              <Input type="number" min="0" step="0.01" {...field('totalAmt')} />
            </label>
          ) : null}

          {data.enteredBy === 'lines' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
                <span className="px-1 text-[13px] font-semibold text-slate-800">{lines.length} member lines</span>
                <div className="w-56"><Input className="h-8 text-[12.5px]" placeholder="Search member..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
                <div className="flex items-center gap-1.5" role="group" aria-label="Filter lines">
                  {[['ALL', 'All', lines.length], ['CHANGED', 'Changed', changedCount]].map(([key, label, count]) => (
                    <button key={key} type="button" aria-pressed={lineFilter === key} onClick={() => setLineFilter(key)}
                      className={`rounded-full border px-3 py-1 text-[12px] font-medium ${lineFilter === key ? 'border-[var(--primary,#2563eb)] bg-[var(--primary,#2563eb)] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                      {label} <span className="tabular-nums opacity-80">{count}</span>
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 pr-1 text-[12px]">
                  <span className="whitespace-nowrap"><span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">Original</span> <span className="text-[14px] font-bold tabular-nums text-slate-900">{WHOLE.format(originalTotal)}</span></span>
                  <span className="whitespace-nowrap"><span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">New</span> <span className="text-[14px] font-bold tabular-nums text-slate-900">{WHOLE.format(total)}</span></span>
                  <span className="whitespace-nowrap"><span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">Change</span> <span className={`text-[14px] font-bold tabular-nums ${Math.round((total - originalTotal) * 100) === 0 ? 'text-slate-400' : 'text-amber-700'}`}>{Math.round((total - originalTotal) * 100) === 0 ? '0' : `${total > originalTotal ? '+' : '−'}${WHOLE.format(Math.abs(total - originalTotal))}`}</span></span>
                </div>
              </div>
              <div className="overflow-auto rounded-xl border border-slate-200 bg-white" style={{ maxHeight: 'calc(96vh - 330px)', minHeight: 240 }}>
                <table className="min-w-full text-left text-[12px]">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                    <tr>
                      <th className="px-2 py-1.5">Member</th>
                      {lineColumns.map(([key, label]) => <th key={key} className="px-2 py-1.5 text-right">{label}</th>)}
                      <th className="px-2 py-1.5 text-right">Total</th>
                      <th className="px-2 py-1.5 text-right">Was</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleLines.map((line) => {
                      const changed = isChanged(line);
                      return (
                        <tr key={line.id} className={changed ? 'bg-amber-50/70 shadow-[inset_3px_0_0_0_#d97706]' : 'hover:bg-slate-50'}>
                          <td className="max-w-[320px] truncate px-2 py-0.5"><span className="font-semibold text-slate-900">{line.memberCode}</span> <span className="text-slate-700">{line.memberName}</span></td>
                          {lineColumns.map(([key]) => (
                            <td key={key} className="px-1 py-0.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                aria-label={`${line.memberCode} ${key}`}
                                className={`h-7 w-24 rounded-md border px-1.5 text-right text-[12px] tabular-nums outline-none focus:border-[var(--primary,#2563eb)] ${num(line[key]) !== num(originalById.get(line.id)?.[key]) ? 'border-amber-400 bg-amber-50' : 'border-[var(--border-input,#cbd5e1)] bg-white'}`}
                                value={line[key] ?? 0}
                                onChange={(event) => setLine(line.id, key, event.target.value)}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-0.5 text-right font-semibold tabular-nums text-slate-900">{WHOLE.format(lineSum(line))}</td>
                          <td className={`px-2 py-0.5 text-right tabular-nums ${changed ? 'text-amber-700' : 'text-slate-300'}`}>{changed ? WHOLE.format(lineSum(originalById.get(line.id))) : '—'}</td>
                        </tr>
                      );
                    })}
                    {!visibleLines.length ? <tr><td colSpan={lineColumns.length + 3} className="px-3 py-6 text-center text-slate-500">{lineFilter === 'CHANGED' ? 'No line changed yet.' : 'No member matches.'}</td></tr> : null}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-100 font-semibold text-slate-800 shadow-[0_-1px_0_0_#e2e8f0]">
                    <tr>
                      <td className="px-2 py-1.5">Total · {lines.length} members</td>
                      {lineColumns.map(([key]) => <td key={key} className="px-2 py-1.5 text-right tabular-nums">{WHOLE.format(columnTotals[key])}</td>)}
                      <td className="px-2 py-1.5 text-right tabular-nums">{WHOLE.format(total)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{WHOLE.format(originalTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : null}

          {data.enteredBy !== 'lines' ? (
            <label className="block space-y-1.5 text-[13px] font-medium text-slate-700">
              <span>Narration</span>
              <Textarea rows={2} {...field('narration')} />
            </label>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export default ArchivedVoucherDialog;

// A small label over a compact field (same strip as Create Recovery).
function MiniLabel({ label, className = '', children }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      {children}
    </div>
  );
}


import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../overlays/ConfirmProvider';
import { Modal } from '../ui/Modal';
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

const money = (value) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  const visibleLines = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return lines;
    return lines.filter((line) => `${line.memberCode} ${line.memberName}`.toLowerCase().includes(term));
  }, [lines, search]);

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
      open={open}
      onClose={onClose}
      wide={data?.enteredBy === 'lines'}
      title={`Edit voucher ${data?.voucherNo || voucher?.voucherNo || ''}`}
      subtitle="From the old software. Saving adjusts the member and ledger balances by the change."
      footer={data && form ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-slate-600">Total <strong className="text-slate-900">{money(total)}</strong></span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
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
              Its other side is {data.partner.label} voucher {data.partner.voucherNo} (same cheque): it takes the new date and cheque{data.partner.followsAmount ? ' and amount' : ''} too.
              {data.partner.followsAmount ? '' : ' Its amount is entered by heads, so change it there as well.'}
            </p>
          ) : null}
          {data.editable && !data.partner && !data.selfBalancing ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Its other side is a separate voucher that can't be found. Changing the amount puts the Trial Balance out until that voucher is changed too; you'll be asked first.
            </p>
          ) : null}
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-slate-700">{lines.length} member lines</span>
                <Input className="max-w-xs" placeholder="Search member..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-2 py-2">Member</th>
                      {LINE_COLUMNS.map(([key, label]) => <th key={key} className="px-2 py-2 text-right">{label}</th>)}
                      <th className="px-2 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLines.map((line) => (
                      <tr key={line.id} className="border-t border-slate-100">
                        <td className="whitespace-nowrap px-2 py-1">{line.memberCode} - {line.memberName}</td>
                        {LINE_COLUMNS.map(([key]) => (
                          <td key={key} className="px-1 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-24 rounded border border-slate-200 px-1.5 py-1 text-right"
                              value={line[key] ?? 0}
                              onChange={(event) => setLine(line.id, key, event.target.value)}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-right font-medium">{money(LINE_COLUMNS.reduce((sum, [key]) => sum + num(line[key]), 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <label className="block space-y-1.5 text-[13px] font-medium text-slate-700">
            <span>Narration</span>
            <Textarea rows={2} {...field('narration')} />
          </label>
        </div>
      )}
    </Modal>
  );
}

export default ArchivedVoucherDialog;

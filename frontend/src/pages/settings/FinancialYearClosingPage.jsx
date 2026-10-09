import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Lock, LockOpen, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import {
  INTEREST_HEAD_LABELS,
  appropriationPayload,
  appropriationState,
  formatAmount,
  formatDate,
  profitToAppropriate,
  yearStatusLabel
} from './fyClosing/fyClosingUtils';

const STATUS_TONE = {
  legacy: 'border-slate-200 bg-slate-50 text-slate-600',
  CLOSED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  OPEN: 'border-amber-200 bg-amber-50 text-amber-700'
};

function Notice({ tone = 'amber', children }) {
  const tones = {
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-800'
  };
  return <div className={`rounded-xl border px-4 py-3 text-[13px] ${tones[tone]}`}>{children}</div>;
}

// Settings -> Financial Year Closing. The old software started a new
// database every year; here closing a year does that job: it posts the
// year-end interest and the profit appropriation, carries every balance and
// the interest into the next year, and locks the year.
export function FinancialYearClosingPage() {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('settings.write');
  const [years, setYears] = useState(null);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [rows, setRows] = useState([{ ledgerCode: '', amount: '' }]);
  const [includeEmployeeInterest, setIncludeEmployeeInterest] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const loadYears = useCallback(async () => {
    try {
      const response = await api.fyClosing.list(token);
      setYears(response.data);
      return response.data;
    } catch (error) {
      toast.error(error.message || 'Unable to load financial years');
      return null;
    }
  }, [token]);

  useEffect(() => {
    loadYears().then((data) => {
      const firstOpen = data?.years.find((y) => y.source === 'app' && y.status === 'OPEN');
      setSelected(firstOpen?.fy || data?.years.at(-1)?.fy || '');
    });
  }, [loadYears]);

  const year = years?.years.find((y) => y.fy === selected) || null;

  const loadPreview = useCallback(async () => {
    if (!year || year.source !== 'app' || year.status !== 'OPEN') return;
    setPreviewing(true);
    try {
      const response = await api.fyClosing.preview(token, year.fy);
      setPreview(response.data);
    } catch (error) {
      toast.error(error.message || 'Unable to prepare the close');
    } finally {
      setPreviewing(false);
    }
  }, [token, year]);

  useEffect(() => {
    setPreview(null);
    setRows([{ ledgerCode: '', amount: '' }]);
    setIncludeEmployeeInterest(true);
    setRemarks('');
    loadPreview();
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const profit = profitToAppropriate(preview, includeEmployeeInterest);
  const appropriation = appropriationState(rows, profit);
  const fundOptions = useMemo(() => (preview?.funds || []).map((f) => ({ label: `${f.code} - ${f.name}`, value: f.code })), [preview]);
  const canClose = canWrite && preview?.canClose && appropriation.balanced;

  async function handleClose() {
    setBusy(true);
    try {
      await api.fyClosing.close(token, selected, { appropriation: appropriationPayload(rows), remarks, includeEmployeeInterest });
      toast.success(`FY ${selected} closed. Its balances and interest are carried into the next year.`);
      setConfirming(false);
      await loadYears();
      setPreview(null);
    } catch (error) {
      toast.error(error.message || 'Unable to close the year');
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen() {
    setBusy(true);
    try {
      await api.fyClosing.reopen(token, selected, reason);
      toast.success(`FY ${selected} reopened. The year-end entries and carry-forward were removed.`);
      setReopening(false);
      setReason('');
      await loadYears();
      await loadPreview();
    } catch (error) {
      toast.error(error.message || 'Unable to reopen the year');
    } finally {
      setBusy(false);
    }
  }

  const yearColumns = [
    { key: 'fy', label: 'Financial Year', render: (row) => <span className="font-semibold text-slate-900">{row.fy}</span> },
    { key: 'status', label: 'Status', render: (row) => <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${STATUS_TONE[row.source === 'legacy' ? 'legacy' : row.status]}`}>{yearStatusLabel(row)}</span> },
    { key: 'closedAt', label: 'Closed On', render: (row) => (row.closedAt ? formatDate(row.closedAt) : '—') },
    { key: 'action', label: '', align: 'right', render: (row) => (row.source === 'app' ? (
      <Button type="button" size="sm" variant={row.fy === selected ? 'primary' : 'outline'} onClick={() => setSelected(row.fy)}>{row.status === 'CLOSED' ? 'View' : 'Close year'}</Button>
    ) : null) }
  ];

  const eligibleMembers = (preview?.members || []).filter((m) => m.eligible);
  const shownMembers = eligibleMembers.filter((m) => !memberSearch || `${m.memberCode} ${m.name}`.toLowerCase().includes(memberSearch.toLowerCase()));
  const memberColumns = [
    { key: 'memberCode', label: 'Code', sortable: true },
    { key: 'name', label: 'Member', sortable: true, render: (row) => <span>{row.name}{row.noInterest ? <span className="ml-2 text-[11px] text-amber-700">(no interest)</span> : null}</span> },
    { key: 'cd', label: 'CD Int', align: 'right', sortValue: (row) => row.interest.cd, render: (row) => formatAmount(row.interest.cd) },
    { key: 'ssa', label: 'SSA Int', align: 'right', sortValue: (row) => row.interest.ssa, render: (row) => formatAmount(row.interest.ssa) },
    { key: 'loan', label: 'Loan Int', align: 'right', sortValue: (row) => row.interest.loan, render: (row) => formatAmount(row.interest.loan) },
    { key: 'dloan', label: 'LAD Int', align: 'right', sortValue: (row) => row.interest.dloan, render: (row) => formatAmount(row.interest.dloan) }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900"><CalendarClock className="text-[var(--primary)]" /> Financial Year Closing</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          The old software started a new database every year. Here, closing a year does that job: it posts the year-end interest and the profit
          appropriation (31 March), carries every member&apos;s and employee&apos;s balance plus interest into the next year, starts Income and Expense
          at zero, and locks the year. A closed year can be reopened to correct it.
        </p>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Table columns={yearColumns} data={(years?.years || []).map((y) => ({ ...y, id: y.fy }))} emptyMessage="Loading..." defaultRowsPerPage={20} />
      </Card>

      {year && year.source === 'app' && year.status === 'CLOSED' ? (
        <Card className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Lock size={18} className="text-emerald-600" /> FY {year.fy} is closed</h2>
              <p className="mt-1 text-sm text-slate-500">Closed on {formatDate(year.closedAt)}{year.remarks ? ` · ${year.remarks}` : ''}. No entry dated in this year can be added, changed or deleted.</p>
            </div>
            {canWrite ? <Button type="button" variant="outline" className="gap-2" onClick={() => setReopening(true)}><LockOpen size={16} /> Reopen year</Button> : null}
          </div>
          {year.summary ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-slate-700">Interest posted</p>
                {Object.entries(year.summary.totals || {}).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4"><span className="text-slate-600">{INTEREST_HEAD_LABELS[k] || k}</span><span className="font-medium">{formatAmount(v)}</span></div>
                ))}
                {!year.summary.employeeInterestIncluded ? <p className="text-[12px] text-slate-500">Staff loan interest was not included.</p> : null}
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-slate-700">{year.summary.profit >= 0 ? 'Net profit' : 'Net loss'} {formatAmount(Math.abs(year.summary.profit))} appropriated to</p>
                {(year.summary.appropriation || []).map((row) => (
                  <div key={row.ledgerCode} className="flex justify-between gap-4"><span className="text-slate-600">Ledger {row.ledgerCode}</span><span className="font-medium">{formatAmount(row.amount)}</span></div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {year && year.source === 'app' && year.status === 'OPEN' ? (
        <Card className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Close FY {year.fy}</h2>
            <Button type="button" variant="outline" className="gap-2" onClick={loadPreview} disabled={previewing}><RefreshCw size={16} className={previewing ? 'animate-spin' : ''} /> {previewing ? 'Calculating...' : 'Recalculate'}</Button>
          </div>

          {!preview ? <p className="text-sm text-slate-500">{previewing ? 'Calculating every member\'s interest...' : 'No preview yet.'}</p> : (
            <>
              {preview.blockers.length ? <Notice tone="rose"><p className="font-semibold">The year cannot be closed yet:</p><ul className="ml-4 list-disc">{preview.blockers.map((b) => <li key={b}>{b}</li>)}</ul></Notice> : null}
              {preview.warnings.map((w) => <Notice key={w}>{w}</Notice>)}

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">Year-end interest (Journal Voucher dated {formatDate(preview.end)})</p>
                  <p className="text-[12px] text-slate-500">Calculated the way the old software did, at CD {preview.rates.cd}%, SSA {preview.rates.ssa}%, loan {preview.rates.loan}%, LAD {preview.rates.dloan}% for {eligibleMembers.length} active members.</p>
                  {['cd', 'ssa', 'loan', 'dloan'].map((k) => (
                    <div key={k} className="flex justify-between gap-4 text-sm"><span className="text-slate-600">{INTEREST_HEAD_LABELS[k]}</span><span className="font-medium">{formatAmount(preview.totals[k])}</span></div>
                  ))}
                  <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input type="checkbox" className="mt-1" checked={includeEmployeeInterest} onChange={(e) => setIncludeEmployeeInterest(e.target.checked)} />
                      <span>Include staff loan interest: housing {formatAmount(preview.totals.housing)}, vehicle {formatAmount(preview.totals.vehicle)} (after {formatAmount(preview.employeeInterestReceived)} received this year)</span>
                    </label>
                    <p className="text-[12px] text-slate-500">{preview.employeeInterestNote}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">
                    {profit >= 0 ? 'Net profit' : 'Net loss'} to appropriate: <span className="text-slate-900">{formatAmount(Math.abs(profit))}</span>
                  </p>
                  <p className="text-[12px] text-slate-500">
                    {profit >= 0 ? 'Enter how much goes to each fund (as decided by the society). Posted as P&L A/c Dr, funds Cr.' : 'Enter a loss as negative amounts against the fund(s) that absorb it.'}
                  </p>
                  {rows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_150px_36px] items-center gap-2">
                      <Select searchable options={fundOptions} value={row.ledgerCode} onChange={(value) => setRows((current) => current.map((r, i) => (i === index ? { ...r, ledgerCode: value || '' } : r)))} placeholder="Select fund" />
                      <Input type="number" step="0.01" className="text-right" value={row.amount} onChange={(e) => setRows((current) => current.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))} />
                      <button type="button" disabled={rows.length <= 1} onClick={() => setRows((current) => current.filter((_, i) => i !== index))} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><X size={16} /></button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => setRows((current) => [...current, { ledgerCode: '', amount: '' }])}><Plus size={14} /> Add fund</Button>
                    <span className={`text-sm font-medium ${appropriation.balanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {appropriation.duplicate ? 'A fund is listed twice' : appropriation.missingFund ? 'Choose a fund for every amount' : appropriation.balanced ? 'Fully appropriated' : `Remaining ${formatAmount(appropriation.remaining)}`}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-slate-700">Remarks</label>
                    <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Approved in the general body meeting of ..." />
                  </div>
                  {canWrite ? (
                    <div className="flex justify-end">
                      <Button type="button" className="gap-2" disabled={!canClose || busy} onClick={() => setConfirming(true)}><Lock size={16} /> Close FY {year.fy}</Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">Interest per member ({eligibleMembers.length})</p>
                  <Input className="max-w-xs" placeholder="Search code or name" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                </div>
                <Table columns={memberColumns} data={shownMembers.map((m) => ({ ...m, id: m.memberCode }))} emptyMessage="No members" />
              </div>
            </>
          )}
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={`Close FY ${selected}?`}
        description={`This posts the year-end interest and the appropriation of ${formatAmount(Math.abs(profit))} on 31 March, carries every balance and the interest into the next year, and locks FY ${selected}. It can be reopened later.`}
        confirmLabel="Close year"
        tone="primary"
        busy={busy}
        onConfirm={handleClose}
        onClose={() => setConfirming(false)}
      />

      <Modal
        open={reopening}
        title={`Reopen FY ${selected}`}
        subtitle="The year-end interest and appropriation vouchers and the next year's carried-forward balances are removed, and the year can be edited again. Close it again when done."
        onClose={() => setReopening(false)}
        width="min(560px, 96vw)"
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReopening(false)} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={handleReopen} disabled={busy || !reason.trim()}>Reopen</Button>
          </div>
        )}
      >
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-slate-700">Reason</label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the closed year needs a correction" />
        </div>
      </Modal>
    </div>
  );
}

export default FinancialYearClosingPage;

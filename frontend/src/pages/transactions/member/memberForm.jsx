import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../api/api';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { getMemberDocumentDefinitions } from './memberDocumentUtils';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useInDialog } from '../../../components/ui/dialogContext';
import { useFY } from '../../../context/FYContext';
import UploadModal from './recovery-import/UploadModal';
import { toast } from 'sonner';
import { SmsCheckbox } from '../../../components/ui/CheckboxLine';
import {
  RECOVERY_HEADS, STATUS_LABELS, addDemandLines, applyExcelHeads, emptyHeads, expectedPaise, fromPaise, lineDifference, lineErrors, lineStatus,
  lineTotal, manualLine, mergeImportRows, normalizeDraftLines, reconcile, removeLine, updateLineHeads, withWarnings
} from './recoveryDraft';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function setPath(target, path, nextValue) {
  const parts = Array.isArray(path) ? path : String(path).split('.');
  let cursor = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }

  cursor[parts[parts.length - 1]] = nextValue;
}

function setDetailsValue(setValue, path, nextValue) {
  setValue((current) => {
    const next = deepClone(current);
    if (!next.details || typeof next.details !== 'object') next.details = {};
    setPath(next.details, path, nextValue);
    return next;
  });
}

function setRootValue(setValue, key, nextValue) {
  setValue((current) => ({ ...(current || {}), [key]: nextValue }));
}

function formatLookupLabel(item = {}) {
  const code = item.code || item.value || '';
  const name = item.name || item.label || '';
  return `${code}${name ? ` - ${name}` : ''}`.trim();
}

function buildGroups(items = [], label = '') {
  const rows = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item) => ({ value: item.code || item.value || '', label: formatLookupLabel(item) }))
    .filter((item) => item.value);
  return rows.length ? [{ label, items: rows }] : [];
}

function getMemberLookupGroups(lookups = {}) {
  return buildGroups(lookups.members, 'Members');
}

function getBranchLabel(lookups = {}, code = '') {
  const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
  const branch = branches.find((item) => String(item.value || item.code || '').toUpperCase() === String(code || '').toUpperCase());
  return branch?.label || branch?.name || code || '-';
}

function getMemberRecord(lookups = {}, code = '') {
  const members = Array.isArray(lookups.members) ? lookups.members : [];
  return members.find((item) => String(item.code || item.value || '').toUpperCase() === String(code || '').toUpperCase()) || null;
}

function getDesignationLabel(member = {}) {
  return member?.designation || '-';
}

function getPaymentOptions(activeKey = '') {
  if (activeKey === 'recovery-member') {
    return [
      { label: 'Cash', value: 'CASH' },
      { label: 'DD', value: 'DD' },
      { label: 'Cheque', value: 'CHEQUE' }
    ];
  }

  if (activeKey === 'ssa-paid-member') {
    return [
      { label: 'Cash-in-Hand', value: 'CASH-IN-HAND' },
      { label: 'Cheque', value: 'CHEQUE' },
      { label: 'Transfer', value: 'TRANSFER' }
    ];
  }

  return [
    { label: 'Cash', value: 'CASH' },
    { label: 'Cheque', value: 'CHEQUE' },
    { label: 'Transfer', value: 'TRANSFER' }
  ];
}

function FieldLabel({ children, required = false }) {
  return <label className="text-[13px] font-semibold text-slate-700">{children}{required ? <span className="text-rose-500"> *</span> : null}</label>;
}

function SectionTitle({ children, subtitle = '' }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{children}</div>
      {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function LookupSelect({ label, value, onChange, groups = [], placeholder = 'Select...', required = false, disabled = false }) {
  const flatOptions = useMemo(() => {
    const opts = [];
    groups.forEach((group) => {
      group.items.forEach((item) => {
        opts.push({ label: group.label ? `${item.label} (${group.label})` : item.label, value: item.value });
      });
    });
    return opts;
  }, [groups]);

  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <CustomSelect
        value={value || ''}
        onChange={onChange}
        disabled={disabled || !groups.length}
        placeholder={placeholder}
        options={flatOptions}
        searchable
      />
    </div>
  );
}

const MONTH_OPTIONS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  .map((label, index) => ({ label, value: String(index + 1) }));


function formatHead(value) {
  const number = Number(value || 0);
  return number ? number.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '-';
}

// Add Record / Edit: one member line. Editing keeps the line's demand or
// Excel provenance; only the amounts change, and only in the draft. The
// Excel amount is read-only; a line with no Excel row takes the expected
// amount (what was actually received) here. The member's current balances
// are shown beside the heads for reference.
const BALANCE_OF_HEAD = { share: 'share', cd: 'compulsoryDeposit', ssa: 'specialDeposit', loan: 'regularLoan', lad: 'loanAgainstDeposit' };

function RecoveryMemberDialog({ state, onClose, onSave, memberGroups = [], lookups = {} }) {
  const { token } = useAuth();
  const [member, setMember] = useState(state?.member || '');
  const [heads, setHeads] = useState({ ...emptyHeads(), ...(state?.heads || {}) });
  const [expected, setExpected] = useState(state?.excel ? String(state.excel.amount ?? '') : String(state?.expectedAmount ?? ''));
  const [balances, setBalances] = useState(null);
  const editing = state?.index != null;
  const fromExcel = Boolean(state?.excel);
  const memberRecord = getMemberRecord(lookups, member);
  const memberId = memberRecord?.id || memberRecord?._id || '';
  const total = lineTotal({ heads });
  const expectedValue = fromExcel ? Number(state.excel.amount || 0) : Number(expected || 0);
  const difference = fromPaise(Math.round(expectedValue * 100) - Math.round(total * 100));

  useEffect(() => {
    let alive = true;
    setBalances(null);
    if (!memberId || !token) return undefined;
    api.resources.get('/banking/masters/members', memberId, token)
      .then((response) => { if (alive) setBalances(response?.data?.currentBalances || null); })
      .catch(() => { if (alive) setBalances(null); });
    return () => { alive = false; };
  }, [memberId, token]);

  if (!state) return null;

  function submit() {
    if (!member) {
      alert('Select a member.');
      return;
    }
    if (!fromExcel && !(Number(expected) > 0)) {
      alert('Enter the expected amount (the amount actually received for this member).');
      return;
    }
    if (total <= 0) {
      alert('Enter at least one recovered amount.');
      return;
    }
    onSave({ member, memberRecord, heads, expectedAmount: fromExcel ? undefined : expected });
  }

  return (
    <Modal
      open
      title={editing ? `Edit Recovery — ${member}` : 'Add Recovery Record'}
      onClose={onClose}
      wide
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-700">
            Allocated <b>{formatHead(total)}</b> · Difference{' '}
            <b className={difference === 0 ? 'text-emerald-700' : 'text-red-700'}>{difference === 0 ? '0' : formatHead(difference)}</b>
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={submit} className="rounded-lg bg-[var(--primary,#2563eb)] px-4 py-2 text-sm font-medium text-white">{editing ? 'Update' : 'Add'}</button>
          </div>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-1">
            <LookupSelect label="Member Code" required value={member} onChange={setMember} placeholder="Search member..." groups={memberGroups} disabled={editing} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Member Name</FieldLabel>
            <Input value={memberRecord?.name || state.memberName || ''} readOnly placeholder="—" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Branch</FieldLabel>
            <Input value={getBranchLabel(lookups, memberRecord?.branchCode) || state.branchName || ''} readOnly placeholder="—" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Designation</FieldLabel>
            <Input value={getDesignationLabel(memberRecord) || state.designation || ''} readOnly placeholder="—" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <FieldLabel required={!fromExcel}>{fromExcel ? 'Expected (Excel) Amount' : 'Expected Amount'}</FieldLabel>
            {fromExcel
              ? <Input value={formatHead(state.excel.amount)} readOnly className="bg-slate-50 font-semibold" />
              : <Input type="number" min="0" step="0.01" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Amount actually received" />}
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Allocated Total</FieldLabel>
            <Input value={formatHead(total)} readOnly className="bg-slate-50" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Difference</FieldLabel>
            <Input value={difference === 0 ? '0' : formatHead(difference)} readOnly className={difference === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 font-semibold text-red-700'} />
          </div>
        </div>
        {state.reviewNote ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{state.reviewNote}</p> : null}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              <tr><th className="px-3 py-2">Head</th><th className="px-3 py-2 text-right">Current Balance</th><th className="px-3 py-2">Recovery Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {RECOVERY_FIELDS.map(([key, label]) => {
                const balanceKey = BALANCE_OF_HEAD[key];
                const balance = balanceKey && balances ? balances[balanceKey] : null;
                return (
                  <tr key={key}>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{label}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{balanceKey ? (balances ? formatHead(balance) : '…') : ''}</td>
                    <td className="px-3 py-1.5">
                      <Input type="number" min="0" step="0.01" value={heads[key]} onChange={(e) => setHeads((curr) => ({ ...curr, [key]: e.target.value }))} placeholder="0" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-slate-500">Insurance Premium and Suspense have no confirmed posting rule yet: a line with either amount can't be saved.</p>
      </div>
    </Modal>
  );
}

const RECOVERY_FIELDS = [
  ['share', 'Share'],
  ['cd', 'Compulsory Deposit'],
  ['ssa', 'Special Saving A/C'],
  ['loan', 'Regular Loan'],
  ['lad', 'Loan Against Deposit'],
  ['ins', 'Insurance Premium'],
  ['admfee', 'Admission Fee'],
  ['suspense', 'Suspense A/C']
];

// Add From Demand List: Branch + Month + Year -> that month's pending demand
// lines; ticked lines are copied into the draft. Demand stays pending until
// the recovery is saved.
function DemandPickerDialog({ open, onClose, onAdd, lookups = {}, voucherDate = '', existingIds = [] }) {
  const { token } = useAuth();
  const { activeFY } = useFY();
  const date = String(voucherDate || '').slice(0, 10);
  const [branchCode, setBranchCode] = useState('');
  const [month, setMonth] = useState(date ? String(Number(date.slice(5, 7))) : '');
  const [year, setYear] = useState(date ? date.slice(0, 4) : '');
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
  const already = new Set(existingIds);
  if (!open) return null;

  async function loadDemand() {
    if (!month || !year) {
      alert('Choose the demand month and year.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.banking.recoveryDemandCandidates(token, {
        branchCode, month, year, fyStart: activeFY?.start || '', fyEnd: activeFY?.end || ''
      });
      const next = Array.isArray(response.data) ? response.data : [];
      setRows(next);
      setSelected(new Set(next.filter((row) => !already.has(row.demandLineId)).map((row) => row.demandLineId)));
      setLoaded(true);
    } catch (error) {
      alert(error.message || 'Unable to load demand');
    } finally {
      setLoading(false);
    }
  }

  function toggle(id) {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectable = rows.filter((row) => !already.has(row.demandLineId));
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.demandLineId));

  return (
    <Modal
      open
      title="Add From Demand List"
      subtitle="Pending demand of one branch and month. Copied lines can be corrected before Save."
      onClose={onClose}
      wide
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-sm text-slate-600">{selected.size} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="button" disabled={!selected.size} onClick={() => onAdd(rows.filter((row) => selected.has(row.demandLineId)))} className="rounded-lg bg-[var(--primary,#2563eb)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add Selected to Recovery</button>
          </div>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <FieldLabel>Branch</FieldLabel>
            <CustomSelect
              value={branchCode}
              onChange={setBranchCode}
              options={[{ label: 'All branches', value: '' }, ...branches.map((branch) => ({ label: `${branch.code} - ${branch.label || ''}`, value: branch.code }))]}
              searchable
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Month</FieldLabel>
            <CustomSelect value={month} onChange={setMonth} options={MONTH_OPTIONS} placeholder="Month" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Year</FieldLabel>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
          </div>
          <button type="button" onClick={loadDemand} disabled={loading} className="h-10 rounded-lg bg-[var(--primary,#2563eb)] px-4 text-sm font-medium text-white disabled:opacity-50">
            {loading ? 'Loading...' : 'Load Demand'}
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-[12px]">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-2 py-2"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((row) => row.demandLineId)))} aria-label="Select all" /></th>
                <th className="px-2 py-2">Demand No / Date</th>
                <th className="px-2 py-2">Month</th>
                <th className="px-2 py-2">Member</th>
                <th className="px-2 py-2">Branch</th>
                <th className="px-2 py-2">Designation</th>
                <th className="px-2 py-2 text-right">Cmp. Dep.</th>
                <th className="px-2 py-2 text-right">SSA</th>
                <th className="px-2 py-2 text-right">Reg. Loan</th>
                <th className="px-2 py-2 text-right">LAD</th>
                <th className="px-2 py-2 text-right">Premium / Other</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const inDraft = already.has(row.demandLineId);
                return (
                  <tr key={row.demandLineId} className={inDraft ? 'bg-slate-50 text-slate-400' : ''}>
                    <td className="px-2 py-1.5"><input type="checkbox" disabled={inDraft} checked={selected.has(row.demandLineId)} onChange={() => toggle(row.demandLineId)} aria-label={`Select ${row.memberCode}`} /></td>
                    <td className="px-2 py-1.5">{row.demandListNo}<div className="text-[11px] text-slate-500">{row.demandListDate}</div></td>
                    <td className="px-2 py-1.5">{String(row.month).padStart(2, '0')}/{row.year}</td>
                    <td className="px-2 py-1.5"><span className="font-medium">{row.memberCode}</span> {row.memberName}{inDraft ? <span className="ml-1 text-[11px]">(in recovery)</span> : null}</td>
                    <td className="px-2 py-1.5">{row.branchName}</td>
                    <td className="px-2 py-1.5">{row.designation}</td>
                    <td className="px-2 py-1.5 text-right">{formatHead(row.compulsoryDeposit)}</td>
                    <td className="px-2 py-1.5 text-right">{formatHead(row.specialDeposit)}</td>
                    <td className="px-2 py-1.5 text-right">{formatHead(row.regularLoan)}</td>
                    <td className="px-2 py-1.5 text-right">{formatHead(row.loanAgainstDeposit)}</td>
                    <td className="px-2 py-1.5 text-right">{formatHead(Number(row.insurancePremium || 0) + Number(row.other || 0))}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{formatHead(row.totalAmount)}</td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-slate-500">{loaded ? 'No pending demand for this branch and month.' : 'Choose a branch, month and year, then Load Demand.'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

// The Recovery draft grid. Rows come from Demand List, Excel or Add Record;
// each can be edited or removed before Save. Nothing here saves anything.
// A row is red until its heads add up exactly to its expected (Excel)
// amount; Save needs every row valid.
function RecoveryLinesEditor({ rows = [], excluded = [], onChange, memberGroups = [], lookups = {}, voucherDate = '' }) {
  const { token } = useAuth();
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeExcluded = Array.isArray(excluded) ? excluded : [];
  const [memberDialog, setMemberDialog] = useState(null);
  const [demandOpen, setDemandOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const checkedRows = withWarnings(safeRows);
  const summary = reconcile(safeRows);
  const members = Array.isArray(lookups.members) ? lookups.members : [];
  const hasExcel = safeRows.some((row) => row.excel) || safeExcluded.length > 0;
  const excludedTotal = safeExcluded.reduce((sum, row) => sum + Math.round(Number(row.amount || 0) * 100), 0) / 100;

  function saveMemberLine({ member, memberRecord, heads, expectedAmount }) {
    if (memberDialog.index != null) {
      onChange(updateLineHeads(safeRows, memberDialog.index, heads, expectedAmount));
    } else {
      onChange(withWarnings([...safeRows, manualLine({
        ...(memberRecord || { code: member }),
        branchName: getBranchLabel(lookups, memberRecord?.branchCode),
        designation: getDesignationLabel(memberRecord)
      }, heads, expectedAmount)]));
    }
    setMemberDialog(null);
  }

  function addDemand(candidates) {
    const result = addDemandLines(safeRows, candidates);
    onChange(result.lines);
    setNotice(`${result.added} demand line(s) added${result.skipped ? `, ${result.skipped} already in this recovery` : ''}. Demand stays pending until you Save.`);
    setDemandOpen(false);
  }

  async function addFromExcel(batch) {
    setUploadOpen(false);
    try {
      const response = await api.recoveryImport.getBatchRows(token, batch.id);
      const importRows = Array.isArray(response.data?.rows) ? response.data.rows : [];
      const result = mergeImportRows(safeRows, importRows, members, batch.id, safeExcluded);
      onChange(result.lines, result.excluded);
      const check = reconcile(result.lines);
      const footer = batch?.payload?.footerTotal;
      const footerNote = footer == null ? '' : (batch.payload.footerMatches ? ` File total ₹${formatHead(footer)} matches its member rows.` : ` WARNING: the file's total line ₹${formatHead(footer)} differs from its member rows ₹${formatHead(batch.payload.parsedTotal)}.`);
      const skipped = result.otherBranch ? ` ${result.otherBranch} row(s) of branches whose demand is not loaded were excluded (listed below).` : '';
      setNotice(`Excel imported: ${result.matched} matched a demand line, ${result.added} not in the demand, ${result.unmatched} with no member.${skipped}${footerNote} ${check.errorRows ? `${check.errorRows} row(s) to correct.` : 'Every row reconciles.'}`);
    } catch (error) {
      alert(error.message || 'Unable to read the imported rows');
    }
  }

  function remove(index) {
    const row = safeRows[index];
    let reason = '';
    if (row?.excel?.rowId) {
      reason = window.prompt(`Excel row ${row.excel.rowNo ?? ''} (PF ${row.excel.pfNo || '—'}, ₹${formatHead(row.excel.amount)}) will be EXCLUDED from this recovery and the Excel total. Reason:`, row.unmatched ? 'No member for this PF' : '');
      if (reason == null) return;
      if (!reason.trim()) {
        alert('Give a reason for excluding an Excel row.');
        return;
      }
    }
    const next = removeLine(safeRows, index, safeExcluded, reason.trim());
    onChange(next, next.excluded);
  }

  function restoreExcluded(index) {
    onChange(safeRows, safeExcluded.filter((_, i) => i !== index));
    setNotice('The row was taken off the excluded list. Import the Excel again to bring it back into the recovery.');
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle subtitle="1. Add from the demand list  2. Load the bank Excel  3. Correct every red row until the difference is 0, then Save.">Member Recovery</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDemandOpen(true)}>1. Add From Demand List</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setUploadOpen(true)}>2. Load From Excel</Button>
          <Button type="button" size="sm" onClick={() => setMemberDialog({ index: null, heads: emptyHeads() })}>+ Add Record</Button>
        </div>
      </div>
      {notice ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">{notice}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-2 py-2">Member</th>
              <th className="px-2 py-2">Branch / Designation</th>
              <th className="px-2 py-2 text-right">Expected</th>
              {RECOVERY_HEADS.map(([key, label]) => <th key={key} className="px-2 py-2 text-right">{label}</th>)}
              <th className="px-2 py-2 text-right">Allocated</th>
              <th className="px-2 py-2 text-right">Difference</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checkedRows.map((row, index) => {
              const record = getMemberRecord(lookups, row.member);
              const status = lineStatus(row, safeRows);
              const bad = status !== 'VALID';
              const errors = lineErrors(row, safeRows);
              const notes = row.warnings || [];
              const expected = expectedPaise(row);
              const difference = lineDifference(row);
              return (
                <tr
                  key={`${row.demandLineId || row.importRowId || 'line'}-${index}`}
                  className={bad ? 'bg-red-50 shadow-[inset_4px_0_0_0_#dc2626]' : ''}
                >
                  <td className="px-2 py-1.5 align-top">
                    {row.unmatched
                      ? <span className="font-medium text-red-700">PF {row.excel?.pfNo || '—'} <span className="font-normal">{row.memberName}</span></span>
                      : <><span className="font-medium text-slate-800">{row.member}</span> <span className="text-slate-600">{row.memberName || record?.name || ''}</span></>}
                    {errors.length ? <ul className="mt-1 space-y-0.5 text-[11px] font-semibold text-red-700">{errors.map((text) => <li key={text}>{text}</li>)}</ul> : null}
                    {notes.length ? <ul className="mt-1 space-y-0.5 text-[11px] text-amber-700">{notes.map((text) => <li key={text}>ⓘ {text}</li>)}</ul> : null}
                  </td>
                  <td className="px-2 py-1.5 align-top text-slate-600">{row.branchName || getBranchLabel(lookups, record?.branchCode) || ''}<div className="text-[11px] text-slate-500">{row.designation || getDesignationLabel(record)}</div></td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-800">{expected == null ? '—' : formatHead(fromPaise(expected))}</td>
                  {RECOVERY_HEADS.map(([key]) => <td key={key} className="px-2 py-1.5 text-right text-slate-700">{formatHead(row.heads?.[key])}</td>)}
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-800">{formatHead(lineTotal(row))}</td>
                  <td className={`px-2 py-1.5 text-right font-semibold ${difference === 0 ? 'text-slate-400' : 'text-red-700'}`}>{difference === 0 ? '0' : formatHead(difference)}</td>
                  <td className="px-2 py-1.5">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${bad ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{STATUS_LABELS[status]}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {row.excel && !row.unmatched && bad ? (
                      <button type="button" onClick={() => onChange(applyExcelHeads(safeRows, index))} className="mr-3 font-medium text-emerald-700 hover:underline" title="Split the Excel amount over the member's monthly demand heads">Use Excel split</button>
                    ) : null}
                    {!row.unmatched ? <button type="button" onClick={() => setMemberDialog({ index, ...row })} className="mr-3 font-medium text-[var(--primary,#2563eb)] hover:underline">Edit</button> : null}
                    <button type="button" onClick={() => remove(index)} className="font-medium text-rose-600 hover:text-rose-700">{row.excel?.rowId ? 'Exclude' : 'Remove'}</button>
                  </td>
                </tr>
              );
            })}
            {!safeRows.length ? (
              <tr><td colSpan={RECOVERY_HEADS.length + 7} className="px-3 py-6 text-center text-slate-500">No members yet — Add From Demand List, then Load From Excel (or Add Record).</td></tr>
            ) : null}
          </tbody>
          {safeRows.length ? (
            <tfoot className="bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-2 py-2" colSpan={2}>Total ({safeRows.length} members)</td>
                <td className="px-2 py-2 text-right">{formatHead(summary.excelTotal)}</td>
                {RECOVERY_HEADS.map(([key]) => <td key={key} className="px-2 py-2 text-right">{formatHead(summary.heads[key])}</td>)}
                <td className="px-2 py-2 text-right">{formatHead(summary.recoveryTotal)}</td>
                <td className={`px-2 py-2 text-right ${summary.difference === 0 ? '' : 'text-red-700'}`}>{summary.difference === 0 ? '0' : formatHead(summary.difference)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {safeRows.length ? (
        <div className={`grid gap-3 rounded-xl border p-4 sm:grid-cols-3 lg:grid-cols-6 ${summary.canSave ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <SummaryFigure label={hasExcel ? 'Excel Total' : 'Expected Total'} value={formatHead(summary.excelTotal)} />
          <SummaryFigure label="Recovery Total" value={formatHead(summary.recoveryTotal)} />
          <SummaryFigure label="Difference" value={summary.difference === 0 ? '0' : formatHead(summary.difference)} tone={summary.difference === 0 ? 'ok' : 'bad'} />
          <SummaryFigure label="Valid Rows" value={summary.validRows} />
          <SummaryFigure label="Error Rows" value={summary.errorRows} tone={summary.errorRows ? 'bad' : 'ok'} />
          <SummaryFigure label="Status" value={summary.canSave ? 'Ready to Save' : 'Not reconciled'} tone={summary.canSave ? 'ok' : 'bad'} />
        </div>
      ) : null}

      {safeExcluded.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 text-[13px] font-semibold text-amber-800">Excluded Excel rows: {safeExcluded.length} · ₹{formatHead(excludedTotal)} (not in this recovery or its Excel total)</p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[12px] text-amber-900">
            {safeExcluded.map((row, index) => (
              <li key={`${row.importRowId}-${index}`} className="flex items-center justify-between gap-3">
                <span>Row {row.rowNo ?? '—'} · PF {row.pfNo || '—'} {row.name ? `· ${row.name}` : ''} · ₹{formatHead(row.amount)} — {row.reason}</span>
                <button type="button" onClick={() => restoreExcluded(index)} className="shrink-0 font-medium text-[var(--primary,#2563eb)] hover:underline">Un-exclude</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The dialogs render outside the voucher <form> (portal): inside it,
          their buttons or Enter in an amount would submit — i.e. save — the
          whole recovery while a row is still being edited. */}
      {memberDialog ? createPortal(
        // data-modal-portal: clicks here are not "outside" the voucher dialog.
        <div data-modal-portal="true"><RecoveryMemberDialog
          key={memberDialog.index ?? 'new'}
          state={memberDialog}
          onClose={() => setMemberDialog(null)}
          onSave={saveMemberLine}
          memberGroups={memberGroups}
          lookups={lookups}
        /></div>,
        document.body
      ) : null}
      {createPortal(<div data-modal-portal="true"><DemandPickerDialog
        key={demandOpen ? 'open' : 'closed'}
        open={demandOpen}
        onClose={() => setDemandOpen(false)}
        onAdd={addDemand}
        lookups={lookups}
        voucherDate={voucherDate}
        existingIds={safeRows.map((row) => row.demandLineId).filter(Boolean)}
      /></div>, document.body)}
      {createPortal(<div data-modal-portal="true"><UploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onUploadSuccess={addFromExcel} token={token} /></div>, document.body)}
    </div>
  );
}

function SummaryFigure({ label, value, tone = '' }) {
  const color = tone === 'bad' ? 'text-red-700' : tone === 'ok' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</div>
      <div className={`text-[15px] font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SimpleDocumentList({ definitions = [], documents = {}, onPickFile, onClearFile }) {
  const inputRefs = useRef({});

  function triggerPicker(key) {
    inputRefs.current[key]?.click();
  }

  function handlePick(key, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onPickFile) return;
    onPickFile(key, file);
  }

  return (
    <div className="space-y-3">
      {definitions.map((definition) => {
        const document = documents?.[definition.key] || null;
        const fileName = document?.fileName || document?.originalName || '';
        return (
          <div key={definition.key} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{definition.label}</p>
                {definition.description ? <p className="text-xs text-slate-500">{definition.description}</p> : null}
                <p className="mt-1 text-xs text-slate-700">{fileName || 'No file selected'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={(node) => {
                    inputRefs.current[definition.key] = node;
                  }}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(event) => handlePick(definition.key, event)}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => triggerPicker(definition.key)}>
                  {document ? 'Replace file' : 'Select file'}
                </Button>
                {document ? (
                  <Button type="button" variant="outline" size="sm" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => onClearFile?.(definition.key, document)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MemberTransactionForm({ section, lookups = {}, value, setValue, onSubmit, onDocumentRemove, activeKey: forcedActiveKey = '' }) {
  // In a dialog the form fills it, lined up with the title and the buttons.
  const inDialog = useInDialog();
  const { token } = useAuth();
  const draft = value || {};

  useEffect(() => {
    let mounted = true;
    if (!draft.voucherNo && !draft.id) {
      api.banking.getNextVoucherNo(token, draft.branchCode)
        .then((res) => {
          if (!mounted) return;
          if (res?.success && res?.data?.voucherNo) {
            setValue((prev) => ({ ...prev, voucherNo: res.data.voucherNo }));
          } else {
            setValue((prev) => ({ ...prev, voucherNo: 'Err: ' + JSON.stringify(res) }));
          }
        })
        .catch((err) => {
          if (mounted) setValue((prev) => ({ ...prev, voucherNo: 'Error: ' + err.message }));
        });
    }
    return () => {
      mounted = false;
    };
  }, [draft.id, draft.voucherNo, draft.branchCode, setValue, token]);

  const editableItems = useMemo(() => (section?.items || []).filter((item) => !item.route), [section]);
  const activeKey = draft?.details?.key || forcedActiveKey || editableItems[0]?.key || '';
  const activeItem = editableItems.find((item) => item.key === activeKey) || editableItems[0] || null;
  const memberGroups = useMemo(() => getMemberLookupGroups(lookups), [lookups]);
  const paymentOptions = useMemo(() => getPaymentOptions(activeKey), [activeKey]);
  const documentDefs = useMemo(() => getMemberDocumentDefinitions(activeKey), [activeKey]);
  const memberRecord = getMemberRecord(lookups, draft.partyCode);
  const isLoan = activeKey === 'loan-paid-member';
  const isDeposit = activeKey === 'deposit-paid-member';
  const isInsurance = activeKey === 'insurance-paid-member';
  const isSsa = activeKey === 'ssa-paid-member';
  const isRecovery = activeKey === 'recovery-member';
  const recoveryRows = normalizeDraftLines(draft.details?.recoveryLines);
  const recoveryExcluded = Array.isArray(draft.details?.recoveryExcluded) ? draft.details.recoveryExcluded : [];
  const loanAmount = Number(draft.details?.components?.loanAmt || 0);
  const ladAmount = Number(draft.details?.components?.lad || 0);
  const recoveryTotal = reconcile(recoveryRows).recoveryTotal;
  const amountValue = isLoan ? loanAmount + ladAmount : isRecovery ? recoveryTotal : Number(draft.amount || 0);

  function updateDetails(path, nextValue) {
    setDetailsValue(setValue, path, nextValue);
  }

  function updateComponents(path, nextValue) {
    setDetailsValue(setValue, ['components', path], nextValue);
  }

  // Recovery: Save only when every row's heads equal its expected (Excel)
  // amount and the totals agree to the paisa. No override; the server checks
  // the same again.
  function handleSubmit(event) {
    if (isRecovery) {
      const check = reconcile(recoveryRows);
      if (!check.canSave) {
        event.preventDefault();
        toast.error(check.errorRows
          ? `${check.errorRows} recovery row(s) don't reconcile (difference ₹${formatHead(check.difference)}). Correct them before saving.`
          : `Recovery total ₹${formatHead(check.recoveryTotal)} must equal the expected total ₹${formatHead(check.excelTotal)}.`);
        return;
      }
    }
    onSubmit?.(event);
  }

  function updateRecoveryRows(nextRows, nextExcluded) {
    const rowsWithStatus = withWarnings(nextRows);
    setValue((current) => {
      const next = deepClone(current || {});
      next.details = { ...(next.details || {}), recoveryLines: rowsWithStatus };
      if (nextExcluded !== undefined) next.details.recoveryExcluded = nextExcluded;
      const total = reconcile(rowsWithStatus).recoveryTotal;
      next.amount = total > 0 ? total : '';
      return next;
    });
  }

  function setAmount(nextValue) {
    setRootValue(setValue, 'amount', nextValue);
  }

  function setPartyCode(nextValue) {
    const code = String(nextValue || '').toUpperCase();
    const mem = getMemberRecord(lookups, code);
    const branch = mem?.branchName || mem?.branch || mem?.branchCode || '';
    setValue((current) => ({
      ...(current || {}),
      partyCode: code,
      branchCode: branch
    }));
  }

  function updateDocumentMap(key, file) {
    setValue((current) => ({
      ...(current || {}),
      documents: {
        ...(current?.documents || {}),
        [key]: {
          file,
          fileName: file.name,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          documentType: key
        }
      }
    }));
  }

  function clearDocument(key, document) {
    onDocumentRemove?.(key, document);
    setValue((current) => ({
      ...(current || {}),
      documents: {
        ...(current?.documents || {}),
        [key]: null
      }
    }));
  }

  function renderCommonHeader() {
    return (
      <section className="space-y-3">
        <SectionTitle>
          Voucher and Member
        </SectionTitle>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel>Voucher No.</FieldLabel>
            <Input value={draft.voucherNo || ''} readOnly placeholder="Generating..." />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input type="date" value={draft.date || ''} onChange={(event) => setRootValue(setValue, 'date', event.target.value)} />
          </div>

          <LookupSelect
            label="Member Code"
            value={draft.partyCode || ''}
            onChange={setPartyCode}
            placeholder="Search member by code or name"
            groups={memberGroups}
            required
          />
          <div className="space-y-1.5">
            <FieldLabel>Member Name</FieldLabel>
            <Input value={memberRecord?.name || '-'} readOnly />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Branch</FieldLabel>
            <Input value={getBranchLabel(lookups, memberRecord?.branchName || memberRecord?.branch || memberRecord?.branchCode)} readOnly />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Designation</FieldLabel>
            <Input value={getDesignationLabel(memberRecord)} readOnly />
          </div>
        </div>
      </section>
    );
  }

  function renderLoanForm() {
    return (
      <section className="space-y-3">
        <SectionTitle>Loan Disbursement</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel required>Regular Loan Amount</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.details?.components?.loanAmt ?? ''}
              onChange={(event) => {
                updateComponents('loanAmt', event.target.value);
                setAmount(Number(event.target.value || 0) + Number(draft.details?.components?.lad || 0));
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Loan Against Deposit Amount</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.details?.components?.lad ?? ''}
              onChange={(event) => {
                updateComponents('lad', event.target.value);
                setAmount(Number(draft.details?.components?.loanAmt || 0) + Number(event.target.value || 0));
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Payment Mode</FieldLabel>
            <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={amountValue || ''} readOnly />
          </div>
          <SmsCheckbox className="md:col-span-3" checked={draft.details?.sms} onChange={(checked) => updateDetails('sms', checked)} />
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Loan disbursement remarks" />
          </div>
        </div>
      </section>
    );
  }

  function renderDepositForm() {
    return (
      <section className="space-y-3">
        <SectionTitle>Compulsory Deposit</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel required>Compulsory Deposit Amount</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draft.amount ?? ''} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Paymode</FieldLabel>
            <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={amountValue || ''} readOnly />
          </div>
          <SmsCheckbox className="md:col-span-3" checked={draft.details?.sms} onChange={(checked) => updateDetails('sms', checked)} />
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Deposit payout remarks" />
          </div>
        </div>
      </section>
    );
  }

  function renderInsuranceForm() {
    return (
      <section className="space-y-3">
        <SectionTitle>Insurance Premium</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel required>Insurance Premium Amount</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draft.amount ?? ''} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Payment</FieldLabel>
            <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={amountValue || ''} readOnly />
          </div>
          <SmsCheckbox className="md:col-span-3" checked={draft.details?.sms} onChange={(checked) => updateDetails('sms', checked)} />
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Insurance payout remarks" />
          </div>
        </div>
      </section>
    );
  }

  function renderSsaForm() {
    return (
      <section className="space-y-3">
        <SectionTitle>SSA Payment</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel required>Special Saving / SSA Amount</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draft.amount ?? ''} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Paymode</FieldLabel>
            <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select paymode" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={amountValue || ''} readOnly />
          </div>
          <SmsCheckbox className="md:col-span-3" checked={draft.details?.sms} onChange={(checked) => updateDetails('sms', checked)} />
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="SSA payment remarks" />
          </div>
        </div>
      </section>
    );
  }

  function renderRecoveryForm() {
    return (
      <section className="space-y-3">
        <div className="space-y-3">
          <SectionTitle>Voucher</SectionTitle>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1.5">
              <FieldLabel>Voucher No.</FieldLabel>
              <Input value={draft.voucherNo || ''} readOnly placeholder="Generating..." />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Date</FieldLabel>
              <Input type="date" value={draft.date || ''} onChange={(event) => setRootValue(setValue, 'date', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Mode</FieldLabel>
              <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>DD / Cheque No.</FieldLabel>
              <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="DD / cheque number" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Cheque Date</FieldLabel>
              <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
            </div>
          </div>
        </div>

        <RecoveryLinesEditor rows={recoveryRows} excluded={recoveryExcluded} onChange={updateRecoveryRows} memberGroups={memberGroups} lookups={lookups} voucherDate={draft.date} />

        <div className="space-y-3">
          <SectionTitle>Total and Narration</SectionTitle>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <FieldLabel>Total Recovery Amount</FieldLabel>
              <Input value={amountValue || ''} readOnly />
            </div>
            {/* SMS is not configured (no provider yet): the button is shown
                disabled and does nothing. Save never depends on it. */}
            <div className="flex items-end gap-3 md:col-span-2">
              <Button type="button" variant="outline" disabled title="SMS is not configured" className="cursor-not-allowed text-slate-400">
                Send SMS — not configured
              </Button>
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <FieldLabel>Narration</FieldLabel>
              <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Recovery remarks" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form id="transaction-voucher-form" className={inDialog ? 'w-full space-y-3' : 'mx-auto w-full max-w-5xl space-y-3'} onSubmit={handleSubmit}>
      {!isRecovery && renderCommonHeader()}
      {isLoan ? renderLoanForm() : null}
      {isDeposit ? renderDepositForm() : null}
      {isInsurance ? renderInsuranceForm() : null}
      {isSsa ? renderSsaForm() : null}
      {isRecovery ? renderRecoveryForm() : null}
      {documentDefs.length ? (
        <section className="space-y-3">
          <SectionTitle>Attachments</SectionTitle>
          <SimpleDocumentList definitions={documentDefs} documents={draft.documents || {}} onPickFile={updateDocumentMap} onClearFile={clearDocument} />
        </section>
      ) : null}
    </form>
  );
}

export default MemberTransactionForm;

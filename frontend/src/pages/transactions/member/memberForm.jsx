import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../components/overlays/ConfirmProvider';
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
import { ClipboardList, FileSpreadsheet, Info, Paperclip, Pencil, Plus, X } from 'lucide-react';
import { SmsCheckbox } from '../../../components/ui/CheckboxLine';
import {
  RECOVERY_HEADS, STATUS_LABELS, addDemandLines, excelVsDemand, pickDemandEntryMonth, addExcelLines, applyExcelHeads, candidateKey, emptyHeads, expectedPaise, fromPaise, lineDifference, lineErrors, lineStatus,
  lineTotal, manualLine, normalizeDraftLines, reconcile, removeLine, toPaise, updateLineHeads, withOutstanding, withWarnings
} from './recoveryDraft';
import { membersInFy } from '../../../lib/fyMembers';

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
  return buildGroups(membersInFy(lookups.members), 'Members');
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
  // Mail (the default for a new recovery): the bank's monthly deduction
  // remitted by mail; like DD / Cheque it posts to Transfer Adjustment.
  if (activeKey === 'recovery-member') {
    return [
      { label: 'Mail', value: 'MAIL' },
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

// A small label over a compact field (the recovery voucher strip).
function MiniField({ label, required = false, className = '', children }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}{required ? <span className="text-rose-500"> *</span> : null}</div>
      {children}
    </div>
  );
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


// One formatter for every cell (toLocaleString with options builds a new one
// per call: thousands per render on a full month's recovery).
const HEAD_FORMAT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function formatHead(value) {
  const number = Number(value || 0);
  return number ? HEAD_FORMAT.format(number) : '-';
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
      toast.error('Select a member.');
      return;
    }
    if (!fromExcel && !(Number(expected) > 0)) {
      toast.error('Enter the expected amount (the amount actually received for this member).');
      return;
    }
    if (total <= 0) {
      toast.error('Enter at least one recovered amount.');
      return;
    }
    onSave({ member, memberRecord, heads, expectedAmount: fromExcel ? undefined : expected });
  }

  return (
    <Modal
      variant="mint"
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

// All / Less / Extra / 0: the Excel amount against the demand.
const EXCEL_FILTERS = [['ALL', 'All'], ['LESS', 'Less'], ['EXTRA', 'Extra'], ['ZERO', '0']];
function ExcelFilterChips({ value, onChange, counts = {} }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by Excel amount">
      {EXCEL_FILTERS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`rounded-full border px-3 py-1 text-[12px] font-medium ${value === key ? (key === 'EXTRA' ? 'border-red-600 bg-red-600 text-white' : 'border-[var(--primary,#2563eb)] bg-[var(--primary,#2563eb)] text-white') : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          {label} <span className="tabular-nums opacity-80">{counts[key] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

// Add From Demand List: Branch + Month + Year -> that month's demand: each
// member's pending demand line (Demand Entry), else their Monthly Demand
// Data. One button: when Demand Entry already has the month, the dialog
// loads it on opening and the button is Load Excel; otherwise it is Load
// Demand, and turns into Load Excel once the demand is loaded (back to Load
// Demand when the branch / month / year change). Load Excel imports the
// bank's file for the month: each member's Excel amount fills their demand
// CD -> SSA -> Reg. Loan -> LAD; more than the demand is red (the extra is
// left to allocate), and a member with nothing in the Excel gets no entry.
// Add copies the ticked demand lines (and the Excel, when loaded) into the
// draft, where they can still be edited before Save. With no Excel, the
// demand total is the amount expected. Demand stays pending until the
// recovery is saved.
function DemandPickerDialog({ open, onClose, onAdd, lookups = {}, voucherDate = '', voucherId = '', draftLines = [], excluded = [] }) {
  const { token } = useAuth();
  const { activeFY } = useFY();
  const date = String(voucherDate || '').slice(0, 10);
  const [branchCode, setBranchCode] = useState('');
  const [month, setMonth] = useState(date ? String(Number(date.slice(5, 7))) : '');
  const [year, setYear] = useState(date ? date.slice(0, 4) : '');
  // (loadDemand's own month / year may come from its `period` argument.)
  const monthState = month;
  const yearState = year;
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  // The branch / month the loaded demand is for ('' branch = all), or null.
  const [loaded, setLoaded] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // The month's bank Excel: { batch, rows, outstanding } once imported.
  const [excel, setExcel] = useState(null);
  const [excelFilter, setExcelFilter] = useState('ALL');
  const members = Array.isArray(lookups.members) ? lookups.members : [];
  const already = new Set(draftLines.map((row) => row.demandLineId || (row.demandSource === 'MEMBER_DEMAND' ? `member:${row.member}:${row.demandYear}-${row.demandMonth}` : '')).filter(Boolean));
  // Memoised: the Excel preview below re-runs only when these change.
  const chosen = useMemo(() => rows.filter((row) => selected.has(candidateKey(row))), [rows, selected]);
  // What Add will do with the Excel, worked out on the ticked demand lines.
  const preview = useMemo(() => (excel ? addExcelLines(draftLines, excel, {
    candidates: chosen, members, excluded, outstanding: excel.outstanding, branchCode: loaded?.branchCode || ''
  }) : null), [excel, draftLines, chosen, members, excluded, loaded]);

  // Opening the dialog: if Demand Entry already has this month's demand it is
  // loaded straight away (the button is then Load Excel); otherwise nothing
  // is loaded until Load Demand.
  useEffect(() => {
    if (!open) return;
    // The month of the latest Demand Entry with pending members, up to the
    // voucher's month (October's demand is recovered in November); without
    // access to the Demand Entry list, the voucher's month.
    (async () => {
      let period = { month, year };
      try {
        const listing = await api.banking.demandEntry.list(token, { fyStart: activeFY?.start || '', fyEnd: activeFY?.end || '' });
        const picked = pickDemandEntryMonth(Array.isArray(listing?.data) ? listing.data : [], month, year);
        if (picked) {
          period = picked;
          setMonth(picked.month);
          setYear(picked.year);
        }
      } catch {
        // No Demand Entry access: keep the voucher's month.
      }
      if (period.month && period.year) loadDemand({ demandEntryOnly: true, period });
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
  const memberCodeById = new Map(members.map((member) => [String(member.id || member._id), String(member.code || '').toUpperCase()]));
  const excelTotal = (excel?.rows || []).reduce((sum, row) => sum + toPaise(row.importedTotalAmount), 0);
  const newlyExcluded = preview ? preview.excluded.length - excluded.length : 0;
  // After the import: each imported row against the member's demand (what
  // Add will put in the recovery), plus the demand members with nothing in
  // the Excel (0). Kinds: LESS / EXTRA / EQUAL, ZERO, NOMEMBER.
  const batchId = excel?.batch?.id || '';
  const compareRows = excel && preview ? [
    ...preview.lines.filter((line) => line.excel && (line.excel.batchId || line.importBatchId) === batchId).map((line) => ({
      key: line.importRowId || `m-${line.member}`,
      member: line.member,
      name: line.memberName || '',
      branch: line.unmatched ? (line.excel.branch || '') : (line.branchName || ''),
      demand: line.unmatched ? null : Number(line.demandAmount ?? 0),
      amount: Number(line.excel.amount || 0),
      kind: line.unmatched ? 'NOMEMBER' : (excelVsDemand(line) || 'EQUAL'),
      notInDemand: line.source === 'EXCEL' && !line.unmatched,
      pf: line.excel.pfNo || '',
      heads: line.heads || {}
    })),
    ...(preview.noEntryLines || []).map((item) => ({
      key: `no-${item.member}`, member: item.member, name: item.memberName, branch: item.branchName, demand: Number(item.demandAmount || 0), amount: 0, kind: 'ZERO', notInDemand: false, pf: '', heads: {}
    }))
  ] : [];
  const excelCounts = { ALL: compareRows.length, LESS: 0, EXTRA: 0, ZERO: 0 };
  for (const row of compareRows) if (row.kind in excelCounts) excelCounts[row.kind] += 1;
  const shownCompare = excelFilter === 'ALL' ? compareRows : compareRows.filter((row) => row.kind === excelFilter);
  const demandTotal = rows.reduce((sum, row) => sum + toPaise(row.totalAmount), 0);
  const demandLists = [...new Set(rows.map((row) => row.demandListNo).filter(Boolean))];

  // period: { month, year } to load (on opening, before state catches up).
  async function loadDemand({ demandEntryOnly = false, period = null } = {}) {
    const month = period?.month || monthState;
    const year = period?.year || yearState;
    if (!month || !year) {
      if (!demandEntryOnly) toast.error('Choose the demand month and year.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.banking.recoveryDemandCandidates(token, {
        branchCode, month, year, fyStart: activeFY?.start || '', fyEnd: activeFY?.end || ''
      });
      const next = Array.isArray(response.data) ? response.data : [];
      // On opening, only Demand Entry's demand counts as already loaded.
      if (demandEntryOnly && !next.some((row) => row.source === 'DEMAND')) return;
      setRows(next);
      setSelected(new Set(next.filter((row) => !already.has(candidateKey(row))).map(candidateKey)));
      setLoaded({ branchCode, month, year });
      // An Excel imported for the previous month/branch no longer applies.
      setExcel(null);
    } catch (error) {
      toast.error(error.message || 'Unable to load demand');
    } finally {
      setLoading(false);
    }
  }

  // The uploaded Excel, with each of its members' loan balance left, to fit
  // the amounts on. report(percent, label) moves the upload dialog's progress
  // bar; that dialog closes when this finishes.
  async function excelUploaded(batch, report = () => {}) {
    setLoading(true);
    try {
      report(93, 'Reading the imported rows…');
      const response = await api.recoveryImport.getBatchRows(token, batch.id);
      const excelRows = Array.isArray(response.data?.rows) ? response.data.rows : [];
      const codes = [...new Set(excelRows.map((row) => memberCodeById.get(String(row.memberId || ''))).filter(Boolean))];
      report(97, `Fetching the loan balances of ${codes.length} member(s)…`);
      const outstanding = codes.length
        ? (await api.banking.recoveryMemberOutstanding(token, { codes: codes.join(','), excludeVoucherId: voucherId || '' }))?.data || {}
        : {};
      setExcel({ batch, rows: excelRows, outstanding });
      setExcelFilter('ALL');
    } catch (error) {
      toast.error(error.message || 'Unable to read the imported rows');
    } finally {
      setLoading(false);
    }
  }

  // The loaded demand still matches the filters: the button is Load Excel.
  const demandReady = Boolean(loaded) && loaded.branchCode === branchCode && String(loaded.month) === String(month) && String(loaded.year) === String(year);
  const fromMemberData = rows.filter((row) => row.source === 'MEMBER_DEMAND').length;

  return (
    <Modal
      variant="mint"
      open
      title="Add From Demand List"
      subtitle="Load the month's demand (Demand Entry, else each member's Monthly Demand Data), then Load Excel: each member's Excel amount fills their demand CD → SSA → Reg. Loan → LAD. More than the demand is red; nothing in the Excel means no entry for the month. Lines can still be corrected before Save."
      onClose={onClose}
      wide
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-sm text-slate-600">{excel ? `${compareRows.length} row(s) compared with the demand · Excel ₹${formatHead(fromPaise(excelTotal))}` : demandReady ? `${selected.size} member(s) in the demand${fromMemberData ? ` · ${fromMemberData} from Monthly Demand Data` : ''}` : ''}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="button" disabled={!selected.size && !excel} onClick={() => onAdd(excel ? { excel, result: preview } : { candidates: chosen })} className="rounded-lg bg-[var(--primary,#2563eb)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add to Recovery</button>
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
          {demandReady ? (
            <button type="button" onClick={() => setUploadOpen(true)} disabled={loading} className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {excel ? 'Load a different Excel' : 'Load Excel'}
            </button>
          ) : (
            <button type="button" onClick={() => loadDemand()} disabled={loading} className="h-10 rounded-lg bg-[var(--primary,#2563eb)] px-4 text-sm font-medium text-white disabled:opacity-50">
              {loading ? 'Loading...' : 'Load Demand'}
            </button>
          )}
        </div>

        {excel ? (
          <>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-900">
              Excel <span className="font-semibold">{excel.batch.fileName || ''}</span>: {excel.rows.length} row(s) · ₹{formatHead(fromPaise(excelTotal))}.
              {' '}{preview.matched} match the demand, {preview.added} not in it (split over the member's demand set-up), {preview.unmatched} with no member
              {newlyExcluded ? `, ${newlyExcluded} excluded (0 amount, no membership date or another branch)` : ''}.
              {preview.noEntry ? ` ${preview.noEntry} demand member(s) have nothing in the Excel: no entry for them this month.` : ''}
              {preview.overDemand ? <span className="font-semibold text-red-700"> {preview.overDemand} member(s) have more than their demand: put the extra into a head after Add.</span> : null}
              {preview.loanCapped ? <span className="font-semibold text-red-700"> {preview.loanCapped} member(s) owe less loan than their loan demand: put the rest into a head after Add.</span> : null}
              {excel.batch?.payload?.footerTotal != null && !excel.batch.payload.footerMatches ? ` WARNING: the file's total line ₹${formatHead(excel.batch.payload.footerTotal)} differs from its member rows.` : ''}
            </div>
            <ExcelFilterChips value={excelFilter} onChange={setExcelFilter} counts={excelCounts} />
            <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: '52vh' }}>
              <table className="min-w-full text-left text-[12px]">
                <thead className="sticky top-0 z-10 bg-slate-100 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">Member</th>
                    <th className="px-2 py-1.5">Branch</th>
                    <th className="px-2 py-1.5 text-right">Demand</th>
                    <th className="px-2 py-1.5 text-right">Excel</th>
                    <th className="px-2 py-1.5 text-right">Excel − Demand</th>
                    <th className="px-2 py-1.5">Split</th>
                    <th className="px-2 py-1.5">Compared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shownCompare.map((row) => {
                    const difference = row.demand == null ? null : Math.round((row.amount - row.demand) * 100) / 100;
                    const red = row.kind === 'EXTRA' || row.kind === 'NOMEMBER';
                    const pill = {
                      LESS: ['Less', 'bg-sky-100 text-sky-800'],
                      EXTRA: ['Extra', 'bg-red-100 text-red-700'],
                      EQUAL: ['Equal', 'bg-emerald-100 text-emerald-700'],
                      ZERO: ['No entry', 'bg-slate-200 text-slate-600'],
                      NOMEMBER: ['No member', 'bg-red-100 text-red-700']
                    }[row.kind] || ['', ''];
                    return (
                      <tr key={row.key} className={red ? 'bg-red-50/70' : row.kind === 'ZERO' ? 'bg-slate-50 text-slate-500' : 'hover:bg-slate-50'}>
                        <td className="max-w-[320px] truncate px-2 py-1">
                          {row.member ? <><span className="font-semibold text-slate-900">{row.member}</span> {row.name}</> : <span className="text-red-700">PF {row.pf || '—'} {row.name}</span>}
                          {row.notInDemand ? <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10.5px] font-semibold text-amber-800">not in demand</span> : null}
                        </td>
                        <td className="max-w-[200px] truncate px-2 py-1 text-slate-600">{row.branch}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">{row.demand == null ? '—' : formatHead(row.demand)}</td>
                        <td className={`px-2 py-1 text-right font-semibold tabular-nums ${red ? 'text-red-700' : 'text-slate-900'}`}>{row.amount ? formatHead(row.amount) : '0'}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${difference > 0 ? 'font-semibold text-red-700' : difference < 0 ? 'text-sky-700' : 'text-slate-300'}`}>{difference == null ? '—' : difference === 0 ? '0' : `${difference > 0 ? '+' : '−'}${formatHead(Math.abs(difference))}`}</td>
                        <td className="px-2 py-1 text-[11px] text-slate-600">{RECOVERY_HEADS.filter(([head]) => Number(row.heads?.[head] || 0)).map(([head, label]) => `${label} ${formatHead(row.heads[head])}`).join(' · ')}</td>
                        <td className="px-2 py-1"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${pill[1]}`}>{pill[0]}</span></td>
                      </tr>
                    );
                  })}
                  {!shownCompare.length ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No rows in this filter.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </>
        ) : demandReady ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white px-6 py-10 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md"><FileSpreadsheet size={24} /></div>
            <div className="space-y-1">
              <h3 className="text-[17px] font-semibold text-slate-900">{MONTH_OPTIONS.find((option) => String(option.value) === String(loaded.month))?.label || loaded.month} {loaded.year} demand is ready</h3>
              <p className="text-[13px] text-slate-600">
                {rows.length} member(s) · ₹{formatHead(fromPaise(demandTotal))}
                {demandLists.length ? ` · Demand Entry ${demandLists.join(', ')}` : ''}
                {fromMemberData ? ` · ${fromMemberData} from Monthly Demand Data` : ''}
              </p>
            </div>
            <button type="button" onClick={() => setUploadOpen(true)} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-[15px] font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50">
              <FileSpreadsheet size={18} /> Load Excel
            </button>
            <p className="max-w-lg text-[12px] text-slate-500">The imported rows are then shown against each member's demand (Less, Extra, 0). Without an Excel, Add takes the demand total as the amount received.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-8 text-center text-[13px] text-slate-500">
            {loading ? 'Loading the month\'s demand…' : loaded ? 'No pending demand and no member Monthly Demand Data for this branch and month.' : 'No Demand Entry with pending members up to this month. Choose the month and year, then Load Demand.'}
          </div>
        )}
      </div>
      {/* data-modal-portal: clicks in the upload dialog are not "outside" this one. */}
      {createPortal(<div data-modal-portal="true"><UploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onUploadSuccess={excelUploaded} token={token} /></div>, document.body)}
    </Modal>
  );
}

// The Recovery draft grid. Rows come from Demand List, Excel or Add Record;
// each can be edited or removed before Save. Nothing here saves anything.
// A row is red until its heads add up exactly to its expected (Excel)
// amount; Save needs every row valid.
function RecoveryLinesEditor({ rows = [], excluded = [], onChange, onOutstanding, memberGroups = [], lookups = {}, voucherDate = '', voucherId = '' }) {
  const { token } = useAuth();
  const confirm = useConfirm();
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeExcluded = Array.isArray(excluded) ? excluded : [];
  const [memberDialog, setMemberDialog] = useState(null);
  const [demandOpen, setDemandOpen] = useState(false);
  const [notice, setNotice] = useState('');
  // All / Less / Extra / 0 over the lines; 0 = the demand members the last
  // Excel gave nothing (they get no line, so they are listed apart).
  const [excelFilter, setExcelFilter] = useState('ALL');
  const [noEntry, setNoEntry] = useState([]);
  const checkedRows = withWarnings(safeRows);
  const excelCounts = { ALL: safeRows.length, LESS: 0, EXTRA: 0, ZERO: noEntry.length };
  for (const row of safeRows) { const kind = excelVsDemand(row); if (kind in excelCounts) excelCounts[kind] += 1; }
  const indexedRows = checkedRows.map((row, index) => ({ row, index }));
  const shownRows = excelFilter === 'ALL' ? indexedRows : excelFilter === 'ZERO' ? [] : indexedRows.filter(({ row }) => excelVsDemand(row) === excelFilter);
  const summary = reconcile(safeRows);
  const members = Array.isArray(lookups.members) ? lookups.members : [];
  const hasExcel = safeRows.some((row) => row.excel) || safeExcluded.length > 0;
  const excludedTotal = safeExcluded.reduce((sum, row) => sum + Math.round(Number(row.amount || 0) * 100), 0) / 100;

  // Each member's loan outstanding before this recovery (the voucher's own
  // cuts added back when it is being edited): a loan cut past it, or while
  // nothing is owed, makes the row red. Fetched again when members change.
  const codesKey = [...new Set(safeRows.map((row) => row.member).filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!codesKey || !token) return undefined;
    let alive = true;
    api.banking.recoveryMemberOutstanding(token, { codes: codesKey, excludeVoucherId: voucherId || '' })
      .then((response) => { if (alive) onOutstanding?.(response?.data || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, [codesKey, token, voucherId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // From the demand dialog: the ticked demand lines, with the month's Excel
  // (when loaded) fitted onto them by member; with no Excel, the demand
  // total is each line's expected amount.
  function addDemand({ candidates = [], excel = null, result = null }) {
    setDemandOpen(false);
    if (!excel) {
      const demand = addDemandLines(safeRows, candidates, { withExpected: true });
      onChange(demand.lines);
      const check = reconcile(demand.lines);
      setNotice(`${demand.added} demand line(s) added${demand.skipped ? `, ${demand.skipped} already in this recovery` : ''}. Demand stays pending until you Save. ${check.errorRows ? `${check.errorRows} row(s) to correct.` : 'Every row reconciles.'}`);
      return;
    }
    onChange(result.lines, result.excluded);
    setNoEntry(result.noEntryLines || []);
    setExcelFilter('ALL');
    const check = reconcile(result.lines);
    const batch = excel.batch;
    const footer = batch?.payload?.footerTotal;
    const footerNote = footer == null ? '' : (batch.payload.footerMatches ? ` File total ₹${formatHead(footer)} matches its member rows.` : ` WARNING: the file's total line ₹${formatHead(footer)} differs from its member rows ₹${formatHead(batch.payload.parsedTotal)}.`);
    const skipped = [
      result.otherBranch ? `${result.otherBranch} row(s) of other branches` : '',
      result.zeroAmount ? `${result.zeroAmount} row(s) with a 0 amount` : '',
      result.noMembershipDate ? `${result.noMembershipDate} row(s) of members with no membership date` : ''
    ].filter(Boolean);
    const skippedNote = skipped.length ? ` Excluded (listed below): ${skipped.join(', ')}.` : '';
    setNotice(`${result.demandMatched} demand line(s) added. Excel: ${result.matched} matched a demand line, ${result.added} not in the demand, ${result.unmatched} with no member; ${result.adjusted} adjusted to the Excel amount.${result.noEntry ? ` ${result.noEntry} demand member(s) with nothing in the Excel: no entry this month.` : ''}${skippedNote}${footerNote} ${check.errorRows ? `${check.errorRows} row(s) to correct.` : 'Every row reconciles.'}`);
  }

  // Removing a line holding an Excel row excludes that row, and needs a
  // reason (it is kept with the recovery).
  async function remove(index) {
    const row = safeRows[index];
    let reason = '';
    if (row?.excel?.rowId) {
      const who = row.unmatched ? `PF ${row.excel.pfNo || '—'}` : `${row.member} ${row.memberName || ''}`.trim();
      reason = await confirm({
        title: 'Exclude Excel row',
        description: `Excel row ${row.excel.rowNo ?? '—'} (${who}, ₹${formatHead(row.excel.amount)}) will be left out of this recovery and its Excel total.`,
        confirmLabel: 'Exclude',
        requireReason: true,
        reasonLabel: 'Reason for excluding',
        reasonPlaceholder: 'e.g. deducted for another month',
        defaultReason: row.unmatched ? 'No member for this PF' : ''
      });
      if (reason == null) return;
    }
    const next = removeLine(safeRows, index, safeExcluded, reason);
    onChange(next, next.excluded);
  }

  function restoreExcluded(index) {
    onChange(safeRows, safeExcluded.filter((_, i) => i !== index));
    setNotice('The row was taken off the excluded list. Import the Excel again to bring it back into the recovery.');
  }

  // Share, Premium, Admission and Suspense are shown only when some line has
  // them; the four demand heads always are.
  const visibleHeads = RECOVERY_HEADS.filter(([key]) => ['cd', 'ssa', 'loan', 'lad'].includes(key) || Number(summary.heads[key] || 0) !== 0);
  const columnCount = visibleHeads.length + 7;
  const openDemand = () => setDemandOpen(true);
  const openManual = () => setMemberDialog({ index: null, heads: emptyHeads() });

  return (
    <div className="space-y-2">
      {safeRows.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
          <button type="button" onClick={openDemand} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--primary,#2563eb)] px-3.5 text-[13px] font-semibold text-white shadow-sm hover:opacity-90">
            <ClipboardList size={16} /> Add From Demand List
          </button>
          <button type="button" onClick={openManual} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100">
            <Plus size={15} /> Add Record
          </button>
          {hasExcel || noEntry.length ? <><span className="mx-1 h-6 w-px bg-slate-200" /><ExcelFilterChips value={excelFilter} onChange={setExcelFilter} counts={excelCounts} /></> : null}
          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 pr-1 text-[12px]">
            <ToolbarFigure label={hasExcel ? 'Excel' : 'Expected'} value={formatHead(summary.excelTotal)} />
            <ToolbarFigure label="Recovery" value={formatHead(summary.recoveryTotal)} />
            <ToolbarFigure label="Difference" value={summary.difference === 0 ? '0' : formatHead(summary.difference)} tone={summary.difference === 0 ? 'ok' : 'bad'} />
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${summary.canSave ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
              {summary.canSave ? 'Ready to save' : `${summary.errorRows} row(s) to fix`}
            </span>
          </div>
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[12px] text-slate-600">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss"><X size={14} /></button>
        </div>
      ) : null}

      {!safeRows.length ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-blue-200 bg-gradient-to-b from-blue-50/70 to-white px-6 py-10 text-center" style={{ minHeight: 'calc(96vh - 290px)' }}>
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--primary,#2563eb)] text-white shadow-md"><ClipboardList size={28} /></div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-900">Start with this month's demand</h3>
            <p className="mx-auto max-w-lg text-[13px] text-slate-500">Load the month's demand (Demand Entry, else each member's Monthly Demand Data), then the bank's Excel: each member's amount fills CD → SSA → Reg. Loan → LAD.</p>
          </div>
          <button type="button" onClick={openDemand} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--primary,#2563eb)] px-6 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/20 hover:opacity-90">
            <ClipboardList size={18} /> Add From Demand List
          </button>
          <ol className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-slate-500">
            {['Load Demand', 'Load Excel', 'Fix red rows', 'Save'].map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1"><span className="grid h-4 w-4 place-items-center rounded-full bg-slate-800 text-[10px] font-bold text-white">{i + 1}</span>{step}</span>
                {i < 3 ? <span className="text-slate-300">→</span> : null}
              </li>
            ))}
          </ol>
          <button type="button" onClick={openManual} className="text-[12px] font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">or add one member by hand</button>
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white" style={{ maxHeight: 'calc(96vh - 250px)', minHeight: 240 }}>
          <table className="min-w-full text-left text-[12px]">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
              <tr>
                <th className="px-2 py-1.5">Member</th>
                <th className="px-2 py-1.5">Branch · Designation</th>
                <th className="px-2 py-1.5 text-right">Expected</th>
                {visibleHeads.map(([key, label]) => <th key={key} className="px-2 py-1.5 text-right">{label}</th>)}
                <th className="px-2 py-1.5 text-right">Allocated</th>
                <th className="px-2 py-1.5 text-right">Diff.</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="sticky right-0 bg-slate-100 px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shownRows.map(({ row, index }) => {
                const record = getMemberRecord(lookups, row.member);
                const status = lineStatus(row, safeRows);
                const bad = status !== 'VALID';
                const errors = lineErrors(row, safeRows);
                const notes = row.warnings || [];
                const expected = expectedPaise(row);
                const difference = lineDifference(row);
                const designation = row.designation || getDesignationLabel(record);
                // The branch's name (some lines carry only its code).
                const branchName = getBranchLabel(lookups, record?.branchCode) || row.branchName || '';
                return (
                  <tr key={`${row.demandLineId || row.importRowId || 'line'}-${index}`} className={bad ? 'bg-red-50/70 shadow-[inset_3px_0_0_0_#dc2626]' : 'hover:bg-slate-50'}>
                    <td className="max-w-[300px] px-2 py-1 align-top">
                      <div className="flex items-center gap-1.5">
                        {row.unmatched
                          ? <span className="truncate font-medium text-red-700">PF {row.excel?.pfNo || '—'} <span className="font-normal">{row.memberName}</span></span>
                          : <><span className="font-semibold text-slate-900">{row.member}</span><span className="truncate text-slate-700">{row.memberName || record?.name || ''}</span></>}
                        {notes.length ? <span title={notes.join('\n')} aria-label={`${notes.length} note(s): ${notes.join('; ')}`} className="inline-flex shrink-0 cursor-help items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-px text-[10.5px] font-semibold text-amber-800"><Info size={11} />{notes.length}</span> : null}
                      </div>
                      {errors.length ? <div className="mt-0.5 text-[11px] font-medium leading-snug text-red-700">{errors.join(' ')}</div> : null}
                    </td>
                    <td className="max-w-[210px] truncate px-2 py-1 align-top text-slate-600" title={`${branchName} · ${designation || ''}`}>
                      {branchName}{designation ? <span className="text-slate-400"> · {designation}</span> : null}
                    </td>
                    <td className="px-2 py-1 text-right align-top font-semibold tabular-nums text-slate-900">{expected == null ? '—' : formatHead(fromPaise(expected))}</td>
                    {visibleHeads.map(([key]) => <td key={key} className="px-2 py-1 text-right align-top tabular-nums text-slate-700">{formatHead(row.heads?.[key])}</td>)}
                    <td className="px-2 py-1 text-right align-top font-semibold tabular-nums text-slate-900">{formatHead(lineTotal(row))}</td>
                    <td className={`px-2 py-1 text-right align-top font-semibold tabular-nums ${difference === 0 ? 'text-slate-300' : 'text-red-700'}`}>{difference === 0 ? '0' : formatHead(difference)}</td>
                    <td className="px-2 py-1 align-top">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${bad ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{STATUS_LABELS[status]}</span>
                    </td>
                    <td className={`sticky right-0 whitespace-nowrap px-1 py-0.5 text-right align-top ${bad ? 'bg-red-50' : 'bg-white'}`}>
                      {row.excel && !row.unmatched && bad ? (
                        <button type="button" onClick={() => onChange(applyExcelHeads(safeRows, index))} className="rounded p-1 text-emerald-700 hover:bg-emerald-50" title="Use the Excel split (the Excel amount over the member's monthly demand heads)" aria-label="Use Excel split"><FileSpreadsheet size={15} /></button>
                      ) : null}
                      {!row.unmatched ? <button type="button" onClick={() => setMemberDialog({ index, ...row })} className="rounded p-1 text-[var(--primary,#2563eb)] hover:bg-blue-50" title="Edit" aria-label={`Edit ${row.member}`}><Pencil size={15} /></button> : null}
                      <button type="button" onClick={() => remove(index)} className="rounded p-1 text-rose-600 hover:bg-rose-50" title={row.excel?.rowId ? 'Exclude this Excel row' : 'Remove'} aria-label={row.excel?.rowId ? 'Exclude' : 'Remove'}><X size={15} /></button>
                    </td>
                  </tr>
                );
              })}
              {excelFilter === 'ZERO' ? noEntry.map((item) => (
                <tr key={`no-entry-${item.member}`} className="bg-slate-50 text-slate-500">
                  <td className="px-2 py-1"><span className="font-semibold">{item.member}</span> {item.memberName}</td>
                  <td className="truncate px-2 py-1">{item.branchName}{item.designation ? ` · ${item.designation}` : ''}</td>
                  <td className="px-2 py-1 text-right">0</td>
                  <td colSpan={visibleHeads.length + 2} className="px-2 py-1">Nothing in the Excel (demand ₹{formatHead(item.demandAmount)}): no entry this month, demand stays pending.</td>
                  <td className="px-2 py-1"><span className="whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">No entry</span></td>
                  <td></td>
                </tr>
              )) : null}
              {excelFilter !== 'ALL' && !shownRows.length && !(excelFilter === 'ZERO' && noEntry.length) ? (
                <tr><td colSpan={columnCount} className="px-3 py-6 text-center text-slate-500">No members in this filter.</td></tr>
              ) : null}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-100 font-semibold text-slate-800 shadow-[0_-1px_0_0_#e2e8f0]">
              <tr>
                <td className="px-2 py-1.5" colSpan={2}>Total · {safeRows.length} members</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatHead(summary.excelTotal)}</td>
                {visibleHeads.map(([key]) => <td key={key} className="px-2 py-1.5 text-right tabular-nums">{formatHead(summary.heads[key])}</td>)}
                <td className="px-2 py-1.5 text-right tabular-nums">{formatHead(summary.recoveryTotal)}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${summary.difference === 0 ? 'text-slate-400' : 'text-red-700'}`}>{summary.difference === 0 ? '0' : formatHead(summary.difference)}</td>
                <td></td>
                <td className="sticky right-0 bg-slate-100"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {safeExcluded.length ? (
        <details className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-1.5">
          <summary className="cursor-pointer text-[12px] font-semibold text-amber-800">Excluded Excel rows: {safeExcluded.length} · ₹{formatHead(excludedTotal)} (not in this recovery or its Excel total)</summary>
          <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-[12px] text-amber-900">
            {safeExcluded.map((row, index) => (
              <li key={`${row.importRowId}-${index}`} className="flex items-center justify-between gap-3">
                <span>Row {row.rowNo ?? '—'} · PF {row.pfNo || '—'} {row.name ? `· ${row.name}` : ''} · ₹{formatHead(row.amount)} — {row.reason}</span>
                <button type="button" onClick={() => restoreExcluded(index)} className="shrink-0 font-medium text-[var(--primary,#2563eb)] hover:underline">Un-exclude</button>
              </li>
            ))}
          </ul>
        </details>
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
        voucherId={voucherId}
        draftLines={safeRows}
        excluded={safeExcluded}
      /></div>, document.body)}
    </div>
  );
}

function ToolbarFigure({ label, value, tone = '' }) {
  const color = tone === 'bad' ? 'text-red-700' : tone === 'ok' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <span className="whitespace-nowrap">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</span>{' '}
      <span className={`text-[14px] font-bold tabular-nums ${color}`}>{value}</span>
    </span>
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
  // Loan outstanding per member, from the recovery editor: applied to the
  // rows here so the grid and the Save check both see it.
  const [recoveryOutstanding, setRecoveryOutstanding] = useState({});
  const recoveryRows = withOutstanding(normalizeDraftLines(draft.details?.recoveryLines), recoveryOutstanding);
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
        <SectionTitle>SSA Paid To Member</SectionTitle>
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
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="SSA paid to member remarks" />
          </div>
        </div>
      </section>
    );
  }

  // Recovery: one compact strip for the voucher (cheque fields only for DD /
  // Cheque) and the total, then the member workspace takes the rest.
  function renderRecoveryForm() {
    const chequeMode = ['DD', 'CHEQUE'].includes(String(draft.mode || '').toUpperCase());
    const mini = 'h-9 text-[13px]';
    return (
      <section className="space-y-2">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
          <MiniField label="Voucher No." className="w-24"><Input className={mini} value={draft.voucherNo || ''} readOnly placeholder="Auto" /></MiniField>
          <MiniField label="Date" required className="w-40"><Input className={mini} type="date" value={draft.date || ''} onChange={(event) => setRootValue(setValue, 'date', event.target.value)} /></MiniField>
          <MiniField label="Mode" required className="w-36"><CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} /></MiniField>
          {chequeMode ? (
            <>
              <MiniField label="DD / Cheque No." className="w-40"><Input className={mini} value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Number" /></MiniField>
              <MiniField label="Cheque Date" className="w-40"><Input className={mini} type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} /></MiniField>
            </>
          ) : null}
          <MiniField label="Narration" className="min-w-[220px] flex-1"><Input className={mini} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Recovery remarks" /></MiniField>
          <div className="ml-auto pl-2 text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Total Recovery</div>
            <div className="text-xl font-bold tabular-nums text-slate-900">₹ {formatHead(amountValue) === '-' ? '0' : formatHead(amountValue)}</div>
          </div>
        </div>

        <RecoveryLinesEditor rows={recoveryRows} excluded={recoveryExcluded} onChange={updateRecoveryRows} memberGroups={memberGroups} lookups={lookups} voucherDate={draft.date} voucherId={draft.id || draft._id || ''} onOutstanding={setRecoveryOutstanding} />
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
      {documentDefs.length && isRecovery ? (
        // Recovery: the member workspace gets the room; attachments fold away.
        <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-slate-600">
            <Paperclip size={14} /> Attachments · {documentDefs.filter((def) => draft.documents?.[def.key]).length} of {documentDefs.length} added
          </summary>
          <div className="mt-2"><SimpleDocumentList definitions={documentDefs} documents={draft.documents || {}} onPickFile={updateDocumentMap} onClearFile={clearDocument} /></div>
        </details>
      ) : documentDefs.length ? (
        <section className="space-y-3">
          <SectionTitle>Attachments</SectionTitle>
          <SimpleDocumentList definitions={documentDefs} documents={draft.documents || {}} onPickFile={updateDocumentMap} onClearFile={clearDocument} />
        </section>
      ) : null}
    </form>
  );
}

export default MemberTransactionForm;

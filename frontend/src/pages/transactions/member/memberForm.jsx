import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../api/api';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { getMemberDocumentDefinitions } from './memberDocumentUtils';
import { Modal } from '../../../components/ui/Modal';
import { useFY } from '../../../context/FYContext';
import UploadModal from './recovery-import/UploadModal';
import {
  RECOVERY_HEADS, addDemandLines, addImportRows, draftTotals, emptyHeads, lineTotal, manualLine,
  normalizeDraftLines, removeLine, updateLineHeads
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

const SOURCE_LABELS = { DEMAND: 'Demand', EXCEL: 'Excel', MANUAL: 'Manual' };

function formatHead(value) {
  const number = Number(value || 0);
  return number ? number.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '-';
}

// Add Record / Edit: one member line. Editing keeps the line's demand or
// Excel provenance; only the amounts change, and only in the draft.
function RecoveryMemberDialog({ state, onClose, onSave, memberGroups = [], lookups = {} }) {
  const [member, setMember] = useState(state?.member || '');
  const [heads, setHeads] = useState({ ...emptyHeads(), ...(state?.heads || {}) });
  const editing = state?.index != null;
  const memberRecord = getMemberRecord(lookups, member);
  const total = lineTotal({ heads });
  if (!state) return null;

  function submit() {
    if (!member) {
      alert('Select a member.');
      return;
    }
    if (total <= 0) {
      alert('Enter at least one recovered amount.');
      return;
    }
    onSave({ member, memberRecord, heads });
  }

  return (
    <Modal
      open
      title={editing ? `Edit Recovery — ${member}` : 'Add Recovery Record'}
      onClose={onClose}
      width="min(820px, 96vw)"
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">Member total: {formatHead(total)}</span>
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
        {state.reviewNote ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{state.reviewNote}</p> : null}
        <div className="grid gap-3 md:grid-cols-4">
          {RECOVERY_FIELDS.map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <FieldLabel>{label}</FieldLabel>
              <Input type="number" min="0" step="0.01" value={heads[key]} onChange={(e) => setHeads((curr) => ({ ...curr, [key]: e.target.value }))} placeholder="0" />
            </div>
          ))}
        </div>
        <p className="text-[12px] text-slate-500">Insurance Premium and Suspense have no confirmed posting rule yet: a recovery with either amount will not save.</p>
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
      width="min(1200px, 97vw)"
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
              options={[{ label: 'All branches', value: '' }, ...branches.map((branch) => ({ label: `${branch.code} - ${branch.place || branch.label || ''}`, value: branch.code }))]}
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
function RecoveryLinesEditor({ rows = [], onChange, memberGroups = [], lookups = {}, voucherDate = '' }) {
  const { token } = useAuth();
  const safeRows = Array.isArray(rows) ? rows : [];
  const [memberDialog, setMemberDialog] = useState(null);
  const [demandOpen, setDemandOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const totals = draftTotals(safeRows);
  const members = Array.isArray(lookups.members) ? lookups.members : [];
  const toReview = safeRows.filter((row) => row.needsReview).length;

  function saveMemberLine({ member, memberRecord, heads }) {
    if (memberDialog.index != null) {
      onChange(updateLineHeads(safeRows, memberDialog.index, heads));
    } else {
      onChange([...safeRows, manualLine({
        ...(memberRecord || { code: member }),
        branchName: getBranchLabel(lookups, memberRecord?.branchCode),
        designation: getDesignationLabel(memberRecord)
      }, heads)]);
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
      const result = addImportRows(safeRows, importRows, members, batch.id);
      onChange(result.lines);
      const rejected = result.rejected.length
        ? ` ${result.rejected.length} row(s) not added: ${result.rejected.slice(0, 5).map((row) => `row ${row.row} PF ${row.pfNo} (${row.reason})`).join('; ')}${result.rejected.length > 5 ? '…' : ''}`
        : '';
      setNotice(`${result.added} Excel row(s) added, ${result.flagged} to review.${rejected}`);
    } catch (error) {
      alert(error.message || 'Unable to read the imported rows');
    }
  }

  const toolbarButton = 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle subtitle="Load members, correct any wrong amounts, check the totals, then Save.">Member Recovery</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDemandOpen(true)} className={toolbarButton}>Add From Demand List</button>
          <button type="button" onClick={() => setUploadOpen(true)} className={toolbarButton}>Import Excel</button>
          <button type="button" onClick={() => setMemberDialog({ index: null, heads: emptyHeads() })} className="rounded-lg bg-[var(--primary,#2563eb)] px-4 py-2 text-sm font-medium text-white">+ Add Record</button>
        </div>
      </div>
      {notice ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">{notice}</p> : null}
      {toReview ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{toReview} row(s) need review — open Edit, correct the amounts and Update.</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-2 py-2">Member</th>
              <th className="px-2 py-2">Branch</th>
              <th className="px-2 py-2">Designation</th>
              {RECOVERY_HEADS.map(([key, label]) => <th key={key} className="px-2 py-2 text-right">{label}</th>)}
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeRows.map((row, index) => {
              const record = getMemberRecord(lookups, row.member);
              return (
                <tr key={`${row.demandLineId || row.importRowId || 'line'}-${index}`} className={row.needsReview ? 'bg-amber-50/60' : ''}>
                  <td className="px-2 py-1.5"><span className="font-medium text-slate-800">{row.member}</span> <span className="text-slate-600">{row.memberName || record?.name || ''}</span></td>
                  <td className="px-2 py-1.5 text-slate-600">{row.branchName || getBranchLabel(lookups, record?.branchCode)}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.designation || getDesignationLabel(record)}</td>
                  {RECOVERY_HEADS.map(([key]) => <td key={key} className="px-2 py-1.5 text-right text-slate-700">{formatHead(row.heads?.[key])}</td>)}
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-800">{formatHead(lineTotal(row))}</td>
                  <td className="px-2 py-1.5 text-slate-600" title={row.reviewNote || ''}>
                    {SOURCE_LABELS[row.source] || 'Manual'}{row.demandListNo ? ` #${row.demandListNo}` : ''}{row.needsReview ? ' ⚠' : ''}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <button type="button" onClick={() => setMemberDialog({ index, ...row })} className="mr-3 font-medium text-[var(--primary,#2563eb)] hover:underline">Edit</button>
                    <button type="button" onClick={() => onChange(removeLine(safeRows, index))} className="font-medium text-rose-600 hover:text-rose-700">Remove</button>
                  </td>
                </tr>
              );
            })}
            {!safeRows.length ? (
              <tr><td colSpan={RECOVERY_HEADS.length + 6} className="px-3 py-6 text-center text-slate-500">No members yet — use Add From Demand List, Import Excel or Add Record.</td></tr>
            ) : null}
          </tbody>
          {safeRows.length ? (
            <tfoot className="bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-2 py-2" colSpan={3}>Total ({safeRows.length} members)</td>
                {RECOVERY_HEADS.map(([key]) => <td key={key} className="px-2 py-2 text-right">{formatHead(totals.heads[key])}</td>)}
                <td className="px-2 py-2 text-right">{formatHead(totals.total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

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
                <button type="button" onClick={() => triggerPicker(definition.key)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {document ? 'Replace file' : 'Select file'}
                </button>
                {document ? (
                  <button type="button" onClick={() => onClearFile?.(definition.key, document)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                    Remove
                  </button>
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
  const loanAmount = Number(draft.details?.components?.loanAmt || 0);
  const ladAmount = Number(draft.details?.components?.lad || 0);
  const recoveryTotal = draftTotals(recoveryRows).total;
  const amountValue = isLoan ? loanAmount + ladAmount : isRecovery ? recoveryTotal : Number(draft.amount || 0);

  function updateDetails(path, nextValue) {
    setDetailsValue(setValue, path, nextValue);
  }

  function updateComponents(path, nextValue) {
    setDetailsValue(setValue, ['components', path], nextValue);
  }

  function updateRecoveryRows(nextRows) {
    setDetailsValue(setValue, 'recoveryLines', nextRows);
    const nextTotal = draftTotals(nextRows).total;
    setRootValue(setValue, 'amount', nextTotal > 0 ? nextTotal : '');
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
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Settlement Account</FieldLabel>
            <Input value={draft.details?.settlementAccount || ''} onChange={(event) => updateDetails('settlementAccount', event.target.value)} placeholder="Settlement account or ledger" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Loan Amount</FieldLabel>
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
            <FieldLabel>LAD (Loan Against Deposit)</FieldLabel>
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
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
            Send SMS to member
          </label>
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
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Settlement Account</FieldLabel>
            <Input value={draft.details?.settlementAccount || ''} onChange={(event) => updateDetails('settlementAccount', event.target.value)} placeholder="Settlement account or ledger" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Amount</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draft.amount ?? ''} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Account Head</FieldLabel>
            <Input value={draft.details?.accountHead || ''} onChange={(event) => updateDetails('accountHead', event.target.value)} placeholder="Deposit account head" />
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
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
            Send SMS to member
          </label>
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
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Settlement Account</FieldLabel>
            <Input value={draft.details?.settlementAccount || ''} onChange={(event) => updateDetails('settlementAccount', event.target.value)} placeholder="Settlement account or ledger" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Amount</FieldLabel>
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
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
            Send SMS to member
          </label>
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
            <FieldLabel required>Amount</FieldLabel>
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
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
            Send SMS to member
          </label>
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
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <FieldLabel>Voucher No.</FieldLabel>
              <Input value={draft.voucherNo || ''} readOnly placeholder="Generating..." />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Date</FieldLabel>
              <Input type="date" value={draft.date || ''} onChange={(event) => setRootValue(setValue, 'date', event.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
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

        <RecoveryLinesEditor rows={recoveryRows} onChange={updateRecoveryRows} memberGroups={memberGroups} lookups={lookups} voucherDate={draft.date} />

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
              <button type="button" disabled title="SMS is not configured" className="h-10 cursor-not-allowed rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-400">
                Send SMS — not configured
              </button>
            </div>
            <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
              <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Recovery remarks" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full max-w-5xl space-y-3" onSubmit={onSubmit}>
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

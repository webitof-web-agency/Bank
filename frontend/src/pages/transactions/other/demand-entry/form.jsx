import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../api/api';
import { Input, Textarea } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { useAuth } from '../../../../context/AuthContext';
import {
  DEMAND_HEADS, MONTH_OPTIONS, demandLineTotal, demandTotals, isRecoveredLine, listNoForMonth, mergeLoadedMembers, removeDemandLine, updateDemandLine
} from './demandEntryDraft';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-1.5 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

function money(value) {
  const number = Number(value || 0);
  return number ? number.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-';
}

// Demand Entry: header (FY, branch, month, year, list no, date) and member
// lines with the demand heads. Totals are derived; recovered lines are locked.
// allowAllBranches (not for a locked list): "All branches" loads every
// branch's members and saves one list per branch with the same list number;
// when editing, the list's own branch is updated and the others are added.
export function DemandForm({ value, setValue, onSubmit, branches = [], members = [], fy = null, locked = false, allowAllBranches = false, entries = [], editingId = '' }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [addCode, setAddCode] = useState('');
  const lines = Array.isArray(value.lines) ? value.lines : [];
  const totals = demandTotals(lines);
  const setField = (key, next) => setValue((current) => ({ ...current, [key]: next }));
  // Changing the month or year suggests that month's list number (shared by all
  // branches); a branch-wise list may use its own number.
  const setPeriod = (key, next) => setValue((current) => {
    const draft = { ...current, [key]: next };
    return { ...draft, demandListNo: listNoForMonth(entries, draft.month, draft.year) || current.demandListNo };
  });
  const setLines = (next) => setValue((current) => ({ ...current, lines: typeof next === 'function' ? next(current.lines || []) : next }));
  const allBranches = value.branchCode === 'ALL';
  const branchMembers = allBranches
    ? members
    : members.filter((member) => String(member.branchCode || '').toUpperCase() === String(value.branchCode || '').toUpperCase());

  async function loadMembers() {
    if (!value.branchCode) {
      toast.error('Choose the branch first.');
      return;
    }
    setLoading(true);
    try {
      // A member's demand is raised once per month: members who already have
      // it for this month (another list, or recovered) are not loaded again.
      const response = await api.banking.demandEntry.members(token, {
        branchCode: value.branchCode, month: value.month || '', year: value.year || '', excludeId: editingId
      });
      const result = mergeLoadedMembers(lines, Array.isArray(response.data) ? response.data : []);
      setLines(result.lines);
      const skipped = Number(response.skipped || 0);
      toast.success(`${result.added} member(s)${allBranches ? ' of all branches' : ''} loaded with their usual demand.${skipped ? ` ${skipped} already have demand for this month and were not loaded.` : ''} Correct any amount before saving.`);
    } catch (error) {
      toast.error(error.message || 'Unable to load demand');
    } finally {
      setLoading(false);
    }
  }

  function addMember() {
    const member = members.find((item) => String(item.code) === String(addCode));
    if (!member) return;
    setLines((current) => mergeLoadedMembers(current, [{ memberCode: member.code, memberName: member.name, branchCode: member.branchCode, designation: member.designation }]).lines);
    setAddCode('');
  }

  return (
    <form id="demand-form" onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-6">
        <div>
          <FieldLabel>Financial Year</FieldLabel>
          <Input value={fy?.label || ''} readOnly />
        </div>
        <div className="md:col-span-2">
          <FieldLabel required>Branch</FieldLabel>
          <Select
            searchable
            disabled={locked}
            value={value.branchCode || ''}
            onChange={(next) => setField('branchCode', next)}
            options={[
              { value: '', label: 'Select branch' },
              ...(allowAllBranches ? [{ value: 'ALL', label: 'All branches (one list per branch)' }] : []),
              ...branches.map((branch) => ({ value: branch.code, label: `${branch.code} - ${branch.label || ''}` }))
            ]}
          />
        </div>
        <div>
          <FieldLabel required>Month</FieldLabel>
          <Select disabled={locked} value={value.month || ''} onChange={(next) => setPeriod('month', next)} options={MONTH_OPTIONS} placeholder="Month" />
        </div>
        <div>
          <FieldLabel required>Year</FieldLabel>
          <Input type="number" disabled={locked} value={value.year || ''} onChange={(event) => setPeriod('year', event.target.value)} placeholder="2026" />
        </div>
        <div>
          <FieldLabel required>List No. <span className="font-normal text-slate-400">(one per branch per month)</span></FieldLabel>
          <Input disabled={locked} value={value.demandListNo || ''} onChange={(event) => setField('demandListNo', event.target.value)} />
        </div>
        <div>
          <FieldLabel>List Date</FieldLabel>
          <Input type="date" value={value.demandListDate || ''} onChange={(event) => setField('demandListDate', event.target.value)} />
        </div>
        <div className="md:col-span-5">
          <FieldLabel>Remarks</FieldLabel>
          <Textarea rows={1} value={value.remarks || ''} onChange={(event) => setField('remarks', event.target.value)} placeholder="Optional" />
        </div>
      </div>
      {locked ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Some members of this list are already recovered: the list number, branch, month and year are fixed, and recovered lines cannot change.</p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Member Demand</h4>
          <p className="text-[12px] text-slate-500">Load the branch's members (pre-filled with their usual demand), then correct the amounts. Totals are calculated.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <Select
              searchable
              value={addCode}
              onChange={setAddCode}
              placeholder="Add a member..."
              options={branchMembers.map((member) => ({ value: member.code, label: `${member.code} - ${member.name || ''}` }))}
            />
          </div>
          <button type="button" onClick={addMember} disabled={!addCode} className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Add</button>
          <button type="button" onClick={loadMembers} disabled={loading} className="h-10 rounded-lg bg-[var(--primary,#2563eb)] px-4 text-sm font-medium text-white disabled:opacity-50">
            {loading ? 'Loading...' : 'Load Demand'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-2 py-2">Member</th>
              {DEMAND_HEADS.map(([key, label]) => <th key={key} className="px-2 py-2 text-right">{label}</th>)}
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const recovered = isRecoveredLine(line);
              return (
                <tr key={line.memberCode} className={recovered ? 'bg-emerald-50/50' : ''}>
                  <td className="px-2 py-1">
                    <span className="font-medium text-slate-800">{line.memberCode}</span> <span className="text-slate-600">{line.memberName}</span>
                    {allBranches && line.branchCode ? <span className="ml-1 text-[11px] text-slate-400">· Branch {line.branchCode}</span> : null}
                  </td>
                  {DEMAND_HEADS.map(([key]) => (
                    <td key={key} className="px-1 py-1 text-right">
                      {recovered ? money(line[key]) : (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line[key] ?? ''}
                          onChange={(event) => setLines((current) => updateDemandLine(current, index, key, event.target.value))}
                          className="h-8 w-24 rounded-md border border-slate-200 px-2 text-right text-[12px] outline-none focus:border-[var(--primary)]"
                          aria-label={`${line.memberCode} ${key}`}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-semibold text-slate-800">{money(demandLineTotal(line))}</td>
                  <td className="px-2 py-1 text-slate-600">{recovered ? `Recovered${line.recoveryVoucherNo ? ` (${line.recoveryVoucherNo})` : ''}` : 'Pending'}</td>
                  <td className="px-2 py-1 text-right">
                    {recovered ? null : <button type="button" onClick={() => setLines((current) => removeDemandLine(current, index))} className="font-medium text-rose-600 hover:text-rose-700">Remove</button>}
                  </td>
                </tr>
              );
            })}
            {!lines.length ? (
              <tr><td colSpan={DEMAND_HEADS.length + 4} className="px-3 py-6 text-center text-slate-500">Choose a branch and click Load Demand.</td></tr>
            ) : null}
          </tbody>
          {lines.length ? (
            <tfoot className="bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-2 py-2">Total ({lines.length} members)</td>
                {DEMAND_HEADS.map(([key]) => <td key={key} className="px-2 py-2 text-right">{money(totals.heads[key])}</td>)}
                <td className="px-2 py-2 text-right">{money(totals.total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-[12px] text-slate-500">Members with no demand amount are not saved. Saved lines are Pending until a recovery collects them.</p>
    </form>
  );
}

export default DemandForm;

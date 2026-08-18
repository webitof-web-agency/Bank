import { useMemo } from 'react';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { DEMAND_STATUS_OPTIONS, getBranchLabel, getMemberLabel } from './demandUtils';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

function sumAllocations(rows = []) {
  return rows.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
}

export function DemandForm({ value, setValue, onSubmit, branches = [], members = [] }) {
  const branchLookup = useMemo(() => new Map(branches.map((branch) => [String(branch.code || '').trim().toUpperCase(), branch])), [branches]);
  const memberLookup = useMemo(() => new Map(members.map((member) => [String(member.code || '').trim().toUpperCase(), member])), [members]);
  const allocations = Array.isArray(value.allocations) ? value.allocations : [];

  function syncAllocations(nextAllocations) {
    setValue((current) => ({
      ...current,
      allocations: nextAllocations,
      total: sumAllocations(nextAllocations)
    }));
  }

  function loadMembers() {
    const selectedBranch = String(value.branchCode || '').trim().toUpperCase();
    const nextRows = members
      .filter((member) => {
        if (!selectedBranch) return true;
        return String(member.branchCode || '').trim().toUpperCase() === selectedBranch;
      })
      .map((member) => ({
        memberCode: member.code,
        head: getMemberLabel(member),
        amount: 0
      }));
    syncAllocations(nextRows);
  }

  function updateAllocation(index, nextValue) {
    const nextRows = allocations.map((row, rowIndex) => (rowIndex === index ? { ...row, amount: nextValue } : row));
    syncAllocations(nextRows);
  }

  function removeAllocation(index) {
    const nextRows = allocations.filter((_, rowIndex) => rowIndex !== index);
    syncAllocations(nextRows);
  }

  return (
    <form id="demand-form" onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <FieldLabel required>Demand List No.</FieldLabel>
          <Input
            value={value.demandNo || ''}
            onChange={(event) => setValue((current) => ({ ...current, demandNo: event.target.value }))}
            placeholder="DM01"
          />
        </div>

        <div>
          <FieldLabel>Demand List Date</FieldLabel>
          <Input
            type="date"
            value={value.demandListDate || value.dueDate || ''}
            onChange={(event) => setValue((current) => ({ ...current, demandListDate: event.target.value, dueDate: event.target.value }))}
          />
        </div>

        <div>
          <FieldLabel>Branch</FieldLabel>
          <Select
            searchable
            value={value.branchCode || ''}
            onChange={(val) => setValue((current) => ({ ...current, branchCode: val }))}
            options={[
              { value: '', label: 'Select branch' },
              ...branches.map((branch) => ({
                value: branch.code,
                label: getBranchLabel(branch)
              }))
            ]}
          />
        </div>

        <div>
          <FieldLabel>Month</FieldLabel>
          <Input
            value={value.month || ''}
            onChange={(event) => setValue((current) => ({ ...current, month: event.target.value }))}
            placeholder="07"
          />
        </div>

        <div>
          <FieldLabel>Year</FieldLabel>
          <Input
            value={value.year || value.payload?.year || ''}
            onChange={(event) => setValue((current) => ({ ...current, year: event.target.value }))}
            placeholder="2026"
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={loadMembers}
            className="inline-flex h-[42px] w-full items-center justify-center rounded-[var(--radius-input,0.75rem)] border border-[var(--primary)] bg-[var(--primary)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Load Members
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Loaded Members</h4>
            <p className="text-[12px] text-slate-500">Members filtered by branch. Edit demand amount below.</p>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-medium text-slate-600">
            {allocations.length} members loaded
          </div>
        </div>

        {allocations.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid grid-cols-[1.2fr_0.5fr_0.12fr] gap-0 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
              <div>Member</div>
              <div>Demand Amount</div>
              <div className="text-right">Action</div>
            </div>
            {allocations.map((row, index) => (
              <div key={`${row.memberCode || index}`} className="grid grid-cols-[1.2fr_0.5fr_0.12fr] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900">{row.head || row.memberCode || '-'}</p>
                  <p className="text-[12px] text-slate-500">{row.memberCode || '-'}</p>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount ?? ''}
                  onChange={(event) => updateAllocation(index, event.target.value)}
                  placeholder="0"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeAllocation(index)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
            Choose a branch and click Load Members.
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <FieldLabel>Recovered</FieldLabel>
          <Input
            type="number"
            step="0.01"
            value={value.recovered ?? ''}
            onChange={(event) => setValue((current) => ({ ...current, recovered: event.target.value }))}
            placeholder="0"
          />
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <Select
            value={value.status || 'Pending'}
            onChange={(val) => setValue((current) => ({ ...current, status: val }))}
            options={DEMAND_STATUS_OPTIONS.map((option) => ({
              value: option,
              label: option
            }))}
          />
        </div>

        <div className="md:col-span-2">
          <FieldLabel>Remarks</FieldLabel>
          <Textarea
            rows={4}
            value={value.remarks || ''}
            onChange={(event) => setValue((current) => ({ ...current, remarks: event.target.value }))}
            placeholder="Optional notes"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        Demand number is auto-generated from existing records and can be edited before save. Total amount is derived from loaded member rows.
      </div>
    </form>
  );
}

export default DemandForm;

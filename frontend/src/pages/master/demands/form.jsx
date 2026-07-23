import { Input, Select, Textarea } from '../../../components/ui/Input';
import { DEMAND_STATUS_OPTIONS, getBranchLabel, getMemberLabel } from './demandUtils';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

export function DemandForm({ value, setValue, onSubmit, branches = [], members = [] }) {
  return (
    <form id="demand-form" onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel required>Demand No</FieldLabel>
          <Input
            value={value.demandNo || ''}
            onChange={(event) => setValue((current) => ({ ...current, demandNo: event.target.value }))}
            placeholder="DM01"
          />
        </div>

        <div>
          <FieldLabel>Month</FieldLabel>
          <Input
            value={value.month || ''}
            onChange={(event) => setValue((current) => ({ ...current, month: event.target.value }))}
            placeholder="2026-07"
          />
        </div>

        <div>
          <FieldLabel>Branch</FieldLabel>
          <Select
            value={value.branchCode || ''}
            onChange={(event) => setValue((current) => ({ ...current, branchCode: event.target.value }))}
          >
            <option value="">Select branch</option>
            {branches.map((branch) => (
              <option key={branch.id || branch.code} value={branch.code}>
                {getBranchLabel(branch)}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel>Member</FieldLabel>
          <Select
            value={value.memberCode || ''}
            onChange={(event) => setValue((current) => ({ ...current, memberCode: event.target.value }))}
          >
            <option value="">Select member</option>
            {members.map((member) => (
              <option key={member.id || member.code} value={member.code}>
                {getMemberLabel(member)}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel>Due Date</FieldLabel>
          <Input
            type="date"
            value={value.dueDate || ''}
            onChange={(event) => setValue((current) => ({ ...current, dueDate: event.target.value }))}
          />
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <Select
            value={value.status || 'Pending'}
            onChange={(event) => setValue((current) => ({ ...current, status: event.target.value }))}
          >
            {DEMAND_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel>Total</FieldLabel>
          <Input
            type="number"
            step="0.01"
            value={value.total ?? ''}
            onChange={(event) => setValue((current) => ({ ...current, total: event.target.value }))}
            placeholder="5200"
          />
        </div>

        <div>
          <FieldLabel>Recovered</FieldLabel>
          <Input
            type="number"
            step="0.01"
            value={value.recovered ?? ''}
            onChange={(event) => setValue((current) => ({ ...current, recovered: event.target.value }))}
            placeholder="1600"
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
        Demand number is auto-generated from existing records and can be edited before save.
      </div>
    </form>
  );
}

export default DemandForm;


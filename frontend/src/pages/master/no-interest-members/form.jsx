import { Input, Select, Textarea } from '../../../components/ui/Input';
import { NO_INTEREST_STATUS_OPTIONS, getMemberLabel } from './noInterestMemberUtils';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

export function NoInterestMemberForm({ value, setValue, onSubmit, members = [] }) {
  return (
    <form id="no-interest-member-form" onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel required>Record Code</FieldLabel>
          <Input
            value={value.code || ''}
            onChange={(event) => setValue((current) => ({ ...current, code: event.target.value }))}
            placeholder="NI001"
          />
        </div>

        <div>
          <FieldLabel required>Member</FieldLabel>
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
          <FieldLabel>From Date</FieldLabel>
          <Input
            type="date"
            value={value.fromDate || ''}
            onChange={(event) => setValue((current) => ({ ...current, fromDate: event.target.value }))}
          />
        </div>

        <div>
          <FieldLabel>To Date</FieldLabel>
          <Input
            type="date"
            value={value.toDate || ''}
            onChange={(event) => setValue((current) => ({ ...current, toDate: event.target.value }))}
          />
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <Select
            value={value.status || 'Active'}
            onChange={(event) => setValue((current) => ({ ...current, status: event.target.value }))}
          >
            {NO_INTEREST_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </div>

        <div className="md:col-span-2">
          <FieldLabel>Reason</FieldLabel>
          <Textarea
            rows={4}
            value={value.reason || ''}
            onChange={(event) => setValue((current) => ({ ...current, reason: event.target.value }))}
            placeholder="Reason for no-interest tagging"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        Record code is auto-generated from existing no-interest records and can be edited before save.
      </div>
    </form>
  );
}

export default NoInterestMemberForm;


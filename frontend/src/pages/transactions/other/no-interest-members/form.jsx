import { useMemo } from 'react';
import { Input, Textarea } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { getMemberLabel } from './noInterestMemberUtils';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

export function NoInterestMemberForm({ value, setValue, onSubmit, members = [] }) {
  const memberLookup = useMemo(
    () => new Map(members.map((member) => [String(member.code || '').trim().toUpperCase(), member])),
    [members]
  );

  return (
    <form id="no-interest-member-form" onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
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
            searchable
            value={value.memberCode || ''}
            onChange={(val) => {
              const selected = memberLookup.get(String(val || '').trim().toUpperCase()) || {};
              setValue((current) => ({
                ...current,
                memberCode: val,
                branchCode: selected.branchCode || '',
                designation: selected.designation || ''
              }));
            }}
            options={[
              { value: '', label: 'Select member' },
              ...members.map((member) => ({
                value: member.code,
                label: getMemberLabel(member)
              }))
            ]}
          />
        </div>

        <div>
          <FieldLabel>Branch</FieldLabel>
          <Input
            value={value.branchCode || memberLookup.get(String(value.memberCode || '').trim().toUpperCase())?.branchCode || ''}
            readOnly
            placeholder="Auto-filled from member"
          />
        </div>

        <div>
          <FieldLabel>Designation</FieldLabel>
          <Input
            value={value.designation || memberLookup.get(String(value.memberCode || '').trim().toUpperCase())?.designation || ''}
            readOnly
            placeholder="Auto-filled from member"
          />
        </div>

        <div>
          <FieldLabel>Set As On Date</FieldLabel>
          <Input
            type="date"
            value={value.fromDate || ''}
            onChange={(event) => setValue((current) => ({ ...current, fromDate: event.target.value }))}
          />
        </div>

        <div className="hidden">
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
            searchable
            value={value.status || 'Active'}
            onChange={(val) => setValue((current) => ({ ...current, status: val }))}
            options={[
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' }
            ]}
          />
        </div>

        <div className="md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
          <Textarea
            rows={4}
            value={value.reason || ''}
            onChange={(event) => setValue((current) => ({ ...current, reason: event.target.value }))}
            placeholder="Narration for no-interest tagging"
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

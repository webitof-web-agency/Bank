import { useEffect, useMemo, useState } from 'react';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { CheckboxLine } from '../../../components/ui/CheckboxLine';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { branchDisplayName } from './branchUtils';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

// A branch is either a head office or belongs to one, picked from the
// branches marked as head office (not typed as a code).
export function BranchForm({ value, setValue, onSubmit }) {
  const { token } = useAuth();
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    let alive = true;
    api.resources.list('/banking/masters/branches', token)
      .then((response) => { if (alive) setBranches(Array.isArray(response?.data) ? response.data : []); })
      .catch(() => { if (alive) setBranches([]); });
    return () => { alive = false; };
  }, [token]);

  const ownCode = String(value.code || '').trim().toUpperCase();
  const headOfficeOptions = useMemo(() => branches
    .filter((branch) => branch.isHeadOffice === true && String(branch.code || '').toUpperCase() !== ownCode)
    .map((branch) => ({ value: String(branch.code).toUpperCase(), label: branchDisplayName(branch) })), [branches, ownCode]);

  const set = (field) => (event) => setValue((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form id="branch-form" onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <FieldLabel required>Branch Code</FieldLabel>
          <Input value={value.code || ''} onChange={set('code')} placeholder="Auto-generated" />
        </div>

        <div className="md:col-span-2">
          <FieldLabel required>Branch Name</FieldLabel>
          <Input value={value.label || ''} onChange={set('label')} placeholder="e.g. SADAR BAZAR" />
        </div>

        <CheckboxLine
          className="md:col-span-3"
          checked={value.isHeadOffice}
          onChange={(checked) => setValue((current) => ({ ...current, isHeadOffice: checked, headOfficeCode: checked ? '' : current.headOfficeCode }))}
        >
          This branch is a head office
        </CheckboxLine>

        {!value.isHeadOffice ? (
          <div className="md:col-span-3">
            <FieldLabel>Head Office</FieldLabel>
            <Select
              searchable
              value={value.headOfficeCode || ''}
              onChange={(next) => setValue((current) => ({ ...current, headOfficeCode: next || '' }))}
              options={[{ value: '', label: 'None' }, ...headOfficeOptions]}
              placeholder={headOfficeOptions.length ? 'Select head office' : 'No branch is marked as head office yet'}
            />
          </div>
        ) : null}

        <div>
          <FieldLabel>District</FieldLabel>
          <Input value={value.district || ''} onChange={set('district')} placeholder="Raipur" />
        </div>

        <div>
          <FieldLabel>Phone No</FieldLabel>
          <Input value={value.phone || ''} onChange={set('phone')} placeholder="0771-2234011" />
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <CheckboxLine checked={value.isActive} onChange={(checked) => setValue((current) => ({ ...current, isActive: checked }))}>
            Active Branch
          </CheckboxLine>
        </div>

        <div className="md:col-span-3">
          <FieldLabel>Address</FieldLabel>
          <Textarea rows={3} value={value.address || ''} onChange={set('address')} placeholder="Branch address" />
        </div>
      </div>
    </form>
  );
}

export default BranchForm;

import { Input, Select } from '../../../components/ui/Input';
import { LEDGER_NATURE_OPTIONS, LEDGER_SIDE_OPTIONS } from './ledgerUtils';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

export function LedgerForm({ value, setValue, onSubmit, isEdit = false }) {
  return (
    <form id="ledger-form" onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel required>Ledger Code</FieldLabel>
          <Input
            value={value.code || ''}
            onChange={(event) => setValue((current) => ({ ...current, code: event.target.value }))}
            placeholder="L001"
          />
        </div>

        <div>
          <FieldLabel required>Ledger Name</FieldLabel>
          <Input
            value={value.name || ''}
            onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
            placeholder="Cash in Hand"
          />
        </div>

        <div>
          <FieldLabel required>Nature</FieldLabel>
          <Select
            value={value.nature || 'ASSET'}
            onChange={(event) => setValue((current) => ({ ...current, nature: event.target.value }))}
          >
            {LEDGER_NATURE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel>Group</FieldLabel>
          <Input
            value={value.group || ''}
            onChange={(event) => setValue((current) => ({ ...current, group: event.target.value }))}
            placeholder="GENERAL"
          />
        </div>

        <div>
          <FieldLabel>Opening Balance</FieldLabel>
          <Input
            type="number"
            step="0.01"
            value={value.openingBalance ?? ''}
            onChange={(event) => setValue((current) => ({ ...current, openingBalance: event.target.value }))}
            placeholder="0"
          />
        </div>

        <div>
          <FieldLabel>Balance Side</FieldLabel>
          <Select
            value={value.balanceSide || 'DR'}
            onChange={(event) => setValue((current) => ({ ...current, balanceSide: event.target.value }))}
          >
            {LEDGER_SIDE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-medium text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value.isBankAccount)}
            onChange={(event) => setValue((current) => ({ ...current, isBankAccount: event.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          Is Bank Account
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-medium text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value.isActive)}
            onChange={(event) => setValue((current) => ({ ...current, isActive: event.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          Active Ledger
        </label>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        {isEdit
          ? 'Ledger code can be changed before saving if you need to realign numbering.'
          : 'Ledger code is auto-generated from existing records and can be edited before create.'}
      </div>
    </form>
  );
}

export default LedgerForm;

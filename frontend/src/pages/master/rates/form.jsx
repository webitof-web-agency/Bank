import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { getLedgerLabel } from './rateUtils';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

export function RateForm({ value, setValue, onSubmit, ledgers = [] }) {
  function handleLedgerChange(ledgerCode) {
    const selectedLedger = ledgers.find((ledger) => String(ledger.code || '').toUpperCase() === String(ledgerCode || '').toUpperCase());
    setValue((current) => ({
      ...current,
      ledgerCode,
      ledgerName: selectedLedger ? getLedgerLabel(selectedLedger) : ''
    }));
  }

  return (
    <form id="rate-form" onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel required>Rate Code</FieldLabel>
          <Input
            value={value.code || ''}
            onChange={(event) => setValue((current) => ({ ...current, code: event.target.value }))}
            placeholder="R01"
          />
        </div>

        <div>
          <FieldLabel required>Ledger Code</FieldLabel>
          <Select 
            searchable
            value={value.ledgerCode || ''} 
            onChange={handleLedgerChange}
            options={ledgers.map((ledger) => ({ label: getLedgerLabel(ledger), value: ledger.code }))}
            searchable
            placeholder="Select ledger..."
          />
        </div>

        <div>
          <FieldLabel>Ledger Name</FieldLabel>
          <Input
            value={value.ledgerName || ''}
            readOnly
            placeholder="Auto-filled from selected ledger"
            className="bg-slate-50"
          />
        </div>

        <div>
          <FieldLabel required>Category</FieldLabel>
          <Input
            value={value.category || ''}
            onChange={(event) => setValue((current) => ({ ...current, category: event.target.value }))}
            placeholder="Interest Rate"
          />
        </div>

        <div>
          <FieldLabel required>Value</FieldLabel>
          <Input
            type="number"
            step="0.01"
            value={value.value ?? ''}
            onChange={(event) => setValue((current) => ({ ...current, value: event.target.value }))}
            placeholder="11.5"
          />
        </div>

        <div>
          <FieldLabel>Effective From</FieldLabel>
          <Input
            type="date"
            value={value.effectiveFrom || ''}
            onChange={(event) => setValue((current) => ({ ...current, effectiveFrom: event.target.value }))}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        Rate code is auto-generated from existing rate records and can be edited before save.
      </div>
    </form>
  );
}

export default RateForm;


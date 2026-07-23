import { Input, Select } from '../../../components/ui/Input';
import { BANK_ACCOUNT_STATUS_OPTIONS, BANK_ACCOUNT_TYPE_OPTIONS, getLedgerLabel } from './bankAccountUtils';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

export function BankAccountForm({ value, setValue, onSubmit, ledgers = [] }) {
  return (
    <form id="bank-account-form" onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel required>Account Code</FieldLabel>
          <Input
            value={value.code || ''}
            onChange={(event) => setValue((current) => ({ ...current, code: event.target.value }))}
            placeholder="BA001"
          />
        </div>

        <div>
          <FieldLabel required>Bank Name</FieldLabel>
          <Input
            value={value.bankName || ''}
            onChange={(event) => setValue((current) => ({ ...current, bankName: event.target.value }))}
            placeholder="Union Bank of India"
          />
        </div>

        <div>
          <FieldLabel>Account Holder</FieldLabel>
          <Input
            value={value.accountHolderName || ''}
            onChange={(event) => setValue((current) => ({ ...current, accountHolderName: event.target.value }))}
            placeholder="Society / Branch name"
          />
        </div>

        <div>
          <FieldLabel>Account Number</FieldLabel>
          <Input
            value={value.accountNumber || ''}
            onChange={(event) => setValue((current) => ({ ...current, accountNumber: event.target.value }))}
            placeholder="CC-000120"
          />
        </div>

        <div>
          <FieldLabel>IFSC</FieldLabel>
          <Input
            value={value.ifsc || ''}
            onChange={(event) => setValue((current) => ({ ...current, ifsc: event.target.value }))}
            placeholder="UBIN0000120"
          />
        </div>

        <div>
          <FieldLabel>Branch</FieldLabel>
          <Input
            value={value.branch || ''}
            onChange={(event) => setValue((current) => ({ ...current, branch: event.target.value }))}
            placeholder="Raipur"
          />
        </div>

        <div>
          <FieldLabel>Account Type</FieldLabel>
          <Select
            value={value.accountType || 'Current'}
            onChange={(event) => setValue((current) => ({ ...current, accountType: event.target.value }))}
          >
            {BANK_ACCOUNT_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel>UPI ID</FieldLabel>
          <Input
            value={value.upiId || ''}
            onChange={(event) => setValue((current) => ({ ...current, upiId: event.target.value }))}
            placeholder="society@upi"
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
          <FieldLabel>Current Balance</FieldLabel>
          <Input
            type="number"
            step="0.01"
            value={value.currentBalance ?? ''}
            onChange={(event) => setValue((current) => ({ ...current, currentBalance: event.target.value }))}
            placeholder="0"
          />
        </div>

        <div>
          <FieldLabel>Linked Ledger</FieldLabel>
          <Select
            value={value.linkedLedgerCode || ''}
            onChange={(event) => setValue((current) => ({ ...current, linkedLedgerCode: event.target.value }))}
          >
            <option value="">Select ledger</option>
            {ledgers.map((ledger) => (
              <option key={ledger.id || ledger.code} value={ledger.code}>
                {getLedgerLabel(ledger)}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <Select
            value={value.status || 'Active'}
            onChange={(event) => setValue((current) => ({ ...current, status: event.target.value }))}
          >
            {BANK_ACCOUNT_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-medium text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value.isPrimary)}
            onChange={(event) => setValue((current) => ({ ...current, isPrimary: event.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          Primary Account
        </label>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        Account code is auto-generated from existing bank accounts and can be edited before save.
      </div>
    </form>
  );
}

export default BankAccountForm;


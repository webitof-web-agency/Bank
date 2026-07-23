import { Input, Textarea } from '../../../components/ui/Input';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

export function BranchForm({ value, setValue, onSubmit }) {
  return (
    <form id="branch-form" onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel required>Branch Code</FieldLabel>
          <Input
            value={value.code || ''}
            onChange={(event) => setValue((current) => ({ ...current, code: event.target.value }))}
            placeholder="BR01"
          />
        </div>

        <div>
          <FieldLabel required>Branch Name</FieldLabel>
          <Input
            value={value.label || ''}
            onChange={(event) => setValue((current) => ({ ...current, label: event.target.value }))}
            placeholder="Main Branch"
          />
        </div>

        <div>
          <FieldLabel>Place</FieldLabel>
          <Input
            value={value.place || ''}
            onChange={(event) => setValue((current) => ({ ...current, place: event.target.value }))}
            placeholder="Raipur"
          />
        </div>

        <div>
          <FieldLabel>District</FieldLabel>
          <Input
            value={value.district || ''}
            onChange={(event) => setValue((current) => ({ ...current, district: event.target.value }))}
            placeholder="Raipur"
          />
        </div>

        <div>
          <FieldLabel>Phone</FieldLabel>
          <Input
            value={value.phone || ''}
            onChange={(event) => setValue((current) => ({ ...current, phone: event.target.value }))}
            placeholder="0771-2234011"
          />
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(value.isActive)}
              onChange={(event) => setValue((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 focus:ring-[var(--primary,#1661F6)]"
              style={{ accentColor: 'var(--primary,#1661F6)' }}
            />
            Active Branch
          </label>
        </div>

        <div className="md:col-span-2">
          <FieldLabel>Address</FieldLabel>
          <Textarea
            rows={4}
            value={value.address || ''}
            onChange={(event) => setValue((current) => ({ ...current, address: event.target.value }))}
            placeholder="Branch address"
          />
        </div>
      </div>
    </form>
  );
}

export default BranchForm;

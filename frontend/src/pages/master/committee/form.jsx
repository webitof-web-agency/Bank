import { Input, Textarea } from '../../../components/ui/Input';

export function CommitteeForm({ value, setValue, onSubmit }) {
  return (
    <form id="committee-form" className="space-y-6" onSubmit={onSubmit}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Chairman</label>
          <Input
            value={value.chairman || ''}
            onChange={(e) => setValue({ ...value, chairman: e.target.value })}
            placeholder="Chairman name"
          />
        </div>

        <div>
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Vice Chairman</label>
          <Input
            value={value.viceChairman || ''}
            onChange={(e) => setValue({ ...value, viceChairman: e.target.value })}
            placeholder="Vice chairman name"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Directors</label>
          <Textarea
            rows={5}
            value={value.directorsText || ''}
            onChange={(e) => setValue({ ...value, directorsText: e.target.value })}
            placeholder="Comma separated names or one per line"
          />
          <p className="mt-1 text-[12px] text-slate-500">You can type each name on a new line or separate them with commas.</p>
        </div>
      </div>
    </form>
  );
}

export default CommitteeForm;

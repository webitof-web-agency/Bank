import { useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { User, X, Plus } from 'lucide-react';

export function CommitteeForm({ value, setValue, onSubmit, members = [] }) {
  const [selectedMember, setSelectedMember] = useState('');

  const memberOptions = members.map(m => ({
    value: m.name,
    label: `${m.name} (${m.code || m.membershipNo || 'No ID'})`
  }));

  const addDirector = () => {
    if (selectedMember && !value.directors.includes(selectedMember)) {
      setValue({ ...value, directors: [...value.directors, selectedMember] });
      setSelectedMember('');
    }
  };

  const removeDirector = (name) => {
    setValue({ ...value, directors: value.directors.filter(d => d !== name) });
  };

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
          <div className="flex gap-2">
            <div className="flex-1">
              <Select 
                options={memberOptions}
                value={selectedMember}
                onChange={setSelectedMember}
                placeholder="Select a member..."
                searchable
              />
            </div>
            <Button type="button" onClick={addDirector} className="gap-2 shrink-0 border border-slate-200 shadow-sm bg-white text-slate-700 hover:bg-slate-50" variant="outline">
              <Plus size={16} /> Add
            </Button>
          </div>
          
          {value.directors && value.directors.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 p-4 border border-slate-200 rounded-xl bg-slate-50">
              {value.directors.map(name => (
                <div key={name} className="inline-flex items-center rounded-full border border-slate-200 bg-white pl-3 pr-1 py-1 text-[13px] font-medium text-slate-700 shadow-sm">
                  <User size={14} className="mr-2 text-slate-400" />
                  {name}
                  <button type="button" onClick={() => removeDirector(name)} className="ml-2 p-1 text-slate-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12px] text-slate-500">Select and add members to the board of directors.</p>
        </div>
      </div>
    </form>
  );
}

export default CommitteeForm;

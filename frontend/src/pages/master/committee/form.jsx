import { useEffect, useRef, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { User, X, ChevronDown, Search, Check } from 'lucide-react';

// Directors are stored by name. Ticking a member adds them, unticking
// removes them; the list stays open so several can be picked in one go.
function DirectorPicker({ options = [], selected = [], onToggle, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const needle = search.trim().toLowerCase();
  const filtered = needle ? options.filter((opt) => opt.label.toLowerCase().includes(needle)) : options;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-input,0.75rem)] border bg-white px-3 py-1.5 text-[13px] shadow-sm outline-none transition-colors ${
          isOpen ? 'border-[var(--primary,#1661F6)] ring-1 ring-[var(--primary,#1661F6)]' : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'cursor-not-allowed bg-slate-50 text-slate-500 opacity-50' : 'cursor-pointer text-slate-700'}`}
      >
        <span className="truncate">{selected.length ? `${selected.length} director(s) selected` : 'Select members...'}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full z-50 mt-1 flex max-h-72 w-full min-w-[120px] flex-col overflow-hidden rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder="Search name or code..."
                className="w-full rounded-[var(--radius-input,0.5rem)] border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-[13px] text-slate-700 outline-none transition-colors focus:border-[var(--primary,#1661F6)] focus:ring-1 focus:ring-[var(--primary,#1661F6)]"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-center text-[12px] text-slate-500">No members found</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onToggle(opt.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-slate-50 ${isSelected ? 'font-medium text-[var(--primary,#1661F6)]' : 'text-slate-700'}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? 'border-[var(--primary,#1661F6)] bg-[var(--primary,#1661F6)] text-white' : 'border-slate-300 bg-white'}`}>
                      {isSelected ? <Check size={12} /> : null}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CommitteeForm({ value, setValue, onSubmit, members = [], canWrite = true }) {
  const directors = value.directors || [];

  const memberOptions = members.map((m, index) => ({
    key: `${m.id || m.code || index}`,
    value: m.name,
    label: `${m.name} (${m.code || m.membershipNo || 'No ID'})`
  }));

  const toggleDirector = (name) => {
    if (!name) return;
    setValue({ ...value, directors: directors.includes(name) ? directors.filter((d) => d !== name) : [...directors, name] });
  };

  const removeDirector = (name) => {
    setValue({ ...value, directors: directors.filter((d) => d !== name) });
  };

  return (
    <form id="committee-form" className="space-y-3" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Chairman</label>
          <Input
            value={value.chairman || ''}
            onChange={(e) => setValue({ ...value, chairman: e.target.value })}
            placeholder="Chairman name"
            disabled={!canWrite}
          />
        </div>

        <div>
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Vice Chairman 1</label>
          <Input
            value={value.viceChairman1 || ''}
            onChange={(e) => setValue({ ...value, viceChairman1: e.target.value })}
            placeholder="First vice chairman"
            disabled={!canWrite}
          />
        </div>

        <div>
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Vice Chairman 2</label>
          <Input
            value={value.viceChairman2 || ''}
            onChange={(e) => setValue({ ...value, viceChairman2: e.target.value })}
            placeholder="Second vice chairman"
            disabled={!canWrite}
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Directors</label>
          <DirectorPicker options={memberOptions} selected={directors} onToggle={toggleDirector} disabled={!canWrite} />

          {value.directors && value.directors.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {value.directors.map((name) => (
                <div key={name} className="inline-flex items-center rounded-full border border-slate-200 bg-white pl-3 pr-1 py-1 text-[13px] font-medium text-slate-700 shadow-sm">
                  <User size={14} className="mr-2 text-slate-400" />
                  {name}
                  {canWrite ? (
                    <button type="button" onClick={() => removeDirector(name)} className="ml-2 rounded-full p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500">
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12px] text-slate-500">Tick members to add them to the board of directors; untick to remove.</p>
        </div>
      </div>
    </form>
  );
}

export default CommitteeForm;

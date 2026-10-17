import { useEffect, useRef, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { User, X, ChevronDown, Search, Check } from 'lucide-react';
import { isDismemberedMember } from '../members/memberUtils';

// Directors are members, kept by member code (two members can share a name).
// Ticking a member adds them, unticking removes them; the list stays open so
// several can be picked in one go.
// count: every director on the list (a name-only one is listed but ticks no member).
function DirectorPicker({ options = [], selected = [], count = selected.length, onToggle, disabled = false }) {
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
        <span className="truncate">{count ? `${count} director(s) selected` : 'Select members...'}</span>
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
  const memberByCode = new Map(members.map((m) => [String(m.code || '').toUpperCase(), m]));

  // Only current members can be picked; a director who has since left stays
  // listed (ticked) so they can be taken off.
  const memberOptions = members
    .filter((m) => m.code && (!isDismemberedMember(m) || directors.some((d) => d.memberCode === String(m.code).toUpperCase())))
    .map((m) => ({
      key: String(m.id || m.code),
      value: String(m.code).toUpperCase(),
      label: `${m.name} (${m.code})`
    }));
  // Ticked = the member's code is in the list (a name-only director ticks nothing).
  const selectedCodes = directors.map((d) => d.memberCode).filter(Boolean);

  const toggleDirector = (code) => {
    if (!code) return;
    const exists = directors.some((d) => d.memberCode === code);
    const member = memberByCode.get(code);
    setValue({
      ...value,
      directors: exists ? directors.filter((d) => d.memberCode !== code) : [...directors, { memberCode: code, name: member?.name || '' }]
    });
  };

  const removeDirector = (index) => {
    setValue({ ...value, directors: directors.filter((_, i) => i !== index) });
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
          <DirectorPicker options={memberOptions} selected={selectedCodes} count={directors.length} onToggle={toggleDirector} disabled={!canWrite} />

          {value.directors && value.directors.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {value.directors.map((director, index) => (
                <div
                  key={`${director.memberCode || director.name}-${index}`}
                  title={director.memberCode ? undefined : 'Not linked to a member: remove it and tick the right member in the list.'}
                  className={`inline-flex items-center rounded-full border pl-3 pr-1 py-1 text-[13px] font-medium shadow-sm ${director.memberCode ? 'border-slate-200 bg-white text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
                >
                  <User size={14} className={`mr-2 ${director.memberCode ? 'text-slate-400' : 'text-amber-500'}`} />
                  {director.name}
                  {director.memberCode
                    ? <span className="ml-1 font-normal text-slate-400">({director.memberCode})</span>
                    : <span className="ml-1 font-normal text-amber-700">(pick the member)</span>}
                  {canWrite ? (
                    <button type="button" aria-label={`Remove ${director.name}`} onClick={() => removeDirector(index)} className="ml-2 rounded-full p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500">
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12px] text-slate-500">Tick members to add them to the board of directors; untick to remove.</p>
          {directors.some((d) => !d.memberCode) ? (
            <p className="mt-1 text-[12px] font-medium text-amber-700">
              An amber name was saved without its member (more than one member has that name). Remove it and tick the right member, e.g. by code.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export default CommitteeForm;

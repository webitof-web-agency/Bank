import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export function Select({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  searchable = false,
  className = '',
  disabled = false,
  size = 'md',
  menuPlacement = 'bottom'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset search when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const filteredOptions = searchable 
    ? options.filter(opt => (opt.label || '').toString().toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-input,0.75rem)] border bg-white shadow-sm outline-none transition-colors ${
          size === 'sm' ? 'h-9 px-3 text-[13px]' : 'px-4 py-3 text-sm'
        } ${
          isOpen 
            ? 'border-[var(--primary,#1661F6)] ring-1 ring-[var(--primary,#1661F6)]' 
            : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-500' : 'cursor-pointer text-slate-700'}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute z-50 ${menuPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} max-h-60 w-full min-w-[120px] overflow-hidden rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white shadow-lg flex flex-col`}>
          {searchable && (
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full rounded-[var(--radius-input,0.5rem)] border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-[13px] text-slate-700 outline-none focus:border-[var(--primary,#1661F6)] focus:ring-1 focus:ring-[var(--primary,#1661F6)] transition-colors"
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-slate-500 text-center">No options found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors ${
                      isSelected
                        ? 'bg-[var(--primary,#1661F6)] text-white'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate pr-2">{opt.label}</span>
                    {isSelected && <Check size={14} className="shrink-0" />}
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

export default Select;

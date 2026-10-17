import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';

const MENU_MAX_HEIGHT = 288;
const GAP = 4;
const EDGE = 8;

// The open list is drawn on <body> at the field's position (fixed), not inside
// the field: a dialog's scrolling body (overflow: auto) used to cut it off.
// It opens upward when there is more room above, follows the field on scroll
// and resize, and carries data-modal-portal so a click in it is not "outside"
// the dialog it belongs to.
export function Select({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  searchable = false,
  className = '',
  disabled = false,
  size = 'md',
  menuPlacement = 'bottom',
  ariaLabel
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState(null);
  const [active, setActive] = useState(-1);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);

  const filteredOptions = searchable
    ? options.filter((opt) => (opt.label || '').toString().toLowerCase().includes(search.toLowerCase()))
    : options;
  const selectedOption = options.find((opt) => opt.value === value);

  function close() {
    setIsOpen(false);
    setSearch('');
  }

  function choose(opt) {
    onChange(opt.value);
    close();
    triggerRef.current?.focus();
  }

  // Outside click: neither the field nor its (portalled) list.
  useEffect(() => {
    if (!isOpen) return undefined;
    function handleClickOutside(event) {
      if (containerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      close();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Place the list under (or over) the field, within the window.
  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - GAP - EDGE;
      const above = rect.top - GAP - EDGE;
      const wanted = Math.min(MENU_MAX_HEIGHT, (searchable ? 56 : 0) + 8 + Math.max(1, filteredOptions.length) * 36);
      const up = menuPlacement === 'top'
        ? above >= Math.min(wanted, 160) || above > below
        : below < wanted && above > below;
      const width = Math.max(rect.width, 160);
      const left = Math.min(Math.max(EDGE, rect.left), window.innerWidth - width - EDGE);
      setPosition({
        left,
        width,
        maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, up ? above : below)),
        ...(up ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP })
      });
    }
    place();
    window.addEventListener('resize', place);
    // Capture: any scrolling ancestor (the dialog body) moves the field.
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen, filteredOptions.length, searchable, menuPlacement]);

  // The selected option is highlighted when the list opens.
  useEffect(() => {
    if (isOpen) setActive(Math.max(0, filteredOptions.findIndex((opt) => opt.value === value)));
  }, [isOpen, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, isOpen]);

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(filteredOptions.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      // Never submits the form the field is in.
      event.preventDefault();
      if (filteredOptions[active]) choose(filteredOptions[active]);
    } else if (event.key === 'Tab') {
      close();
    }
  }

  const menu = isOpen && position ? createPortal(
    <div
      ref={menuRef}
      data-modal-portal="true"
      role="listbox"
      onKeyDown={onKeyDown}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white shadow-lg"
      style={{ left: position.left, width: position.width, maxHeight: position.maxHeight, top: position.top, bottom: position.bottom }}
    >
      {searchable && (
        <div className="shrink-0 border-b border-slate-100 p-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              aria-label="Search options"
              className="w-full rounded-[var(--radius-input,0.5rem)] border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-[13px] text-slate-700 outline-none focus:border-[var(--primary,#1661F6)] focus:ring-1 focus:ring-[var(--primary,#1661F6)] transition-colors"
              autoFocus
            />
          </div>
        </div>
      )}
      <div ref={listRef} className="min-h-0 overflow-y-auto py-1">
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-slate-500 text-center">No options found</div>
        ) : (
          filteredOptions.map((opt, index) => {
            const isSelected = opt.value === value;
            return (
              <button
                // Values can repeat (e.g. two members with the same name);
                // a duplicate key makes React keep stale rows while filtering.
                key={`${opt.value}::${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-index={index}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(opt)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors ${
                  isSelected
                    ? 'bg-[var(--primary,#1661F6)] text-white'
                    : index === active ? 'bg-slate-100 text-slate-800' : 'text-slate-700'
                }`}
              >
                <span className="truncate pr-2">{opt.label}</span>
                {isSelected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        onKeyDown={(event) => {
          if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setIsOpen(true);
          } else if (isOpen) {
            onKeyDown(event);
          }
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-input,0.75rem)] border bg-white shadow-sm outline-none transition-colors ${
          size === 'sm' ? 'h-8 px-2 text-[12px]' : 'h-9 px-3 py-1.5 text-[13px]'
        } ${
          isOpen
            ? 'border-[var(--primary,#1661F6)] ring-1 ring-[var(--primary,#1661F6)]'
            : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-500' : 'cursor-pointer text-slate-700'}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  );
}

export default Select;

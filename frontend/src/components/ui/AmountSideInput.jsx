import { cn } from '../../lib/cn';

// An amount box with its Dr / Cr side joined on the right, so the side reads
// as part of the amount instead of a separate full-width dropdown. The side is
// matched case-insensitively (legacy rows store "DR"/"CR") and emitted as
// "Dr" / "Cr".
const SIDES = ['Dr', 'Cr'];

export function normalizeSide(side, fallback = 'Dr') {
  const upper = String(side || '').trim().toUpperCase();
  if (upper === 'DR' || upper === 'D') return 'Dr';
  if (upper === 'CR' || upper === 'C') return 'Cr';
  return fallback;
}

export function AmountSideInput({
  value,
  onChange,
  side,
  onSideChange,
  defaultSide = 'Dr',
  placeholder = '0',
  disabled = false,
  className = '',
  inputClassName = '',
  ...inputProps
}) {
  const current = normalizeSide(side, defaultSide);
  return (
    <div
      className={cn(
        'flex h-9 w-full overflow-hidden rounded-[var(--radius-input,0.75rem)] border border-border bg-surface transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20',
        disabled && 'opacity-60',
        className
      )}
    >
      <input
        type="number"
        step="1"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          'min-w-0 flex-1 bg-transparent px-3 text-[13px] text-text-main outline-none placeholder:text-text-muted',
          inputClassName
        )}
        {...inputProps}
      />
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border bg-slate-50 p-0.5" role="radiogroup" aria-label="Side">
        {SIDES.map((option) => {
          const active = option === current;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onSideChange?.(option)}
              className={cn(
                'h-full rounded-[calc(var(--radius-input,0.75rem)-4px)] px-2.5 text-[12px] font-semibold transition',
                active
                  ? option === 'Dr'
                    ? 'bg-white text-rose-600 shadow-sm'
                    : 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

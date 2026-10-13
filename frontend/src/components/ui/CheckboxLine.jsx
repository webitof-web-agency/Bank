import { cn } from '../../lib/cn';

// The one checkbox style for forms: a plain line, no box or card around it.
export function CheckboxLine({ checked, onChange, children, className = '', disabled = false }) {
  return (
    <label className={cn('flex items-center gap-2 text-sm text-slate-700', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300"
        style={{ accentColor: 'var(--primary, #1661F6)' }}
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      {children}
    </label>
  );
}

// "Send SMS to member", the same on every voucher form.
export function SmsCheckbox({ checked, onChange, className = '' }) {
  return <CheckboxLine checked={checked} onChange={onChange} className={className}>Send SMS to member</CheckboxLine>;
}

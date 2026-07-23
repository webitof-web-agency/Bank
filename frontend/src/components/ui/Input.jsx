import { cn } from '../../lib/cn';

const base =
  'w-full rounded-[var(--radius-input,0.75rem)] border border-border bg-surface px-4 py-3 text-sm text-text-main outline-none transition placeholder:text-text-muted focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/20';

export function Input({ className = '', ...props }) {
  return <input className={cn(base, className)} {...props} />;
}

export function Textarea({ className = '', rows = 4, ...props }) {
  return <textarea className={cn(base, 'min-h-28 resize-y', className)} rows={rows} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={cn(base, 'appearance-none', className)} {...props}>
      {children}
    </select>
  );
}

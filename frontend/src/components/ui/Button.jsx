import { cn } from '../../lib/cn';

const variants = {
  primary:
    'bg-[var(--accent)] text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] hover:opacity-95 focus-visible:ring-[var(--accent)]',
  secondary:
    'border border-white/10 bg-white/5 text-[var(--text)] hover:bg-white/10 focus-visible:ring-white/30',
  outline:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-slate-300',
  ghost:
    'bg-transparent text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)] focus-visible:ring-white/20',
  destructive:
    'bg-rose-500 text-white hover:bg-rose-400 focus-visible:ring-rose-300'
};

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  icon: 'h-10 w-10 p-0'
};

export function Button({ as: Tag = 'button', className = '', variant = 'primary', size = 'md', ...props }) {
  return (
    <Tag
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-button,1rem)] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:opacity-50',
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className
      )}
      {...props}
    />
  );
}

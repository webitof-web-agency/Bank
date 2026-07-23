import { cn } from '../../lib/cn';

export function Card({ className = '', ...props }) {
  return <section className={cn('rounded-[var(--radius-card,1.75rem)] border border-border bg-surface p-5 shadow-custom', className)} {...props} />;
}

export function CardHeader({ className = '', ...props }) {
  return <div className={cn('mb-4 flex items-start justify-between gap-4', className)} {...props} />;
}

export function CardTitle({ className = '', ...props }) {
  return <h3 className={cn('text-base font-semibold tracking-tight text-text-main', className)} {...props} />;
}

export function CardBody({ className = '', ...props }) {
  return <div className={cn('text-sm text-text-muted', className)} {...props} />;
}

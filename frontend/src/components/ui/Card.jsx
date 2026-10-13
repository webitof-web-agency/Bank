import { cn } from '../../lib/cn';
import { useInDialog } from './dialogContext';

// The frame classes a card adds (border, corners, shadow, background,
// padding, ring), at any breakpoint. Inside a dialog these are dropped.
const FRAME_CLASS = /^(?:[a-z0-9]+:)*(?:border(?:-|$)|rounded|shadow|bg-|ring|p[xytblr]?-)/;

export function Card({ className = '', ...props }) {
  const inDialog = useInDialog();
  if (inDialog) {
    // The dialog is already the card: keep the layout (grid, spacing...),
    // drop the frame, so the fields sit directly in the dialog.
    const layout = String(className).split(/\s+/).filter((token) => token && !FRAME_CLASS.test(token)).join(' ');
    return <section className={layout} {...props} />;
  }
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

export const CardContent = CardBody;

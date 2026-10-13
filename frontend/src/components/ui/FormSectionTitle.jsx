import { useInDialog } from './dialogContext';

// The section label used in every dialog form (and the member forms):
// small, uppercase, no icon or card. The dialog title names the form, so a
// section label never repeats it.
export function FormSectionTitle({ children, subtitle = '' }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{children}</div>
      {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

// For forms used both on a page and in a dialog: parts shown only in one.
export function HideInDialog({ children }) {
  return useInDialog() ? null : children;
}

export function OnlyInDialog({ children }) {
  return useInDialog() ? children : null;
}

// A form's sub-heading: the standard section label in a dialog, the form's
// own heading (with its icon) on a full page.
export function FormSubheading({ label, icon: Icon, className = 'mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900' }) {
  if (useInDialog()) return <div className="mb-3"><FormSectionTitle>{label}</FormSectionTitle></div>;
  return (
    <div className={className}>
      {Icon ? <Icon size={16} /> : null}
      {label}
    </div>
  );
}

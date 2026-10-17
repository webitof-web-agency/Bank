import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

// The one confirmation dialog: icon, title and message together (no empty
// body), Cancel / Confirm below. Enter confirms, Escape cancels.
//
// requireReason: shows a reason box that must be filled; onConfirm gets the
// trimmed reason (onConfirm(reason)). reasonLabel / reasonPlaceholder /
// defaultReason tune it. Without it onConfirm is called with no argument.
export function ConfirmDialog({
  open,
  title = 'Confirm action',
  description = 'Are you sure you want to continue?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'destructive',
  onConfirm,
  onClose: onCloseProp,
  // Several pages pass onCancel; without this their Cancel did nothing.
  onCancel,
  busy = false,
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Why?',
  defaultReason = '',
  children
}) {
  const onClose = onCloseProp || onCancel;
  const [reason, setReason] = useState(defaultReason);
  const [touched, setTouched] = useState(false);
  const reasonRef = useRef(null);
  const confirmRef = useRef(null);
  const destructive = tone === 'destructive';
  const missingReason = requireReason && !reason.trim();

  // A fresh reason each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setReason(defaultReason || '');
    setTouched(false);
    const focus = setTimeout(() => (requireReason ? reasonRef.current : confirmRef.current)?.focus(), 0);
    return () => clearTimeout(focus);
  }, [open, defaultReason, requireReason]);

  if (!open) return null;

  function confirm() {
    if (busy) return;
    if (missingReason) {
      setTouched(true);
      reasonRef.current?.focus();
      return;
    }
    if (requireReason) onConfirm?.(reason.trim());
    else onConfirm?.();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!busy) onClose?.();
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      confirm();
    }
  }

  const Icon = destructive ? AlertTriangle : HelpCircle;

  return (
    <Modal
      open={open}
      title={title}
      bare
      onClose={() => { if (!busy) onClose?.(); }}
      width="min(480px, 92vw)"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button ref={confirmRef} type="button" variant={tone} onClick={confirm} disabled={busy || (touched && missingReason)}>
            {busy ? 'Please wait…' : confirmLabel}
          </Button>
        </div>
      }
    >
      {/* Keys stay inside the dialog: Enter here must not submit a form behind it. */}
      <div onKeyDown={onKeyDown} className="relative">
        <Button variant="ghost" size="icon" type="button" aria-label="Close" onClick={onClose} disabled={busy} className="absolute -right-2 -top-2">
          <X size={18} />
        </Button>
        <div className="flex items-start gap-4 pr-8">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${destructive ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-[var(--primary,#2563eb)]'}`}>
            <Icon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-[17px] font-semibold text-[var(--text-main)]">{title}</h3>
            {description ? <div className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{description}</div> : null}
          </div>
        </div>

        {children ? <div className="mt-4 pl-14">{children}</div> : null}

        {requireReason ? (
          <div className="mt-4 space-y-1.5 pl-14">
            <label htmlFor="confirm-dialog-reason" className="text-[13px] font-semibold text-slate-700">
              {reasonLabel} <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="confirm-dialog-reason"
              ref={reasonRef}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={reasonPlaceholder}
              maxLength={300}
              aria-invalid={touched && missingReason}
              className={`w-full resize-none rounded-[var(--radius-input,0.75rem)] border bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:ring-2 ${touched && missingReason ? 'border-rose-300 focus:ring-rose-200' : 'border-slate-200 focus:border-[var(--primary,#2563eb)] focus:ring-blue-100'}`}
            />
            {touched && missingReason ? <p className="text-[12px] font-medium text-rose-600">Enter a reason to continue.</p> : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

import { useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export function Modal({ open, title, subtitle, children, onClose, footer, width = 'min(980px, 96vw)', hideHeader = false }) {
  const modalRef = useRef();

  if (!open) return null;

  const handleBackdropClick = (e) => {
    if (e.target?.closest?.('[data-modal-portal="true"]')) return;
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm" role="presentation" onMouseDown={handleBackdropClick}>
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div
          ref={modalRef}
          className="relative w-full rounded-2xl border border-slate-200 bg-white shadow-lg flex flex-col"
          style={{ maxWidth: width, maxHeight: 'min(85vh, 800px)' }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {hideHeader ? (
            <div className="flex justify-end px-6 pt-5">
              <Button variant="ghost" size="icon" type="button" aria-label="Close modal" onClick={onClose}>
                <X size={18} />
              </Button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-main)]">{title}</h3>
                {subtitle ? <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p> : null}
              </div>
              <Button variant="ghost" size="icon" type="button" aria-label="Close modal" onClick={onClose}>
                <X size={18} />
              </Button>
            </div>
          )}
          <div className={hideHeader ? 'px-6 pb-6 pt-2 overflow-y-auto' : 'px-6 py-6 overflow-y-auto'}>{children}</div>
          {footer ? <div className="rounded-b-2xl border-t border-slate-200 px-6 py-5 bg-slate-50 shrink-0">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

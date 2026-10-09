import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

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
  busy = false
}) {
  const onClose = onCloseProp || onCancel;
  return (
    <Modal
      open={open}
      title={title}
      subtitle={description}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
      width="min(560px, 92vw)"
    >
      {/* Description is already passed as subtitle to Modal */}
    </Modal>
  );
}

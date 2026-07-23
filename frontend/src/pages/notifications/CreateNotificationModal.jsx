import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import {
  NOTIFICATION_MODULE_OPTIONS,
  NOTIFICATION_SEVERITY_OPTIONS,
  NOTIFICATION_TYPE_OPTIONS
} from './notificationUtils';

const INITIAL_FORM = {
  title: '',
  message: '',
  module: 'system',
  type: 'info',
  severity: 'medium',
  actionUrl: '',
  recipientRoleCodes: '',
  includeDefaultRecipients: true,
  sendEmail: true
};

function splitCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function CreateNotificationModal({ open, onClose, onCreate, saving }) {
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
    }
  }, [open]);

  function handleSubmit(event) {
    event.preventDefault();
    onCreate({
      title: form.title.trim(),
      message: form.message.trim(),
      module: form.module,
      type: form.type,
      severity: form.severity,
      actionUrl: form.actionUrl.trim(),
      recipientRoleCodes: splitCsv(form.recipientRoleCodes),
      includeDefaultRecipients: form.includeDefaultRecipients,
      includeActorUserId: true,
      sendEmail: form.sendEmail
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Notification"
      subtitle="Manual notification bhejo selected recipients ko."
      width="min(880px, 96vw)"
      footer={(
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="create-notification-form" disabled={saving}>
            {saving ? 'Creating...' : 'Create Notification'}
          </Button>
        </div>
      )}
    >
      <form id="create-notification-form" className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Title</label>
            <Input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Branch updated"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Module</label>
            <Select
              value={form.module}
              onChange={(value) => setForm((current) => ({ ...current, module: value }))}
              options={NOTIFICATION_MODULE_OPTIONS.filter((item) => item.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Type</label>
            <Select
              value={form.type}
              onChange={(value) => setForm((current) => ({ ...current, type: value }))}
              options={NOTIFICATION_TYPE_OPTIONS.filter((item) => item.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Severity</label>
            <Select
              value={form.severity}
              onChange={(value) => setForm((current) => ({ ...current, severity: value }))}
              options={NOTIFICATION_SEVERITY_OPTIONS.filter((item) => item.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Action URL</label>
            <Input
              value={form.actionUrl}
              onChange={(event) => setForm((current) => ({ ...current, actionUrl: event.target.value }))}
              placeholder="/app/master/branches"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Message</label>
            <Textarea
              rows={4}
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Notification body..."
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Recipient role codes</label>
            <Input
              value={form.recipientRoleCodes}
              onChange={(event) => setForm((current) => ({ ...current, recipientRoleCodes: event.target.value }))}
              placeholder="admin, manager"
            />
            <p className="text-[12px] text-slate-500">Blank chhodne par default recipients ko send hoga.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-slate-50/70 p-4 text-[13px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.includeDefaultRecipients}
              onChange={(event) => setForm((current) => ({ ...current, includeDefaultRecipients: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 focus:ring-[var(--primary,#1661F6)]"
              style={{ accentColor: 'var(--primary, #1661F6)' }}
            />
            Include default recipients
          </label>

          <label className="flex items-center gap-3 rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-slate-50/70 p-4 text-[13px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.sendEmail}
              onChange={(event) => setForm((current) => ({ ...current, sendEmail: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 focus:ring-[var(--primary,#1661F6)]"
              style={{ accentColor: 'var(--primary, #1661F6)' }}
            />
            Send email copy
          </label>
        </div>
      </form>
    </Modal>
  );
}

export default CreateNotificationModal;

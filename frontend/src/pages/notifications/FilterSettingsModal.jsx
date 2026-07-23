import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import {
  NOTIFICATION_MODULE_OPTIONS,
  NOTIFICATION_SEVERITY_OPTIONS,
  NOTIFICATION_TYPE_OPTIONS
} from './notificationUtils';

const EMPTY_FILTERS = {
  search: '',
  module: '',
  type: '',
  severity: '',
  unreadOnly: false
};

export function FilterSettingsModal({ open, onClose, value, onApply, onReset }) {
  const [draft, setDraft] = useState(EMPTY_FILTERS);

  useEffect(() => {
    if (!open) return;
    setDraft({
      search: String(value?.search || ''),
      module: String(value?.module || ''),
      type: String(value?.type || ''),
      severity: String(value?.severity || ''),
      unreadOnly: Boolean(value?.unreadOnly)
    });
  }, [open, value]);

  function handleApply(event) {
    event.preventDefault();
    onApply?.(draft);
  }

  function handleReset() {
    onReset?.();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filter Settings"
      width="min(760px, 96vw)"
      overflowVisible={true}
      footer={(
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={handleReset}>
            Reset Filters
          </Button>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="notification-filter-form">
              Apply Filters
            </Button>
          </div>
        </div>
      )}
    >
      <form id="notification-filter-form" className="space-y-5" onSubmit={handleApply}>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Search</label>
          <Input
            value={draft.search}
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search title, message, module..."
          />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Module</label>
            <Select
              value={draft.module}
              onChange={(value) => setDraft((current) => ({ ...current, module: value }))}
              options={NOTIFICATION_MODULE_OPTIONS}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Type</label>
            <Select
              value={draft.type}
              onChange={(value) => setDraft((current) => ({ ...current, type: value }))}
              options={NOTIFICATION_TYPE_OPTIONS}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Severity</label>
            <Select
              value={draft.severity}
              onChange={(value) => setDraft((current) => ({ ...current, severity: value }))}
              options={NOTIFICATION_SEVERITY_OPTIONS}
            />
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-slate-50/70 p-4 text-[13px] font-medium text-slate-700">
          <input
            type="checkbox"
            checked={draft.unreadOnly}
            onChange={(event) => setDraft((current) => ({ ...current, unreadOnly: event.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 focus:ring-[var(--primary,#1661F6)]"
            style={{ accentColor: 'var(--primary, #1661F6)' }}
          />
          Show unread only
        </label>
      </form>
    </Modal>
  );
}

export default FilterSettingsModal;

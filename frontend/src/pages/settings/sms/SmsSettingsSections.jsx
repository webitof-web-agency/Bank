import { ArrowDown, ArrowUp, CheckCircle2, CircleAlert, FlaskConical, Pencil, Plus, Send, X, XCircle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Textarea } from '../../../components/ui/Input';
import { Table } from '../../../components/ui/Table';
import {
  SMS_EVENT_LABELS,
  SMS_STATUSES,
  SMS_VARIABLE_LABELS,
  TEST_SEND_CONFIRMATION,
  describeSmsMessage,
  describeTestSendResult,
  formatDateTime,
  moveVariable,
  smsEventLabel,
  smsStatusMeta,
  templateAvailableVariables,
  testSendAvailability
} from './smsSettingsUtils';

// Presentational sections of the SMS settings page: props in, markup out.
// None of them receives or renders a credential; the config status only
// says whether each one is configured.

function Pill({ ok, children }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
      {children}
    </span>
  );
}

export function SmsStatusBadge({ status }) {
  const meta = smsStatusMeta(status);
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${meta.className}`}>{meta.label}</span>;
}

export function SmsReadinessCard({ readiness }) {
  const { ready, checks = [], missing = [] } = readiness || {};
  return (
    <Card className={`rounded-2xl border p-6 shadow-sm ${ready ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex items-start gap-3">
        {ready ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={22} /> : <CircleAlert className="mt-0.5 text-amber-600" size={22} />}
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">
            {ready ? 'Ready for live test' : 'Not ready for live test'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {ready
              ? 'Every check for SSA Paid To Member passes. Send one test voucher to a known number before relying on it.'
              : `${missing.length} item${missing.length === 1 ? '' : 's'} missing for SSA Paid To Member. This page never turns SMS on by itself.`}
          </p>
          <ul className="mt-4 grid gap-2 md:grid-cols-2">
            {checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-[13px]">
                {check.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-rose-500" />}
                <span>
                  <span className={check.ok ? 'text-slate-700' : 'font-semibold text-slate-900'}>{check.label}</span>
                  {!check.ok && check.fix ? <span className="block text-[12px] text-slate-500">{check.fix}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function SmsLoadErrorCard({ message, onRetry }) {
  return (
    <Card className="rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <XCircle className="mt-0.5 text-rose-500" size={22} />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">Could not load SMS settings</h2>
          <p className="mt-1 text-sm text-rose-700">{message}</p>
          <p className="mt-1 text-sm text-slate-600">Readiness is unknown until the configuration loads.</p>
        </div>
        {onRetry ? <Button type="button" variant="outline" onClick={onRetry}>Retry</Button> : null}
      </div>
    </Card>
  );
}

export function SmsGeneralConfigCard({ status }) {
  const config = status || {};
  const rows = [
    ['Provider', 'Flowit'],
    ['SMS sending', <Pill key="enabled" ok={config.smsEnabled === true}>{config.smsEnabled ? 'Enabled' : 'Disabled'}</Pill>],
    ['Flowit API key', <Pill key="key" ok={config.apiKeyConfigured === true}>{config.apiKeyConfigured ? 'Configured' : 'Not configured'}</Pill>],
    ['Sender ID', config.senderId ? <span key="sender" className="font-mono text-[13px] font-semibold text-slate-800">{config.senderId}</span> : <Pill key="sender" ok={false}>Not configured</Pill>],
    ['Webhook secret', <Pill key="webhook" ok={config.webhookSecretConfigured === true}>{config.webhookSecretConfigured ? 'Configured' : 'Not configured'}</Pill>],
    ['Request timeout', config.timeoutMs ? `${(Number(config.timeoutMs) / 1000).toLocaleString('en-IN')} s` : '—']
  ];
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">General SMS Configuration</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
            <dd className="mt-1 text-[14px] text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] text-blue-800">
        SMS on/off, the Flowit API key, sender ID and webhook secret come from the backend environment
        (SMS_ENABLED, FLOWIT_API_KEY, FLOWIT_SENDER_ID, FLOWIT_WEBHOOK_SECRET). Secrets are never shown or editable here.
      </p>
    </Card>
  );
}

function VariableOrder({ keys = [] }) {
  if (!keys.length) return <span className="text-slate-400">—</span>;
  return (
    <ol className="flex flex-wrap gap-1">
      {keys.map((key, index) => (
        <li key={`${key}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
          {index + 1}. {key}
        </li>
      ))}
    </ol>
  );
}

export function SmsTemplatesTable({ templates = [], canEdit = false, onEdit }) {
  const columns = [
    { key: 'eventCode', label: 'Event', render: (row) => (
      <div>
        <div className="font-semibold text-slate-900">{smsEventLabel(row.eventCode)}</div>
        <div className="font-mono text-[11px] text-slate-400">{row.eventCode}</div>
      </div>
    ) },
    { key: 'entityType', label: 'Entity Type' },
    { key: 'senderId', label: 'Sender ID', render: (row) => row.senderId ? <span className="font-mono">{row.senderId}</span> : <span className="text-slate-400">Default</span> },
    { key: 'dltMessageId', label: 'DLT Message ID', render: (row) => row.dltMessageId ? <span className="font-mono">{row.dltMessageId}</span> : <span className="text-amber-600">Not set</span> },
    { key: 'variableKeys', label: 'Variable Order', render: (row) => <VariableOrder keys={row.variableKeys} /> },
    { key: 'isEnabled', label: 'Enabled', render: (row) => <Pill ok={row.isEnabled === true}>{row.isEnabled ? 'Enabled' : 'Disabled'}</Pill> },
    { key: 'updatedAt', label: 'Updated At', dateOnly: false, render: (row) => (row.configured ? formatDateTime(row.updatedAt) : <span className="text-slate-400">Not saved yet</span>) },
    { key: 'action', label: 'Action', render: (row) => (
      <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => onEdit?.(row)} title={canEdit ? 'Edit template' : 'Needs settings.write'}>
        <Pencil size={14} /> Edit
      </Button>
    ) }
  ];
  return <Table columns={columns} data={templates.map((row) => ({ ...row, id: row.eventCode }))} emptyMessage="No SMS events defined" />;
}

// The edit form for one template. `draft` and `validation` come from the
// page; the event code is shown, never edited.
export function SmsTemplateForm({ template, draft, validation, defaultSenderId = '', onChange }) {
  const available = templateAvailableVariables(template);
  const keys = draft?.variableKeys || [];
  const unused = available.filter((key) => !keys.includes(key));
  const set = (field, value) => onChange?.({ ...draft, [field]: value });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Event</label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
            {SMS_EVENT_LABELS[template?.eventCode] || template?.eventCode} <span className="font-mono text-[11px] text-slate-400">({template?.eventCode})</span>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-slate-700">Entity Type</label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">{template?.entityType || '—'}</div>
        </div>
        <div>
          <label htmlFor="sms-dlt-id" className="mb-2 block text-[13px] font-semibold text-slate-700">DLT Message ID</label>
          <Input id="sms-dlt-id" value={draft?.dltMessageId || ''} onChange={(event) => set('dltMessageId', event.target.value)} placeholder="From the Flowit DLT Manager" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="sms-sender-id" className="mb-2 block text-[13px] font-semibold text-slate-700">Sender ID override</label>
          <Input id="sms-sender-id" value={draft?.senderId || ''} onChange={(event) => set('senderId', event.target.value.toUpperCase())} placeholder={defaultSenderId ? `Default: ${defaultSenderId}` : 'Default from FLOWIT_SENDER_ID'} maxLength={11} autoComplete="off" />
          <p className="mt-1 text-[12px] text-slate-500">Leave blank to use the backend default.</p>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-[13px] font-semibold text-slate-700">Variable order</label>
        <p className="mb-2 text-[12px] text-slate-500">
          Position 1 fills the first {'{#var#}'} of the DLT-approved text, position 2 the second, and so on. The order is saved exactly as shown.
        </p>
        <ol className="space-y-2">
          {keys.map((key, index) => (
            <li key={`${key}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-600">{index + 1}</span>
              <span className="flex-1 text-[13px]">
                <span className="font-mono text-slate-800">{key}</span>
                <span className="ml-2 text-slate-500">{SMS_VARIABLE_LABELS[key] || ''}</span>
              </span>
              <button type="button" aria-label={`Move ${key} up`} disabled={index === 0} onClick={() => set('variableKeys', moveVariable(keys, index, -1))} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={15} /></button>
              <button type="button" aria-label={`Move ${key} down`} disabled={index === keys.length - 1} onClick={() => set('variableKeys', moveVariable(keys, index, 1))} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={15} /></button>
              <button type="button" aria-label={`Remove ${key}`} onClick={() => set('variableKeys', keys.filter((_, i) => i !== index))} className="rounded-md p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><X size={15} /></button>
            </li>
          ))}
        </ol>
        {unused.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-slate-500">Add:</span>
            {unused.map((key) => (
              <button key={key} type="button" onClick={() => set('variableKeys', [...keys, key])} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-[12px] text-slate-700 hover:bg-slate-50">
                <Plus size={12} /> {key}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="sms-preview" className="mb-2 block text-[13px] font-semibold text-slate-700">Preview text</label>
        <Textarea id="sms-preview" rows={3} value={draft?.previewText || ''} onChange={(event) => set('previewText', event.target.value)} placeholder="Copy of the DLT-approved text, for reference only. It is never sent." />
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-medium text-slate-700">
        <input type="checkbox" checked={draft?.isEnabled === true} onChange={(event) => set('isEnabled', event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-[var(--primary)]" />
        Template enabled
      </label>

      {validation?.errors?.length ? (
        <ul className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          {validation.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : null}
      {validation?.warnings?.length ? (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function SmsLogFilters({ filters, eventCodes = [], onChange, onApply, onReset }) {
  const set = (field, value) => onChange?.({ ...filters, [field]: value });
  const selectClass = 'h-9 w-full rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white px-3 text-[13px] text-slate-700';
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7"
      onSubmit={(event) => { event.preventDefault(); onApply?.(); }}
    >
      <select aria-label="Status" className={selectClass} value={filters?.status || ''} onChange={(event) => set('status', event.target.value)}>
        <option value="">All statuses</option>
        {SMS_STATUSES.map((status) => <option key={status} value={status}>{smsStatusMeta(status).label}</option>)}
      </select>
      <select aria-label="Event" className={selectClass} value={filters?.eventCode || ''} onChange={(event) => set('eventCode', event.target.value)}>
        <option value="">All events</option>
        {eventCodes.map((eventCode) => <option key={eventCode} value={eventCode}>{smsEventLabel(eventCode)}</option>)}
      </select>
      <Input aria-label="Voucher No" placeholder="Voucher No" value={filters?.voucherNo || ''} onChange={(event) => set('voucherNo', event.target.value)} />
      <Input aria-label="Member Code" placeholder="Member Code" value={filters?.memberCode || ''} onChange={(event) => set('memberCode', event.target.value)} />
      <Input aria-label="From date" type="date" value={filters?.dateFrom || ''} onChange={(event) => set('dateFrom', event.target.value)} />
      <Input aria-label="To date" type="date" value={filters?.dateTo || ''} onChange={(event) => set('dateTo', event.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Apply</Button>
        <Button type="button" variant="outline" onClick={onReset}>Reset</Button>
      </div>
    </form>
  );
}

// The log shows the masked number only; the backend has no full number or
// message body to send.
export function SmsLogTable({ messages = [] }) {
  const columns = [
    { key: 'createdAt', label: 'Date/Time', dateOnly: false, render: (row) => <span className="whitespace-nowrap">{formatDateTime(row.createdAt)}</span> },
    { key: 'eventCode', label: 'Event', render: (row) => smsEventLabel(row.eventCode) },
    { key: 'voucherNo', label: 'Voucher No', render: (row) => row.voucherNo || '—' },
    { key: 'entityCode', label: 'Member Code', render: (row) => row.entityCode || '—' },
    { key: 'maskedMobile', label: 'Masked Mobile', render: (row) => row.maskedMobile ? <span className="font-mono">{row.maskedMobile}</span> : '—' },
    { key: 'status', label: 'Status', render: (row) => <SmsStatusBadge status={row.status} /> },
    { key: 'providerRequestId', label: 'Provider Request ID', render: (row) => row.providerRequestId ? <span className="font-mono text-[12px]">{row.providerRequestId}</span> : '—' },
    { key: 'attempts', label: 'Attempts', align: 'right', render: (row) => Number(row.attempts || 0) },
    { key: 'reason', label: 'Error / Skip Reason', render: (row) => <span className="text-[12px] text-slate-600">{describeSmsMessage(row) || '—'}</span> }
  ];
  const rows = messages.map((row) => ({
    id: row.id, createdAt: row.createdAt, eventCode: row.eventCode, voucherNo: row.voucherNo, entityCode: row.entityCode,
    maskedMobile: row.maskedMobile, status: row.status, providerRequestId: row.providerRequestId, attempts: row.attempts,
    skipReason: row.skipReason, errorCode: row.errorCode, errorMessage: row.errorMessage
  }));
  return <Table columns={columns} data={rows} defaultRowsPerPage={25} emptyMessage="No SMS messages match these filters" />;
}

// Temporary Flowit connectivity test. Shows only whether each test setting
// exists (and the masked number); the values stay on the backend.
export function SmsConnectivityTestCard({ test, canWrite = false, confirming = false, sending = false, result = null, onRequestSend, onConfirm, onCancel }) {
  const { canSend, reason } = testSendAvailability(test, canWrite);
  const outcome = describeTestSendResult(result);
  const yesNo = (value) => <Pill ok={value === true}>{value ? 'Yes' : 'No'}</Pill>;
  const outcomeClass = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800'
  };
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><FlaskConical size={18} className="text-violet-600" /> Flowit Connectivity Test</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Temporary: sends one OTP through an external client&apos;s approved DLT template to the configured test number, to check
            authentication, sending and the delivery report. Never used for members.
          </p>
        </div>
        <Button type="button" onClick={onRequestSend} disabled={!canSend || sending || confirming} title={reason || 'Send Test OTP'}>
          <Send size={16} /> {sending ? 'Sending...' : 'Send Test OTP'}
        </Button>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Test sender configured', yesNo(test?.senderConfigured)],
          ['Test template configured', yesNo(test?.templateConfigured)],
          ['Test mobile configured', <span key="mobile" className="inline-flex items-center gap-2">{yesNo(test?.mobileConfigured && test?.mobileValid)}{test?.maskedMobile ? <span className="font-mono text-[12px] text-slate-500">{test.maskedMobile}</span> : null}</span>]
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
            <dd className="mt-1">{value}</dd>
          </div>
        ))}
      </dl>

      {!canSend && reason ? <p className="mt-3 text-[13px] text-amber-700">{reason}</p> : null}

      {confirming ? (
        <div role="alertdialog" aria-label="Confirm test SMS" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[13px] text-amber-900">{TEST_SEND_CONFIRMATION}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={onConfirm} disabled={sending}>Send one test SMS</Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={sending}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {outcome ? (
        <p className={`mt-4 rounded-xl border px-4 py-3 text-[13px] ${outcomeClass[outcome.tone]}`}>{outcome.message}</p>
      ) : null}
    </Card>
  );
}

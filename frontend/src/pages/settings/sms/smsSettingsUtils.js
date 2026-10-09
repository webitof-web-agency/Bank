// SMS settings page: labels, readiness checks and template validation.
// Pure functions, so the rules can be tested without rendering the page.
//
// The backend never sends the Flowit API key or webhook secret, only whether
// each is configured; nothing here reads or keeps a secret.

export const SMS_EVENT_LABELS = {
  MEMBER_LOAN_PAID: 'Loan Paid to Member',
  MEMBER_CD_PAID: 'Compulsory Deposit Paid to Member',
  MEMBER_INSURANCE_PAID: 'Insurance Premium Paid to Member',
  MEMBER_SSA_PAID: 'SSA Paid To Member',
  FLOWIT_TEST_OTP: 'Flowit connectivity test'
};

// The temporary connectivity test's log event. Not a template: it never
// appears in the template table.
export const TEST_EVENT = 'FLOWIT_TEST_OTP';

export const TEST_SEND_CONFIRMATION = 'This sends one SMS using the temporary external-client OTP template to the configured test number. It is for connectivity testing only.';

// The variables each event supports, in the order its DLT text expects them.
// The backend sends the same list as `availableVariables`; this is the
// fallback when a template row has not been loaded yet.
const MEMBER_PAYMENT_VARIABLES = ['memberName', 'amount', 'voucherNo', 'date'];
export const SMS_EVENT_VARIABLES = {
  MEMBER_LOAN_PAID: MEMBER_PAYMENT_VARIABLES,
  MEMBER_CD_PAID: MEMBER_PAYMENT_VARIABLES,
  MEMBER_INSURANCE_PAID: MEMBER_PAYMENT_VARIABLES,
  MEMBER_SSA_PAID: MEMBER_PAYMENT_VARIABLES
};

export const SMS_VARIABLE_LABELS = {
  memberName: 'Member name',
  memberCode: 'Member code',
  amount: 'Amount',
  voucherNo: 'Voucher no.',
  date: 'Date (DD-MM-YYYY)'
};

export const SMS_STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'];

export const SMS_STATUS_META = {
  PENDING: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  SENT: { label: 'Sent', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  DELIVERED: { label: 'Delivered', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { label: 'Failed', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  SKIPPED: { label: 'Skipped', className: 'bg-slate-100 text-slate-600 border-slate-200' }
};

// Skip reasons as the backend stores them (plus the short aliases used in
// the Phase 2 brief), in plain words.
export const SMS_REASON_LABELS = {
  NO_MOBILE: 'Member has no mobile number',
  INVALID_MOBILE: 'Member mobile number is invalid',
  PLACEHOLDER_MOBILE: 'Member mobile number is a placeholder (e.g. 9999999999)',
  MEMBER_DISMEMBERED: 'Member is inactive/dismembered',
  DISMEMBERED: 'Member is inactive/dismembered',
  MEMBER_DELETED: 'Member record is deleted',
  MEMBER_NOT_FOUND: 'Member was not found',
  SMS_DISABLED: 'SMS is disabled',
  PROVIDER_NOT_CONFIGURED: 'Flowit is not configured (API key or sender ID missing)',
  TEMPLATE_NOT_CONFIGURED: 'SMS template is not configured',
  MISSING_TEMPLATE: 'SMS template is not configured',
  TEMPLATE_DISABLED: 'SMS template is disabled'
};

// Error codes set by our own code (the Flowit provider and the retry job).
// Numeric codes are Flowit's documented ones; their text is stored with them.
export const SMS_ERROR_LABELS = {
  TIMEOUT: 'No response from Flowit in time (the SMS may still have been sent)',
  NETWORK: 'Could not reach Flowit',
  CONNECTION_LOST: 'Connection to Flowit dropped during the request (the SMS may still have been sent)',
  INTERRUPTED: 'Sending was interrupted (the SMS may still have been sent); not retried',
  CONFIG: 'SMS configuration incomplete',
  INVALID_NUMBER: 'No valid mobile number',
  DLR_FAILED: 'Delivery failed',
  MAX_ATTEMPTS: 'Gave up after 3 attempts',
  VOUCHER_NOT_FOUND: 'The voucher no longer exists',
  TEMPLATE_VARIABLE: 'Template variable not available',
  VARIABLE_TOO_LONG: 'A template value is longer than SMS_MAX_VARIABLE_LENGTH; not sent'
};

const PROVIDER_TEXT_MAX = 160;

export function smsEventLabel(eventCode) {
  return SMS_EVENT_LABELS[eventCode] || eventCode || '—';
}

export function smsStatusMeta(status) {
  const code = String(status || '').toUpperCase();
  return SMS_STATUS_META[code] || { label: code || '—', className: 'bg-slate-100 text-slate-600 border-slate-200' };
}

export function describeSkipReason(reason) {
  const code = String(reason || '').toUpperCase();
  if (!code) return '';
  return SMS_REASON_LABELS[code] || code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

// Provider text as the administrator sees it: one line, bounded, and with
// anything shaped like a credential or a header removed (the backend already
// stores only safe text; this is a second guard).
export function safeProviderText(text) {
  return String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\b(authorization|x-[a-z-]+|api[-_ ]?key|secret|bearer)\b\s*[:=]?\s*\S+/gi, '[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    .trim()
    .slice(0, PROVIDER_TEXT_MAX);
}

// The "Error / Skip Reason" column of the log.
export function describeSmsMessage(row = {}) {
  const status = String(row.status || '').toUpperCase();
  if (status === 'SKIPPED') return describeSkipReason(row.skipReason);
  const errorCode = String(row.errorCode || '').trim();
  if (!errorCode) return '';
  const label = SMS_ERROR_LABELS[errorCode];
  const detail = safeProviderText(row.errorMessage);
  if (label && detail && detail !== label) return `${label}: ${detail}`;
  if (label) return label;
  return detail ? `Flowit error ${errorCode}: ${detail}` : `Flowit error ${errorCode}`;
}

// ---------------------------------------------------------------------------
// Readiness for a live SSA test

export function findTemplate(templates = [], eventCode = 'MEMBER_SSA_PAID') {
  return (templates || []).find((template) => template?.eventCode === eventCode) || null;
}

// Every check that must pass before a live SSA SMS test. Never changes any
// setting: it only reports.
export function computeSsaReadiness(status, templates = []) {
  const config = status || {};
  const template = findTemplate(templates, 'MEMBER_SSA_PAID');
  const senderId = String(template?.senderId || '').trim() || String(config.senderId || '').trim();
  const checks = [
    { key: 'smsEnabled', label: 'SMS enabled (SMS_ENABLED=true)', ok: config.smsEnabled === true, fix: 'Set SMS_ENABLED=true in the backend .env and restart the backend.' },
    { key: 'apiKey', label: 'Flowit API key configured', ok: config.apiKeyConfigured === true, fix: 'Set FLOWIT_API_KEY in the backend .env.' },
    { key: 'baseUrl', label: 'Flowit base URL is https://', ok: config.baseUrlValid !== false, fix: 'FLOWIT_BASE_URL must start with https://.' },
    { key: 'senderId', label: 'Sender ID configured', ok: Boolean(senderId) || config.senderIdConfigured === true, fix: 'Set FLOWIT_SENDER_ID in the backend .env, or a sender ID override on the template.' },
    { key: 'template', label: 'MEMBER_SSA_PAID template exists', ok: Boolean(template?.configured), fix: 'Save the SSA Paid To Member template below.' },
    { key: 'dltMessageId', label: 'DLT message ID entered', ok: Boolean(String(template?.dltMessageId || '').trim()), fix: 'Enter the DLT message ID approved for this SMS.' },
    { key: 'templateEnabled', label: 'Template enabled', ok: template?.isEnabled === true, fix: 'Enable the SSA Paid To Member template.' },
    { key: 'webhookSecret', label: 'Webhook secret configured', ok: config.webhookSecretConfigured === true, fix: 'Set FLOWIT_WEBHOOK_SECRET in the backend .env (delivery reports are rejected without it).' }
  ];
  const missing = checks.filter((check) => !check.ok);
  return { ready: missing.length === 0, checks, missing };
}

// ---------------------------------------------------------------------------
// Template editing

export function templateToDraft(template = {}) {
  const eventCode = template.eventCode || 'MEMBER_SSA_PAID';
  const available = templateAvailableVariables(template);
  return {
    eventCode,
    dltMessageId: template.dltMessageId || '',
    senderId: template.senderId || '',
    variableKeys: Array.isArray(template.variableKeys) && template.variableKeys.length ? [...template.variableKeys] : [...available],
    previewText: template.previewText || '',
    isEnabled: Boolean(template.isEnabled)
  };
}

export function templateAvailableVariables(template = {}) {
  if (Array.isArray(template.availableVariables) && template.availableVariables.length) return template.availableVariables;
  return SMS_EVENT_VARIABLES[template.eventCode] || [];
}

export function moveVariable(keys = [], index, direction) {
  const target = index + direction;
  if (index < 0 || index >= keys.length || target < 0 || target >= keys.length) return keys;
  const next = [...keys];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Errors block saving; warnings are shown but do not. The order is never
// changed here: what the administrator arranged is what gets saved.
export function validateTemplateDraft(draft = {}, available = []) {
  const errors = [];
  const warnings = [];
  const keys = (draft.variableKeys || []).map((key) => String(key || '').trim());
  const dltMessageId = String(draft.dltMessageId || '').trim();
  const senderId = String(draft.senderId || '').trim();

  if (dltMessageId && !/^[A-Za-z0-9_-]{1,120}$/.test(dltMessageId)) errors.push('DLT message ID may only contain letters, digits, - and _.');
  if (senderId && !/^[A-Za-z0-9]{3,11}$/.test(senderId)) errors.push('Sender ID must be 3 to 11 letters or digits.');
  if (draft.isEnabled && !dltMessageId) errors.push('Enter the DLT message ID before enabling this SMS.');
  if (!keys.length) errors.push('Add at least one variable.');
  const unknown = keys.filter((key) => !available.includes(key));
  if (unknown.length) errors.push(`Not supported for this event: ${unknown.join(', ')}.`);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length) errors.push(`Listed more than once: ${[...new Set(duplicates)].join(', ')}.`);

  if (!errors.length) {
    const missing = available.filter((key) => !keys.includes(key));
    if (missing.length) warnings.push(`Not used: ${missing.join(', ')}.`);
    const expected = available.filter((key) => keys.includes(key));
    if (keys.join('|') !== expected.join('|')) {
      warnings.push(`The order differs from the usual one (${available.join(', ')}). It must match the {#var#} order of the DLT-approved text exactly.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

// Only the editable fields: never an event code (it comes from the URL), and
// there is no field for credentials.
export function buildTemplatePayload(draft = {}) {
  return {
    dltMessageId: String(draft.dltMessageId || '').trim(),
    senderId: String(draft.senderId || '').trim().toUpperCase(),
    variableKeys: (draft.variableKeys || []).map((key) => String(key || '').trim()),
    previewText: String(draft.previewText || '').trim(),
    isEnabled: draft.isEnabled === true
  };
}

// Validates, then saves through the given client (api.sms in the app).
// Throws with the validation message instead of calling the backend.
export async function saveSmsTemplate(client, token, template, draft) {
  const { valid, errors } = validateTemplateDraft(draft, templateAvailableVariables(template));
  if (!valid) throw new Error(errors.join(' '));
  const response = await client.saveTemplate(token, template.eventCode, buildTemplatePayload(draft));
  return response?.data || null;
}

// ---------------------------------------------------------------------------
// Log filters

export const EMPTY_LOG_FILTERS = { status: '', eventCode: '', voucherNo: '', memberCode: '', dateFrom: '', dateTo: '' };

export function buildLogQuery(filters = {}, limit = 200) {
  const query = { limit };
  for (const key of Object.keys(EMPTY_LOG_FILTERS)) {
    const value = String(filters[key] || '').trim();
    if (value) query[key] = value;
  }
  return query;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Flowit connectivity test

// Whether the "Send Test OTP" button may be used, and if not, why.
export function testSendAvailability(test, canWrite) {
  if (!canWrite) return { canSend: false, reason: 'Needs the settings write permission.' };
  if (!test) return { canSend: false, reason: 'Test configuration not loaded.' };
  if (!test.ready) return { canSend: false, reason: (test.problems || []).join(' ') || 'The test is not configured.' };
  return { canSend: true, reason: '' };
}

// The result line after a test send (data from POST /sms/test-send), or the
// error it was refused with.
export function describeTestSendResult(result) {
  if (!result) return null;
  if (result.error) return { tone: 'error', message: result.error };
  if (result.status === 'SENT' || result.status === 'DELIVERED') {
    const requestId = String(result.providerRequestId || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 120) || 'not returned';
    return { tone: 'success', message: `Test SMS accepted by Flowit. Request ID: ${requestId}` };
  }
  if (result.status === 'FAILED') return { tone: 'error', message: `Test SMS failed: ${describeSmsMessage(result) || 'Flowit did not accept it.'}` };
  return { tone: 'warning', message: `Test SMS status: ${smsStatusMeta(result.status).label}. Check the SMS log.` };
}

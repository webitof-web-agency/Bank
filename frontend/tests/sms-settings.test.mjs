// Settings -> SMS (Phase 2): readiness, configuration status, template
// editing, the SMS log, reason labels, and that no secret is ever rendered.
// Components are rendered to static markup through Vite's SSR loader.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let utils;
let sections;
let links;
let vite;

const API_KEY = 'flowit-live-key-should-never-render-8c1d';
const WEBHOOK_SECRET = 'webhook-secret-should-never-render-77aa';

before(async () => {
  vite = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' },
    server: { hmr: false, middlewareMode: true }
  });
  utils = await vite.ssrLoadModule('/src/pages/settings/sms/smsSettingsUtils.js');
  sections = await vite.ssrLoadModule('/src/pages/settings/sms/SmsSettingsSections.jsx');
  links = await vite.ssrLoadModule('/src/pages/settings/settingsLinks.js');
});

after(async () => {
  await vite?.close();
});

const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const READY_STATUS = {
  provider: 'flowit', smsEnabled: true, apiKeyConfigured: true, senderId: 'BANKRP', senderIdConfigured: true,
  webhookSecretConfigured: true, baseUrlValid: true, timeoutMs: 10000
};
const SSA_TEMPLATE = {
  eventCode: 'MEMBER_SSA_PAID', label: 'SSA Paid To Member', entityType: 'MEMBER',
  availableVariables: ['memberName', 'amount', 'voucherNo', 'date'],
  dltMessageId: '', senderId: '', variableKeys: ['memberName', 'amount', 'voucherNo', 'date'],
  previewText: '', isEnabled: false, configured: false, updatedAt: null
};
const READY_TEMPLATE = { ...SSA_TEMPLATE, dltMessageId: 'DLT123', isEnabled: true, configured: true, updatedAt: '2026-10-08T06:30:00Z' };

// ---------------------------------------------------------------------------
// Route and settings link

test('SMS settings is linked under Settings at /app/settings/sms with settings.read', async () => {
  const link = links.SETTINGS_LINKS.find((item) => item.path === '/app/settings/sms');
  assert.ok(link);
  assert.equal(link.permission, 'settings.read');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /path="settings\/sms" element=\{<PermissionRoute permission="settings\.read"><SmsSettingsPage \/>/);
});

// ---------------------------------------------------------------------------
// Readiness

test('readiness: all checks pass -> "Ready for live test"', () => {
  const readiness = utils.computeSsaReadiness(READY_STATUS, [READY_TEMPLATE]);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.missing.length, 0);
  const html = text(render(sections.SmsReadinessCard, { readiness }));
  assert.match(html, /Ready for live test/);
  assert.doesNotMatch(html, /Not ready/);
});

test('readiness: default state lists exactly what is missing', () => {
  const status = { provider: 'flowit', smsEnabled: false, apiKeyConfigured: false, senderId: '', senderIdConfigured: false, webhookSecretConfigured: false, baseUrlValid: true, timeoutMs: 10000 };
  const readiness = utils.computeSsaReadiness(status, [SSA_TEMPLATE]);
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missing.map((check) => check.key), ['smsEnabled', 'apiKey', 'senderId', 'template', 'dltMessageId', 'templateEnabled', 'webhookSecret']);
  const html = text(render(sections.SmsReadinessCard, { readiness }));
  assert.match(html, /Not ready for live test/);
  assert.match(html, /7 items missing/);
  assert.match(html, /Set SMS_ENABLED=true/);
  assert.doesNotMatch(html, /Ready for live test/);
});

test('readiness: each single missing condition blocks "ready"', () => {
  const cases = [
    ['smsEnabled', { ...READY_STATUS, smsEnabled: false }, READY_TEMPLATE],
    ['apiKey', { ...READY_STATUS, apiKeyConfigured: false }, READY_TEMPLATE],
    ['senderId', { ...READY_STATUS, senderId: '', senderIdConfigured: false }, READY_TEMPLATE],
    ['webhookSecret', { ...READY_STATUS, webhookSecretConfigured: false }, READY_TEMPLATE],
    ['baseUrl', { ...READY_STATUS, baseUrlValid: false }, READY_TEMPLATE],
    ['template', READY_STATUS, { ...READY_TEMPLATE, configured: false }],
    ['dltMessageId', READY_STATUS, { ...READY_TEMPLATE, dltMessageId: '' }],
    ['templateEnabled', READY_STATUS, { ...READY_TEMPLATE, isEnabled: false }]
  ];
  for (const [key, status, template] of cases) {
    const readiness = utils.computeSsaReadiness(status, [template]);
    assert.equal(readiness.ready, false, key);
    assert.deepEqual(readiness.missing.map((check) => check.key), [key]);
  }
  // No template row at all, or no status loaded yet.
  assert.equal(utils.computeSsaReadiness(READY_STATUS, []).ready, false);
  assert.equal(utils.computeSsaReadiness(null, [READY_TEMPLATE]).ready, false);
  // A sender ID override on the template satisfies the sender check.
  const override = utils.computeSsaReadiness({ ...READY_STATUS, senderId: '', senderIdConfigured: false }, [{ ...READY_TEMPLATE, senderId: 'SOCBNK' }]);
  assert.equal(override.ready, true);
});

// ---------------------------------------------------------------------------
// Config status

test('config card shows Configured / Not configured, the sender ID, and never a secret', () => {
  // Even if a response ever carried secrets, the card has nowhere to show them.
  const leaky = { ...READY_STATUS, apiKey: API_KEY, webhookSecret: WEBHOOK_SECRET, FLOWIT_API_KEY: API_KEY };
  const html = render(sections.SmsGeneralConfigCard, { status: leaky });
  const plain = text(html);
  assert.match(plain, /Flowit/);
  assert.match(plain, /SMS sending Enabled/);
  assert.match(plain, /Flowit API key Configured/);
  assert.match(plain, /Webhook secret Configured/);
  assert.match(plain, /BANKRP/);
  assert.match(plain, /10 s/);
  assert.equal(html.includes(API_KEY), false);
  assert.equal(html.includes(WEBHOOK_SECRET), false);
  assert.equal(/<input/.test(html), false, 'no input fields for credentials');

  const empty = text(render(sections.SmsGeneralConfigCard, { status: { smsEnabled: false, apiKeyConfigured: false, senderId: '', webhookSecretConfigured: false, timeoutMs: 10000 } }));
  assert.match(empty, /SMS sending Disabled/);
  assert.match(empty, /Flowit API key Not configured/);
  assert.match(empty, /Sender ID Not configured/);
  assert.match(empty, /Webhook secret Not configured/);
});

// ---------------------------------------------------------------------------
// Templates

test('templates table: human readable event, all columns, edit gated by permission', () => {
  const html = render(sections.SmsTemplatesTable, { templates: [SSA_TEMPLATE], canEdit: false });
  const plain = text(html);
  for (const column of ['Event', 'Entity Type', 'Sender ID', 'DLT Message ID', 'Variable Order', 'Enabled', 'Updated At', 'Action']) {
    assert.match(plain, new RegExp(column), column);
  }
  assert.match(plain, /SSA Paid To Member/);
  assert.match(plain, /MEMBER_SSA_PAID/);
  assert.match(plain, /1\. memberName 2\. amount 3\. voucherNo 4\. date/);
  assert.match(plain, /Not set/);
  assert.match(plain, /Disabled/);
  assert.match(plain, /Not saved yet/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>.*Edit/);

  const editable = render(sections.SmsTemplatesTable, { templates: [READY_TEMPLATE], canEdit: true });
  assert.doesNotMatch(editable, /<button[^>]*disabled=""[^>]*title="Edit template"/);
  assert.match(text(editable), /DLT123/);
  assert.match(text(editable), /Enabled/);
});

test('template form: event code is read-only, the variable order is shown by position', () => {
  const draft = utils.templateToDraft(READY_TEMPLATE);
  const validation = utils.validateTemplateDraft(draft, READY_TEMPLATE.availableVariables);
  const html = render(sections.SmsTemplateForm, { template: READY_TEMPLATE, draft, validation, defaultSenderId: 'BANKRP' });
  const plain = text(html);
  assert.match(plain, /SSA Paid To Member/);
  assert.equal(/<input[^>]*value="MEMBER_SSA_PAID"/.test(html), false, 'event code is not an input');
  assert.match(html, /id="sms-dlt-id"[^>]*value="DLT123"/);
  assert.match(html, /placeholder="Default: BANKRP"/);
  assert.match(plain, /1 memberName Member name 2 amount Amount 3 voucherNo Voucher no\. 4 date Date/);
  assert.match(html, /<input type="checkbox"[^>]*checked=""/);
  assert.equal(html.includes(API_KEY), false);
});

test('template validation: supported variables only, no duplicates, DLT ID before enabling; order is never changed', () => {
  const available = SSA_TEMPLATE.availableVariables;
  const base = utils.templateToDraft(SSA_TEMPLATE);
  assert.deepEqual(base.variableKeys, ['memberName', 'amount', 'voucherNo', 'date']);

  assert.equal(utils.validateTemplateDraft({ ...base, variableKeys: ['memberName', 'mobileNo'] }, available).valid, false);
  assert.match(utils.validateTemplateDraft({ ...base, variableKeys: ['memberName', 'mobileNo'] }, available).errors.join(), /mobileNo/);
  assert.match(utils.validateTemplateDraft({ ...base, variableKeys: ['amount', 'amount'] }, available).errors.join(), /more than once: amount/);
  assert.match(utils.validateTemplateDraft({ ...base, variableKeys: [] }, available).errors.join(), /at least one/);
  assert.match(utils.validateTemplateDraft({ ...base, isEnabled: true, dltMessageId: '' }, available).errors.join(), /DLT message ID before enabling/);
  assert.match(utils.validateTemplateDraft({ ...base, senderId: 'TOOLONGSENDER' }, available).errors.join(), /3 to 11 letters or digits/);
  assert.match(utils.validateTemplateDraft({ ...base, senderId: 'BAD-ID' }, available).errors.join(), /letters or digits/);
  for (const senderId of ['12345', 'BANKRP', 'AB1234']) assert.equal(utils.validateTemplateDraft({ ...base, senderId }, available).valid, true, senderId);
  assert.match(utils.validateTemplateDraft({ ...base, dltMessageId: 'bad id!' }, available).errors.join(), /letters, digits/);

  const reordered = { ...base, variableKeys: ['amount', 'memberName', 'voucherNo', 'date'] };
  const result = utils.validateTemplateDraft(reordered, available);
  assert.equal(result.valid, true, 'a different order is allowed');
  assert.match(result.warnings.join(), /order differs/);
  assert.deepEqual(utils.buildTemplatePayload(reordered).variableKeys, ['amount', 'memberName', 'voucherNo', 'date']);

  assert.deepEqual(utils.moveVariable(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(utils.moveVariable(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
});

test('template save: sends only the editable fields, keeps the order, never an event code', async () => {
  const calls = [];
  const client = { saveTemplate: async (token, eventCode, payload) => { calls.push({ token, eventCode, payload }); return { success: true, data: { ...SSA_TEMPLATE, ...payload, configured: true } }; } };
  const draft = { ...utils.templateToDraft(SSA_TEMPLATE), eventCode: 'SOMETHING_ELSE', dltMessageId: ' DLT555 ', senderId: 'socbnk', variableKeys: ['memberName', 'voucherNo', 'amount', 'date'], previewText: 'Dear {#var#}', isEnabled: true };
  const saved = await utils.saveSmsTemplate(client, 'tok', SSA_TEMPLATE, draft);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].eventCode, 'MEMBER_SSA_PAID', 'event code comes from the template, not the draft');
  assert.deepEqual(calls[0].payload, { dltMessageId: 'DLT555', senderId: 'SOCBNK', variableKeys: ['memberName', 'voucherNo', 'amount', 'date'], previewText: 'Dear {#var#}', isEnabled: true });
  assert.equal(Object.hasOwn(calls[0].payload, 'eventCode'), false);
  assert.equal(saved.isEnabled, true);
});

test('template save: enabling and disabling', async () => {
  const calls = [];
  const client = { saveTemplate: async (_t, _e, payload) => { calls.push(payload); return { data: { ...READY_TEMPLATE, ...payload } }; } };
  const disabled = await utils.saveSmsTemplate(client, 'tok', READY_TEMPLATE, { ...utils.templateToDraft(READY_TEMPLATE), isEnabled: false });
  assert.equal(disabled.isEnabled, false);
  assert.equal(calls.at(-1).isEnabled, false);
  // Disabling without a DLT ID is fine; enabling without one is refused before any request.
  await utils.saveSmsTemplate(client, 'tok', SSA_TEMPLATE, { ...utils.templateToDraft(SSA_TEMPLATE), isEnabled: false });
  const before = calls.length;
  await assert.rejects(utils.saveSmsTemplate(client, 'tok', SSA_TEMPLATE, { ...utils.templateToDraft(SSA_TEMPLATE), isEnabled: true }), /DLT message ID before enabling/);
  assert.equal(calls.length, before, 'no request for an invalid draft');
});

// ---------------------------------------------------------------------------
// SMS log

const LOG_ROWS = [
  { id: '1', createdAt: '2026-10-08T05:00:00Z', eventCode: 'MEMBER_SSA_PAID', voucherNo: 'V-101', entityCode: 'M001', maskedMobile: '98XXXXXX10', status: 'DELIVERED', providerRequestId: 'req-abc', attempts: 1 },
  { id: '2', createdAt: '2026-10-08T05:01:00Z', eventCode: 'MEMBER_SSA_PAID', voucherNo: 'V-102', entityCode: 'M002', maskedMobile: '', status: 'SKIPPED', skipReason: 'NO_MOBILE', attempts: 0 },
  { id: '3', createdAt: '2026-10-08T05:02:00Z', eventCode: 'MEMBER_SSA_PAID', voucherNo: 'V-103', entityCode: 'M003', maskedMobile: '98XXXXXX01', status: 'FAILED', errorCode: '416', errorMessage: "You don't have sufficient wallet balance", attempts: 1 },
  { id: '4', createdAt: '2026-10-08T05:03:00Z', eventCode: 'MEMBER_SSA_PAID', voucherNo: 'V-104', entityCode: 'M004', maskedMobile: '98XXXXXX22', status: 'PENDING', errorCode: 'NETWORK', errorMessage: 'Could not reach Flowit (ECONNREFUSED)', attempts: 2 },
  // Fields the log must never show, should a response ever carry them.
  { id: '5', createdAt: '2026-10-08T05:04:00Z', eventCode: 'MEMBER_SSA_PAID', voucherNo: 'V-105', entityCode: 'M005', maskedMobile: '98XXXXXX33', status: 'SENT', attempts: 1, providerRequestId: 'req-def',
    mobile: '9876543233', mobileNo: '+919876543233', mobileHash: 'f'.repeat(64), message: 'Dear Member 5, Rs 700 paid', body: 'Dear Member 5', apiKey: API_KEY }
];

test('log table: columns, masked numbers, status badges and reasons; no number, body or secret', () => {
  const html = render(sections.SmsLogTable, { messages: LOG_ROWS });
  const plain = text(html);
  for (const column of ['Date/Time', 'Event', 'Voucher No', 'Member Code', 'Masked Mobile', 'Status', 'Provider Request ID', 'Attempts', 'Error / Skip Reason']) {
    assert.match(plain, new RegExp(column.replace('/', '\\/')), column);
  }
  for (const label of ['Delivered', 'Skipped', 'Failed', 'Pending', 'Sent']) assert.match(plain, new RegExp(label));
  assert.match(plain, /SSA Paid To Member/);
  assert.match(plain, /08-10-2026 \d\d:\d\d/, 'date and time, not the date alone');
  assert.match(plain, /98XXXXXX10/);
  assert.match(plain, /req-abc/);
  assert.match(plain, /Member has no mobile number/);
  assert.match(plain, /Flowit error 416: You don't have sufficient wallet balance|Flowit error 416: You don&#x27;t have sufficient wallet balance/);
  assert.match(plain, /Could not reach Flowit/);
  for (const forbidden of ['9876543233', '+919876543233', 'f'.repeat(64), 'Dear Member 5', API_KEY]) {
    assert.equal(html.includes(forbidden), false, forbidden);
  }
});

test('status badges have a readable label and colour for each status', () => {
  for (const [status, label] of [['PENDING', 'Pending'], ['SENT', 'Sent'], ['DELIVERED', 'Delivered'], ['FAILED', 'Failed'], ['SKIPPED', 'Skipped']]) {
    const html = render(sections.SmsStatusBadge, { status });
    assert.match(html, new RegExp(`>${label}<`));
    assert.match(html, /bg-(amber|blue|emerald|rose|slate)-/);
  }
});

test('skip reasons and errors in plain words', () => {
  const expected = {
    NO_MOBILE: 'Member has no mobile number',
    INVALID_MOBILE: 'Member mobile number is invalid',
    DISMEMBERED: 'Member is inactive/dismembered',
    MEMBER_DISMEMBERED: 'Member is inactive/dismembered',
    SMS_DISABLED: 'SMS is disabled',
    TEMPLATE_DISABLED: 'SMS template is disabled',
    MISSING_TEMPLATE: 'SMS template is not configured',
    TEMPLATE_NOT_CONFIGURED: 'SMS template is not configured'
  };
  for (const [reason, label] of Object.entries(expected)) {
    assert.equal(utils.describeSmsMessage({ status: 'SKIPPED', skipReason: reason }), label, reason);
  }
  assert.equal(utils.describeSkipReason('SOME_NEW_REASON'), 'Some new reason');
  assert.equal(utils.describeSmsMessage({ status: 'FAILED', errorCode: 'TIMEOUT', errorMessage: 'No response from Flowit within 10000 ms' }),
    'No response from Flowit in time (the SMS may still have been sent): No response from Flowit within 10000 ms');
  assert.equal(utils.describeSmsMessage({ status: 'FAILED', errorCode: 'DLR_FAILED', errorMessage: 'Number switched off' }), 'Delivery failed: Number switched off');
  assert.equal(utils.describeSmsMessage({ status: 'SENT' }), '');
});

test('provider text is shown in a safe form: no headers, keys or tokens', () => {
  const unsafe = `Invalid Authentication\nAuthorization: ${API_KEY} x-webhook-secret: ${WEBHOOK_SECRET} token abcdefghijklmnopqrstuvwxyz0123456789ABCD`;
  const safe = utils.safeProviderText(unsafe);
  assert.equal(safe.includes(API_KEY), false);
  assert.equal(safe.includes(WEBHOOK_SECRET), false);
  assert.equal(safe.includes('abcdefghijklmnopqrstuvwxyz0123456789ABCD'), false);
  assert.equal(safe.includes('\n'), false);
  assert.match(safe, /^Invalid Authentication/);
  assert.ok(utils.safeProviderText('x'.repeat(500)).length <= 160);
});

test('log filters: only non-empty filters are sent', () => {
  assert.deepEqual(utils.buildLogQuery({ ...utils.EMPTY_LOG_FILTERS, status: 'FAILED', memberCode: ' M001 ', dateFrom: '2026-10-01' }),
    { limit: 200, status: 'FAILED', memberCode: 'M001', dateFrom: '2026-10-01' });
  const html = render(sections.SmsLogFilters, { filters: utils.EMPTY_LOG_FILTERS, eventCodes: ['MEMBER_SSA_PAID'] });
  assert.match(html, /<option value="MEMBER_SSA_PAID">SSA Paid To Member<\/option>/);
  for (const status of ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED']) assert.match(html, new RegExp(`<option value="${status}">`));
});

test('load failure shows an error with retry, not "not configured" as if it were known', () => {
  const plain = text(render(sections.SmsLoadErrorCard, { message: 'Missing permission: settings.read', onRetry: () => {} }));
  assert.match(plain, /Could not load SMS settings/);
  assert.match(plain, /Missing permission: settings\.read/);
  assert.match(plain, /Readiness is unknown/);
  assert.match(plain, /Retry/);
  assert.doesNotMatch(plain, /Not configured|Ready for live test/);
});

test('ambiguous send outcomes say the SMS may still have been sent', () => {
  assert.match(utils.describeSmsMessage({ status: 'FAILED', errorCode: 'INTERRUPTED', errorMessage: 'Sending was interrupted' }), /may still have been sent/);
  assert.match(utils.describeSmsMessage({ status: 'FAILED', errorCode: 'CONNECTION_LOST', errorMessage: 'Connection to Flowit failed during the request (ECONNRESET)' }), /may still have been sent/);
  assert.equal(utils.describeSmsMessage({ status: 'FAILED', errorCode: 'HTTP_502', errorMessage: 'Flowit returned HTTP 502' }), 'Flowit error HTTP_502: Flowit returned HTTP 502');
});

// ---------------------------------------------------------------------------
// Flowit connectivity test

const TEST_READY = {
  eventCode: 'FLOWIT_TEST_OTP', senderConfigured: true, templateConfigured: true, mobileConfigured: true, mobileValid: true,
  maskedMobile: '98XXXXXX10', allowedHere: true, cooldownSeconds: 60, ready: true, problems: []
};

test('connectivity test card: Yes/No flags and masked number only', () => {
  const plain = text(render(sections.SmsConnectivityTestCard, { test: TEST_READY, canWrite: true }));
  assert.match(plain, /Flowit Connectivity Test/);
  assert.match(plain, /Test sender configured Yes/);
  assert.match(plain, /Test template configured Yes/);
  assert.match(plain, /Test mobile configured Yes 98XXXXXX10/);
  const incomplete = text(render(sections.SmsConnectivityTestCard, {
    test: { ...TEST_READY, senderConfigured: false, mobileValid: false, maskedMobile: '', ready: false, problems: ['FLOWIT_TEST_SENDER_ID is not set.'] }, canWrite: true
  }));
  assert.match(incomplete, /Test sender configured No/);
  assert.match(incomplete, /Test mobile configured No/);
  assert.match(incomplete, /FLOWIT_TEST_SENDER_ID is not set/);
});

test('connectivity test button: blocked when config is incomplete or without settings.write', () => {
  const sendButton = (html) => html.match(/<button[^>]*title="[^"]*"[^>]*>.*?Send Test OTP<\/button>/)[0];
  assert.doesNotMatch(sendButton(render(sections.SmsConnectivityTestCard, { test: TEST_READY, canWrite: true })), /disabled=""/);
  assert.match(sendButton(render(sections.SmsConnectivityTestCard, { test: { ...TEST_READY, ready: false, problems: ['SMS_ENABLED is not true.'] }, canWrite: true })), /disabled=""/);
  assert.match(sendButton(render(sections.SmsConnectivityTestCard, { test: TEST_READY, canWrite: false })), /disabled=""/);
  assert.match(sendButton(render(sections.SmsConnectivityTestCard, { test: null, canWrite: true })), /disabled=""/);
  assert.deepEqual(utils.testSendAvailability(TEST_READY, true), { canSend: true, reason: '' });
  assert.match(utils.testSendAvailability(TEST_READY, false).reason, /write permission/);
});

test('connectivity test: the confirmation is shown before sending', () => {
  const closed = text(render(sections.SmsConnectivityTestCard, { test: TEST_READY, canWrite: true }));
  assert.equal(closed.includes(utils.TEST_SEND_CONFIRMATION), false);
  const html = render(sections.SmsConnectivityTestCard, { test: TEST_READY, canWrite: true, confirming: true });
  assert.match(text(html), /This sends one SMS using the temporary external-client OTP template to the configured test number\. It is for connectivity testing only\./);
  assert.match(text(html), /Send one test SMS/);
  assert.match(text(html), /Cancel/);
});

test('connectivity test: success, failure and refusal results', () => {
  const ok = text(render(sections.SmsConnectivityTestCard, { test: TEST_READY, canWrite: true, result: { status: 'SENT', providerRequestId: 'req-abc123', maskedMobile: '98XXXXXX10' } }));
  assert.match(ok, /Test SMS accepted by Flowit\. Request ID: req-abc123/);
  const failed = text(render(sections.SmsConnectivityTestCard, { test: TEST_READY, canWrite: true, result: { status: 'FAILED', errorCode: '424', errorMessage: 'Invalid Message ID' } }));
  assert.match(failed, /Test SMS failed: Flowit error 424: Invalid Message ID/);
  const cooldown = text(render(sections.SmsConnectivityTestCard, { test: TEST_READY, canWrite: true, result: { error: 'A test SMS was sent less than 60 seconds ago.' } }));
  assert.match(cooldown, /less than 60 seconds ago/);
  assert.equal(utils.smsEventLabel('FLOWIT_TEST_OTP'), 'Flowit connectivity test');
});

test('connectivity test card never renders secrets, even if the status carries them', () => {
  const leaky = { ...TEST_READY, mobile: '9876543210', senderId: 'JCBEXC', messageId: '1707169999999999999', otp: '180589', apiKey: API_KEY, webhookSecret: WEBHOOK_SECRET };
  const result = { status: 'SENT', providerRequestId: 'req-1', mobile: '9876543210', otp: '180589', apiKey: API_KEY };
  const html = render(sections.SmsConnectivityTestCard, { test: leaky, canWrite: true, confirming: true, result });
  for (const secret of ['9876543210', 'JCBEXC', '1707169999999999999', '180589', API_KEY, WEBHOOK_SECRET]) {
    assert.equal(html.includes(secret), false, secret);
  }
});

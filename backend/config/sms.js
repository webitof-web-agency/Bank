// SMS (Flowit) configuration, read from the environment on every call so a
// changed .env takes effect on restart and tests can set it per case. These
// values are backend-only: nothing here is ever sent to the frontend.

function cleanText(value) {
  return String(value ?? '').trim();
}

function getSmsConfig() {
  const timeout = Number(process.env.FLOWIT_TIMEOUT_MS || 10000);
  const maxVariableLength = Number(process.env.SMS_MAX_VARIABLE_LENGTH || 0);
  return {
    enabled: cleanText(process.env.SMS_ENABLED).toLowerCase() === 'true',
    baseUrl: cleanText(process.env.FLOWIT_BASE_URL || 'https://sms.flowitof.com').replace(/\/+$/, ''),
    apiKey: cleanText(process.env.FLOWIT_API_KEY),
    senderId: cleanText(process.env.FLOWIT_SENDER_ID),
    webhookSecret: cleanText(process.env.FLOWIT_WEBHOOK_SECRET),
    // The custom header Flowit is configured to send the secret in.
    webhookHeader: cleanText(process.env.FLOWIT_WEBHOOK_HEADER || 'x-webhook-secret').toLowerCase(),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 60000) : 10000,
    // Longest value allowed in one {#var#}; 0 = no limit. Neither Flowit's
    // docs nor a live test confirm a DLT limit, so none is assumed: set it
    // once confirmed. Values are never cut, an over-long one fails the SMS.
    maxVariableLength: Number.isInteger(maxVariableLength) && maxVariableLength > 0 ? maxVariableLength : 0
  };
}

// What is missing for live sending, by name only: never the values.
function getSmsConfigProblems(config = getSmsConfig()) {
  if (!config.enabled) return [];
  const problems = [];
  if (!config.apiKey) problems.push('FLOWIT_API_KEY is not set');
  if (!/^https:\/\//i.test(config.baseUrl)) problems.push('FLOWIT_BASE_URL must be an https:// URL');
  return problems;
}

function validateSmsConfig() {
  const config = getSmsConfig();
  const problems = getSmsConfigProblems(config);
  if (problems.length) {
    console.error(`[sms] SMS_ENABLED=true but the configuration is incomplete: ${problems.join('; ')}. SMS will be skipped.`);
  }
  if (config.enabled && !config.webhookSecret) {
    console.warn('[sms] FLOWIT_WEBHOOK_SECRET is not set: Flowit delivery reports will be rejected.');
  }
  return { enabled: config.enabled, ready: config.enabled && !problems.length };
}

// What the SMS settings page may see: whether each setting is present, never
// a secret's value. FLOWIT_API_KEY and FLOWIT_WEBHOOK_SECRET stay
// environment-only; the sender ID is not a secret (it is printed on every SMS).
function getSmsConfigStatus(config = getSmsConfig()) {
  return {
    provider: 'flowit',
    smsEnabled: config.enabled,
    apiKeyConfigured: Boolean(config.apiKey),
    senderId: config.senderId,
    senderIdConfigured: Boolean(config.senderId),
    webhookSecretConfigured: Boolean(config.webhookSecret),
    baseUrlValid: /^https:\/\//i.test(config.baseUrl),
    timeoutMs: config.timeoutMs
  };
}

// Temporary Flowit connectivity test (POST /api/sms/test-send): sends one
// OTP through a DLT template already approved for another client, to prove
// authentication, transport, request_id and the delivery webhook. Sender,
// template and number are backend-only and never come from the browser.
// Not a Banking Raipur template: never used for members or vouchers.
const DEFAULT_TEST_OTP = '180589';

function getSmsTestConfig() {
  const production = cleanText(process.env.NODE_ENV).toLowerCase() === 'production';
  const configuredOtp = cleanText(process.env.FLOWIT_TEST_OTP);
  return {
    senderId: cleanText(process.env.FLOWIT_TEST_SENDER_ID).toUpperCase(),
    messageId: cleanText(process.env.FLOWIT_TEST_MESSAGE_ID),
    mobile: cleanText(process.env.FLOWIT_TEST_MOBILE),
    // A fixed test value, never a generated login OTP; outside development
    // and test it must be set explicitly.
    otp: configuredOtp || (production ? '' : DEFAULT_TEST_OTP),
    production,
    allowedHere: !production || cleanText(process.env.FLOWIT_TEST_ALLOW_IN_PRODUCTION).toLowerCase() === 'true'
  };
}

module.exports = {
  getSmsConfig,
  getSmsConfigProblems,
  getSmsConfigStatus,
  getSmsTestConfig,
  validateSmsConfig
};

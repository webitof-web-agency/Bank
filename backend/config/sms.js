// SMS (Flowit) configuration, read from the environment on every call so a
// changed .env takes effect on restart and tests can set it per case. These
// values are backend-only: nothing here is ever sent to the frontend.

function cleanText(value) {
  return String(value ?? '').trim();
}

function getSmsConfig() {
  const timeout = Number(process.env.FLOWIT_TIMEOUT_MS || 10000);
  return {
    enabled: cleanText(process.env.SMS_ENABLED).toLowerCase() === 'true',
    baseUrl: cleanText(process.env.FLOWIT_BASE_URL || 'https://sms.flowitof.com').replace(/\/+$/, ''),
    apiKey: cleanText(process.env.FLOWIT_API_KEY),
    senderId: cleanText(process.env.FLOWIT_SENDER_ID),
    webhookSecret: cleanText(process.env.FLOWIT_WEBHOOK_SECRET),
    // The custom header Flowit is configured to send the secret in.
    webhookHeader: cleanText(process.env.FLOWIT_WEBHOOK_HEADER || 'x-webhook-secret').toLowerCase(),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 60000) : 10000
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

module.exports = {
  getSmsConfig,
  getSmsConfigProblems,
  validateSmsConfig
};

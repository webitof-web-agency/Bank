// Flowit (Bulk9 platform) SMS provider: DLT route, one request per message.
//
// From the Flowit API reference (docs.bulk9.com, embedded at
// sms.flowitof.com/docs):
//   POST {base}/dev/bulkV2, header "Authorization: <API key>" (no "Bearer"),
//   JSON body { sender_id, message: <DLT Message ID>, variables_values:
//   "v1|v2|...", route: "dlt", numbers: "<10-digit>[,...]", udf1..udf3 }.
//   Success: { "return": true, "request_id": "...", "message": [...] }.
//   Errors: HTTP 400/401 with a numeric code (412 invalid key, 416 low
//   balance, 995 spamming, ...). The exact error body for this endpoint is
//   not documented; the OTP endpoint shows { return, status_code, message },
//   so both that and a plain { message } are read below.
//
// Never logs the API key, the Authorization header, the number or the
// variable values.
const { getSmsConfig } = require('../../config/sms');

const PROVIDER = 'flowit';

// The "Error Code List" page, verbatim: HTTP 400/401 with these codes.
const ERROR_CODES = {
  401: 'Sender ID Missing',
  402: 'Message Text Missing',
  403: 'Route Missing',
  404: 'Language Missing',
  405: 'Numbers Missing',
  406: 'Invalid Sender ID',
  407: 'Invalid words used in message',
  408: 'Invalid Route',
  409: 'Invalid Route Authentication',
  410: 'Invalid Language',
  411: 'Invalid Numbers',
  412: 'Invalid Authentication, Check Authorization Key',
  413: 'Invalid Authentication, Authorization Key Disabled',
  414: 'IP is blacklisted from Dev API section',
  415: 'Account Disabled',
  416: "You don't have sufficient wallet balance",
  417: 'Use english letters or change language to unicode',
  424: 'Invalid Message ID',
  425: 'Invalid Template',
  426: 'Invalid link used in variables',
  500: 'Template/Sender id blacklisted at DLT',
  990: "You're hitting old API. Refer updated documentation",
  995: 'Spamming detected (sending multiple SMS to same number is not allowed)',
  996: 'Before using OTP SMS API, complete KYC.',
  997: 'Only numeric variable_values is allowed in OTP route',
  998: 'Use DLT route for sending Bulk SMS'
};

// Connection errors raised before any request bytes could reach Flowit.
const NOT_SENT_ERRORS = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);

function safeText(value, max = 200) {
  const text = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  return text.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function failure({ errorCode, message, httpStatus = null, retryable = false }) {
  return { success: false, provider: PROVIDER, errorCode: String(errorCode), message: safeText(message), httpStatus, retryable };
}

// variables: the values in template order. A "|" inside a value would shift
// every later variable, so it is replaced; control characters are dropped.
function joinVariables(variables = []) {
  return variables.map((value) => String(value ?? '').replace(/\|/g, '/').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).join('|');
}

async function send({ senderId, messageId, variables = [], numbers = [], udf1, udf2, udf3 } = {}, { fetchImpl = globalThis.fetch } = {}) {
  const config = getSmsConfig();
  if (!config.apiKey) return failure({ errorCode: 'CONFIG', message: 'Flowit API key is not configured' });
  if (!senderId) return failure({ errorCode: 'CONFIG', message: 'Sender ID is not configured' });
  if (!messageId) return failure({ errorCode: 'CONFIG', message: 'DLT message ID is not configured' });
  const list = (Array.isArray(numbers) ? numbers : [numbers]).map(String).filter((n) => /^\d{10}$/.test(n));
  if (!list.length) return failure({ errorCode: 'INVALID_NUMBER', message: 'No valid 10-digit number' });

  const body = {
    sender_id: String(senderId),
    message: String(messageId),
    variables_values: joinVariables(variables),
    route: 'dlt',
    numbers: list.join(',')
  };
  if (udf1) body.udf1 = String(udf1);
  if (udf2) body.udf2 = String(udf2);
  if (udf3) body.udf3 = String(udf3);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}/dev/bulkV2`, {
      method: 'POST',
      headers: { Authorization: config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    // A timeout is ambiguous (Flowit may have accepted the SMS), so it is
    // never retried automatically. Only errors raised before a connection
    // existed (refused, DNS, unreachable) prove Flowit never got the request;
    // a connection dropped mid-request (reset, socket closed) is as
    // ambiguous as a timeout.
    if (error?.name === 'AbortError') return failure({ errorCode: 'TIMEOUT', message: `No response from Flowit within ${config.timeoutMs} ms` });
    const cause = safeText(error?.cause?.code || error?.code || 'network error', 40);
    if (NOT_SENT_ERRORS.has(cause)) return failure({ errorCode: 'NETWORK', message: `Could not reach Flowit (${cause})`, retryable: true });
    return failure({ errorCode: 'CONNECTION_LOST', message: `Connection to Flowit failed during the request (${cause})` });
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  if (response.ok && data && data.return === true && data.request_id) {
    return { success: true, provider: PROVIDER, requestId: String(data.request_id), message: safeText(data.message) };
  }

  // The documented code comes in the body; without one only the HTTP status
  // is known (an HTTP 500 is a server error, not code 500 "blacklisted").
  const bodyCode = data?.status_code ?? data?.code ?? data?.error_code ?? null;
  const known = bodyCode !== null ? ERROR_CODES[Number(bodyCode)] : undefined;
  // Never retried: a documented error will not pass, and an HTTP 5xx (502 or
  // 504 from a gateway included) does not prove the SMS was not sent.
  return failure({
    errorCode: bodyCode !== null ? safeText(bodyCode, 40) : `HTTP_${response.status}`,
    message: known || safeText(data?.message) || `Flowit returned HTTP ${response.status}`,
    httpStatus: response.status
  });
}

module.exports = {
  ERROR_CODES,
  PROVIDER,
  joinVariables,
  send
};

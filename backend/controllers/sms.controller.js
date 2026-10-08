const smsService = require('../services/sms/sms.service');
const { getSmsConfig, getSmsConfigStatus } = require('../config/sms');

// Called by Flowit, not by a signed-in user: no JWT. Authenticated by the
// shared secret Flowit is configured to send in a custom header.
async function flowitWebhookController(req, res, next) {
  try {
    const config = getSmsConfig();
    if (!config.webhookSecret) {
      return res.status(503).json({ success: false, message: 'Webhook not configured' });
    }
    if (!smsService.verifyWebhookSecret(req.get(config.webhookHeader))) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const counts = await smsService.handleWebhook(req.body);
    res.json({ success: true, data: counts });
  } catch (error) {
    next(error);
  }
}

async function listTemplatesController(_req, res, next) {
  try {
    res.json({ success: true, data: await smsService.listTemplates() });
  } catch (error) {
    next(error);
  }
}

async function saveTemplateController(req, res, next) {
  try {
    res.json({ success: true, data: await smsService.saveTemplate(req.params.eventCode, req.body || {}) });
  } catch (error) {
    next(error);
  }
}

async function listMessagesController(req, res, next) {
  try {
    const { voucherId, voucherNo, status, eventCode, memberCode, dateFrom, dateTo, limit } = req.query || {};
    res.json({ success: true, data: await smsService.listMessages({ voucherId, voucherNo, status, eventCode, memberCode, dateFrom, dateTo, limit, user: req.user }) });
  } catch (error) {
    next(error);
  }
}

function configStatusController(_req, res) {
  res.json({ success: true, data: { ...getSmsConfigStatus(), test: smsService.getTestSendStatus() } });
}

// Temporary Flowit connectivity test. The request body is ignored on
// purpose: sender ID, DLT message ID and number come only from the backend
// environment.
async function testSendController(req, res, next) {
  try {
    const data = await smsService.sendTestOtp({ actorUserId: req.user?.id || null });
    res.json({ success: true, data });
  } catch (error) {
    if (error.code === 'SMS_TEST_CONFIG') {
      return res.status(400).json({ success: false, message: error.message, problems: error.problems });
    }
    if (error.statusCode === 429) {
      return res.status(429).json({ success: false, message: error.message, retryAfterSeconds: error.retryAfterSeconds });
    }
    return next(error);
  }
}

module.exports = {
  configStatusController,
  testSendController,
  flowitWebhookController,
  listMessagesController,
  listTemplatesController,
  saveTemplateController
};

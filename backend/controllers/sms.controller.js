const smsService = require('../services/sms/sms.service');
const { getSmsConfig } = require('../config/sms');

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
    const { voucherId, status, limit } = req.query || {};
    res.json({ success: true, data: await smsService.listMessages({ voucherId, status, limit }) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  flowitWebhookController,
  listMessagesController,
  listTemplatesController,
  saveTemplateController
};

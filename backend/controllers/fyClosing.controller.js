const fyClosing = require('../services/fyClosing/fyClosing.service');

async function listController(_req, res, next) {
  try {
    res.json({ success: true, data: await fyClosing.listYears() });
  } catch (error) {
    next(error);
  }
}

async function previewController(req, res, next) {
  try {
    res.json({ success: true, data: await fyClosing.preview(req.params.fy) });
  } catch (error) {
    next(error);
  }
}

async function closeController(req, res, next) {
  try {
    const { appropriation = [], remarks = '', includeEmployeeInterest = true } = req.body || {};
    res.json({ success: true, data: await fyClosing.closeYear(req.params.fy, { appropriation, remarks, includeEmployeeInterest: includeEmployeeInterest !== false, actorUser: req.user || null }) });
  } catch (error) {
    next(error);
  }
}

async function reopenController(req, res, next) {
  try {
    res.json({ success: true, data: await fyClosing.reopenYear(req.params.fy, { reason: req.body?.reason || '', actorUser: req.user || null }) });
  } catch (error) {
    next(error);
  }
}

module.exports = { closeController, listController, previewController, reopenController };

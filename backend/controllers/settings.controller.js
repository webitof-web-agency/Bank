const { getSettings, updateSettings } = require('../services/settings.service');
const { createNotification } = require('../services/notification.service');

async function getController(_req, res, next) {
  try {
    const settings = await getSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

async function getPublicController(_req, res, next) {
  try {
    const settings = await getSettings();
    const publicSettings = {
      appName: settings.appName,
      payload: {
        branding: settings.payload?.branding || {}
      }
    };
    res.json({ success: true, data: publicSettings });
  } catch (error) {
    next(error);
  }
}

async function updateController(req, res, next) {
  try {
    const settings = await updateSettings(req.body || {});
    void createNotification({
      title: 'System Settings Updated',
      message: 'System settings were updated.',
      type: 'security',
      severity: 'medium',
      module: 'settings',
      action: 'updated',
      actionUrl: '/app/settings/overview',
      entityType: 'Settings',
      entityId: 'default',
      entityCode: 'default',
      actorUserId: req.user?.id || null
    }).catch((error) => {
      console.error('[notification] Failed to create settings notification:', error.message);
    });
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getController,
  getPublicController,
  updateController
};

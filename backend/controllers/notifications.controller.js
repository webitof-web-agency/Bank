const jwt = require('jsonwebtoken');
const { buildAccessProfile } = require('../services/auth.service');
const {
  createNotification,
  deleteNotification,
  getNotificationById,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} = require('../services/notification.service');
const { registerNotificationStream } = require('../services/notificationHub');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing in environment configuration.');
  }
  return process.env.JWT_SECRET;
}

async function resolveStreamUser(token) {
  if (!token) return null;
  const decoded = jwt.verify(token, getJwtSecret());
  const userId = decoded.sub || decoded.uid || decoded.userId;
  if (!userId) return null;
  const user = await buildAccessProfile(userId);
  if (!user || !user.isActive) return null;
  return user;
}

async function listController(req, res, next) {
  try {
    const data = await listNotifications(req.user.id, req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function unreadCountController(req, res, next) {
  try {
    const count = await getUnreadCount(req.user.id);
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    next(error);
  }
}

async function getController(req, res, next) {
  try {
    const notification = await getNotificationById(req.params.id, req.user.id, Boolean(req.user?.isSuperAdmin));
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
}

async function createController(req, res, next) {
  try {
    const result = await createNotification({
      ...req.body,
      actorUserId: req.user?.id || null
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function markReadController(req, res, next) {
  try {
    const notification = await markNotificationRead(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
}

async function markAllReadController(req, res, next) {
  try {
    const result = await markAllNotificationsRead(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function deleteController(req, res, next) {
  try {
    const ok = await deleteNotification(req.params.id, req.user.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function streamController(req, res) {
  try {
    const token = String(req.query.token || '').trim();
    const user = await resolveStreamUser(token);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    registerNotificationStream(user.id, res);
    return undefined;
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message || 'Authentication failed' });
  }
}

module.exports = {
  createController,
  deleteController,
  getController,
  listController,
  markAllReadController,
  markReadController,
  streamController,
  unreadCountController
};

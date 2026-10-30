const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');
const { buildAccessProfile } = require('../services/auth.service');
const { isSessionCurrent } = require('../middlewares/auth');
const { isSessionRevoked } = require('../services/session.service');
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

// The stream (an EventSource, which can't send headers) authenticates with a
// short-lived ticket that is good for nothing else, so the session token never
// sits in a URL (proxy logs, history).
const STREAM_TICKET_SCOPE = 'notif-stream';

// It is tied to the session it came from, so logging out or changing the
// password ends it too; the page asks for a new one on every reconnect.
function signStreamTicket(userId, sessionId) {
  return jwt.sign({ sub: String(userId), sid: String(sessionId || ''), scope: STREAM_TICKET_SCOPE }, getJwtSecret(), { expiresIn: '5m' });
}

async function resolveStreamUser(ticket) {
  if (!ticket) return null;
  const decoded = jwt.verify(ticket, getJwtSecret(), { algorithms: ['HS256'] });
  if (decoded?.scope !== STREAM_TICKET_SCOPE || !decoded.sub || !decoded.sid) return null;
  if (await isSessionRevoked(decoded.sid)) return null;
  const user = await buildAccessProfile(decoded.sub);
  return isSessionCurrent(user, decoded) ? user : null;
}

async function streamTicketController(req, res, next) {
  try {
    res.json({ success: true, data: { ticket: signStreamTicket(req.user.id, req.auth?.jti) } });
  } catch (error) {
    next(error);
  }
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
    const title = String(req.body?.title || '').trim();
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    // Only what the app's forms send: a user must not supply raw email
    // subject/HTML (phishing from the society's mailbox) or an outside link.
    const body = req.body || {};
    const actionUrl = String(body.actionUrl || '').trim();
    const result = await createNotification({
      title,
      message: body.message,
      module: body.module,
      type: body.type,
      severity: body.severity,
      actionUrl: actionUrl.startsWith('/') && !actionUrl.startsWith('//') && !actionUrl.startsWith('/\\') ? actionUrl : '',
      entityType: body.entityType,
      entityId: body.entityId,
      recipientUserIds: body.recipientUserIds,
      recipientRoleCodes: body.recipientRoleCodes,
      includeDefaultRecipients: body.includeDefaultRecipients,
      sendEmail: body.sendEmail,
      actorUserId: req.user?.id || null
    });
    if (!result?.notifications?.length) {
      return res.status(400).json({ success: false, message: 'No matching recipients found' });
    }
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
    const user = await resolveStreamUser(String(req.query.ticket || '').trim());
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    registerNotificationStream(user.id, res);
    return undefined;
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
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
  streamTicketController,
  unreadCountController
};

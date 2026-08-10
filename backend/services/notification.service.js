const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const { getSettings } = require('./settings.service');
const { renderTemplate, sendMail } = require('./mailer.service');
const { toResponse } = require('../utils/response');
const { emitNotificationChange } = require('./notificationHub');

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function cleanLower(value, fallback = '') {
  return cleanText(value, fallback).toLowerCase();
}

function cleanArray(value = []) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function renderNotificationEmailTemplate(template = {}, values = {}, fallback = {}) {
  return {
    subject: renderTemplate(template.subject || fallback.subject || '', values),
    text: renderTemplate(template.text || fallback.text || '', values),
    html: renderTemplate(template.html || fallback.html || '', values)
  };
}

function formatEmailText(notification, appName = 'Bank') {
  const lines = [
    `${notification.title || 'Notification'}`,
    '',
    `${notification.message || ''}`.trim(),
    notification.actionUrl ? `Open: ${notification.actionUrl}` : '',
    '',
    `From ${appName}`
  ];
  return lines.filter((line) => line !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function formatEmailHtml(notification, appName = 'Bank') {
  const safeTitle = cleanText(notification.title, 'Notification');
  const safeMessage = cleanText(notification.message, '');
  const safeUrl = cleanText(notification.actionUrl, '');

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p style="margin:0 0 12px;font-weight:700;font-size:18px">${safeTitle}</p>
      ${safeMessage ? `<p style="margin:0 0 12px">${safeMessage}</p>` : ''}
      ${safeUrl ? `<p style="margin:0 0 16px"><a href="${safeUrl}" style="color:#2563eb;text-decoration:none">Open notification</a></p>` : ''}
      <p style="margin:20px 0 0;color:#6b7280;font-size:12px">From ${appName}</p>
    </div>
  `;
}

function fallbackNotificationTemplate(notification = {}, appName = 'Bank') {
  return {
    subject: `[${appName}] ${cleanText(notification.title, 'Notification')}`,
    text: formatEmailText(notification, appName),
    html: formatEmailHtml(notification, appName)
  };
}

function defaultNotificationQuery(userId, query = {}) {
  const search = cleanText(query.search);
  const filter = {
    recipientUserId: userId
  };

  if (query.unreadOnly === 'true' || query.unreadOnly === true) {
    filter.isRead = false;
  }
  if (query.module) {
    filter.module = cleanText(query.module);
  }
  if (query.type) {
    filter.type = cleanText(query.type);
  }
  if (query.severity) {
    filter.severity = cleanText(query.severity);
  }
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { title: regex },
      { message: regex },
      { action: regex },
      { entityType: regex },
      { entityCode: regex },
      { module: regex }
    ];
  }

  return filter;
}

async function loadUsersWithRoles() {
  return User.find({ isActive: { $ne: false } })
    .populate({
      path: 'roles',
      select: 'code name permissions payload isSystem isActive'
    })
    .lean();
}

function getDefaultRoleCodes(settings = {}) {
  const configured = cleanArray(settings.notifications?.defaultRoleCodes);
  return configured.length ? configured.map((value) => value.toLowerCase()) : ['admin', 'manager'];
}

function isSystemRecipient(user, settings = {}) {
  if (!user || user.isActive === false) return false;
  if (user.isSuperAdmin) return true;

  const roles = Array.isArray(user.roles) ? user.roles : [];
  const defaultRoleCodes = new Set(getDefaultRoleCodes(settings));

  return roles.some((role) => {
    const roleCode = cleanLower(role.code);
    const notificationsEnabled = role?.payload?.notifications?.enabled;
    return defaultRoleCodes.has(roleCode) || notificationsEnabled === true;
  });
}

async function resolveRecipients({
  recipientUserIds = [],
  recipientRoleCodes = [],
  includeDefaultRecipients = true,
  includeActorUserId = true,
  actorUserId = null
} = {}) {
  const settings = await getSettings();
  const users = await loadUsersWithRoles();
  const explicitIds = new Set(cleanArray(recipientUserIds).map((value) => String(value)));
  const explicitRoleCodes = new Set(cleanArray(recipientRoleCodes).map((value) => value.toLowerCase()));
  const actorId = includeActorUserId && actorUserId ? String(actorUserId) : '';

  const recipients = [];
  const seen = new Set();

  for (const user of users) {
    const userId = String(user._id);
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const roleMatch = roles.some((role) => explicitRoleCodes.has(cleanLower(role.code)));
    const defaultMatch = includeDefaultRecipients && isSystemRecipient(user, settings);
    const explicitMatch = explicitIds.has(userId);
    const actorMatch = actorId && actorId === userId;

    if (!explicitIds.size && !explicitRoleCodes.size && !defaultMatch && !actorMatch) {
      continue;
    }

    if (explicitMatch || roleMatch || defaultMatch || actorMatch) {
      if (!seen.has(userId)) {
        seen.add(userId);
        recipients.push(user);
      }
    }
  }

  if (actorId && !seen.has(actorId)) {
    const actor = users.find((user) => String(user._id) === actorId);
    if (actor) {
      seen.add(actorId);
      recipients.push(actor);
    }
  }

  return recipients;
}

async function createNotification({
  title,
  message = '',
  type = 'info',
  severity = 'medium',
  module = 'system',
  action = '',
  actionUrl = '',
  entityType = '',
  entityId = '',
  entityCode = '',
  audience = '',
  payload = {},
  recipientUserIds = [],
  recipientRoleCodes = [],
  includeDefaultRecipients = true,
  includeActorUserId = true,
  actorUserId = null,
  sendEmail = true,
  emailTemplateKey = 'notificationAlert',
  emailVariables = {},
  emailSubject = '',
  emailText = '',
  emailHtml = ''
} = {}) {
  const settings = await getSettings();
  const appName = cleanText(settings.appName, 'Bank');
  const notificationSettings = settings.notifications || {};

  if (notificationSettings.enabled === false) {
    return { notifications: [], recipients: [] };
  }

  const recipients = await resolveRecipients({
    recipientUserIds,
    recipientRoleCodes,
    includeDefaultRecipients,
    includeActorUserId,
    actorUserId
  });

  if (!recipients.length) {
    return { notifications: [], recipients: [] };
  }

  const docs = recipients.map((recipient) => ({
    recipientUserId: recipient._id,
    actorUserId: actorUserId || null,
    title: cleanText(title, 'Notification'),
    message: cleanText(message),
    type: cleanText(type, 'info'),
    severity: cleanText(severity, 'medium'),
    module: cleanText(module, 'system'),
    action: cleanText(action),
    actionUrl: cleanText(actionUrl),
    entityType: cleanText(entityType),
    entityId: cleanText(entityId),
    entityCode: cleanText(entityCode),
    audience: cleanText(audience),
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  }));

  const created = await Notification.insertMany(docs, { ordered: false });

  created.forEach((item) => {
    emitNotificationChange(item.recipientUserId, {
      action: 'created',
      notificationId: String(item._id),
      unreadCount: null
    });
  });

  if (sendEmail && notificationSettings.emailEnabled !== false) {
    for (const item of created) {
      const recipient = recipients.find((user) => String(user._id) === String(item.recipientUserId));
      if (!recipient?.email) {
        continue;
      }

      const template = settings.emailTemplates?.[emailTemplateKey] || {};
      const fallback = fallbackNotificationTemplate(item, appName);
      const values = {
        appName,
        title: item.title,
        message: item.message,
        actionUrl: item.actionUrl,
        entityType: item.entityType,
        entityCode: item.entityCode,
        recipientName: recipient.fullName || recipient.name || recipient.username || 'User',
        severity: item.severity,
        module: item.module,
        ...emailVariables
      };
      const rendered = renderNotificationEmailTemplate(template, values, fallback);
      const subject = cleanText(emailSubject, rendered.subject || fallback.subject);
      const text = cleanText(emailText, rendered.text || fallback.text);
      const html = cleanText(emailHtml, rendered.html || fallback.html);

      try {
        await sendMail({
          to: recipient.email,
          subject,
          text,
          html
        });
        await Notification.updateOne(
          { _id: item._id },
          {
            $set: {
              emailSent: true,
              emailSentAt: new Date(),
              emailTo: recipient.email,
              emailError: ''
            }
          }
        );
      } catch (error) {
        await Notification.updateOne(
          { _id: item._id },
          {
            $set: {
              emailSent: false,
              emailError: error.message || 'Failed to send email'
            }
          }
        );
      }
    }
  }

  return {
    notifications: created.map((doc) => toResponse(doc)),
    recipients: recipients.map((user) => ({
      id: String(user._id),
      email: user.email,
      fullName: user.fullName || user.name || user.username || ''
    }))
  };
}

async function listNotifications(userId, query = {}) {
  const filter = defaultNotificationQuery(userId, query);
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
  const skip = (page - 1) * limit;

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientUserId: userId, isRead: false })
  ]);

  return {
    items: items.map((item) => toResponse(item)),
    total,
    page,
    limit,
    unreadCount
  };
}

async function getUnreadCount(userId) {
  return Notification.countDocuments({ recipientUserId: userId, isRead: false });
}

async function getNotificationById(notificationId, userId, isSuperAdmin = false) {
  const query = isSuperAdmin ? { _id: notificationId } : { _id: notificationId, recipientUserId: userId };
  const notification = await Notification.findOne(query).lean();
  return notification ? toResponse(notification) : null;
}

async function markNotificationRead(notificationId, userId) {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientUserId: userId },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
        readByUserId: userId
      }
    },
    { new: true }
  ).lean();

  if (updated) {
    emitNotificationChange(userId, {
      action: 'read',
      notificationId: String(updated._id)
    });
  }

  return updated ? toResponse(updated) : null;
}

async function markAllNotificationsRead(userId) {
  const result = await Notification.updateMany(
    { recipientUserId: userId, isRead: false },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
        readByUserId: userId
      }
    }
  );

  emitNotificationChange(userId, {
    action: 'read-all'
  });

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0
  };
}

async function deleteNotification(notificationId, userId) {
  const record = await Notification.findOneAndDelete({ _id: notificationId, recipientUserId: userId }).lean();
  if (record) {
    emitNotificationChange(userId, {
      action: 'deleted',
      notificationId: String(record._id)
    });
  }
  return Boolean(record);
}

module.exports = {
  createNotification,
  deleteNotification,
  getNotificationById,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveRecipients
};

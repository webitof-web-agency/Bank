const { Schema, model, models } = require('mongoose');
const { schemaOptions } = require('../utils/mongoose');

const notificationSchema = new Schema(
  {
    recipientUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, default: '' },
    type: {
      type: String,
      enum: ['info', 'success', 'warning', 'error', 'security', 'transaction', 'master', 'system'],
      default: 'info'
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    module: { type: String, default: 'system', index: true },
    action: { type: String, default: '' },
    actionUrl: { type: String, default: '' },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
    entityCode: { type: String, default: '' },
    audience: { type: String, default: '' },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    readByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date, default: null },
    emailTo: { type: String, default: '' },
    emailError: { type: String, default: '' },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

notificationSchema.index({ recipientUserId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, module: 1, createdAt: -1 });

module.exports = models.Notification || model('Notification', notificationSchema);

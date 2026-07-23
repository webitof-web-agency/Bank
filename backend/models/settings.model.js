const { Schema, model, models } = require('mongoose');
const { schemaOptions } = require('../utils/mongoose');

const templateSchema = new Schema(
  {
    subject: { type: String, default: '' },
    text: { type: String, default: '' },
    html: { type: String, default: '' }
  },
  { _id: false }
);

const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    appName: { type: String, default: 'Bank' },
    smtp: {
      host: { type: String, default: '' },
      port: { type: Number, default: 587 },
      secure: { type: Boolean, default: false },
      username: { type: String, default: '' },
      password: { type: String, default: '' },
      fromName: { type: String, default: 'Bank' },
      fromEmail: { type: String, default: '' }
    },
    emailTemplates: {
      passwordReset: { type: templateSchema, default: () => ({}) },
      notificationAlert: { type: templateSchema, default: () => ({}) },
      demandReminder: { type: templateSchema, default: () => ({}) },
      monthlySummary: { type: templateSchema, default: () => ({}) },
      securityAlert: { type: templateSchema, default: () => ({}) }
    },
    notifications: {
      enabled: { type: Boolean, default: true },
      inAppEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true },
      defaultRoleCodes: { type: [String], default: ['admin', 'manager'] },
      masterAlerts: { type: Boolean, default: true },
      transactionAlerts: { type: Boolean, default: true },
      securityAlerts: { type: Boolean, default: true }
    },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);


module.exports = models.Settings || model('Settings', settingsSchema);

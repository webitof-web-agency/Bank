const { Schema, model, models } = require('mongoose');
const { schemaOptions } = require('../utils/mongoose');

const passwordResetSchema = new Schema(
  {
    otpHash: { type: String, default: '' },
    expiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    requestedAt: { type: Date, default: null },
    requestedFromIp: { type: String, default: '' },
    requestedUserAgent: { type: String, default: '' }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    code: { type: String, default: '', trim: true, uppercase: true },
    fullName: { type: String, required: true, trim: true },
    name: { type: String, default: '', trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: '' },
    mobileNo: { type: String, default: '' },
    address: { type: String, default: '' },
    gender: { type: String, default: '' },
    designation: { type: String, default: '', trim: true },
    branchCode: { type: String, default: '', trim: true, uppercase: true },
    status: { type: String, default: 'Active', trim: true },
    avatarUrl: { type: String, default: '' },
    avatarFileId: { type: Schema.Types.ObjectId, ref: 'FileAsset', default: null },
    documents: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
    payload: { type: Schema.Types.Mixed, default: {} },
    passwordReset: { type: passwordResetSchema, default: () => ({}) }
  },
  schemaOptions()
);


module.exports = models.User || model('User', userSchema);

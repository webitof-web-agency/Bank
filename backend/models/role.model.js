const { Schema, model, models } = require('mongoose');
const { schemaOptions } = require('../utils/mongoose');

const roleSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    permissions: { type: [String], default: [] },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);


roleSchema.index({ name: 1 });

module.exports = models.Role || model('Role', roleSchema);

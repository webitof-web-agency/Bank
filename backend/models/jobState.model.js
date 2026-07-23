const { Schema, model, models } = require('mongoose');
const { schemaOptions } = require('../utils/mongoose');

const jobStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    lastRunAt: { type: Date, default: null },
    lastRunLabel: { type: String, default: '' },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

module.exports = models.JobState || model('JobState', jobStateSchema);

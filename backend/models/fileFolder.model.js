const { Schema, model, models } = require('mongoose');
const { schemaOptions } = require('../utils/mongoose');

const fileFolderSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    parentFolderId: { type: Schema.Types.ObjectId, ref: 'FileFolder', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

fileFolderSchema.index({ parentFolderId: 1, name: 1 }, { unique: true });

module.exports = models.FileFolder || model('FileFolder', fileFolderSchema);

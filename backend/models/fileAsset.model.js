const { Schema, model, models } = require('mongoose');
const { schemaOptions } = require('../utils/mongoose');

const fileAssetSchema = new Schema(
  {
    folderId: { type: Schema.Types.ObjectId, ref: 'FileFolder', default: null },
    moduleName: { type: String, default: 'general' },
    entityId: { type: String, default: '' },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    documentType: { type: String, default: '' },
    mimeType: { type: String, default: 'application/octet-stream' },
    sizeBytes: { type: Number, default: 0 },
    localPath: { type: String, required: true },
    isPublic: { type: Boolean, default: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

fileAssetSchema.index({ folderId: 1, archivedAt: 1 });
fileAssetSchema.index({ moduleName: 1, entityId: 1 });

module.exports = models.FileAsset || model('FileAsset', fileAssetSchema);

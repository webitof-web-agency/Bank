const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

module.exports = createSqlModel('file_assets', {
  schema: TABLE_SCHEMAS.file_assets,
  modelName: 'FileAsset'
});

const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

module.exports = createSqlModel('file_folders', {
  schema: TABLE_SCHEMAS.file_folders,
  modelName: 'FileFolder',
  uniqueFields: [['parentFolderId', 'name']]
});

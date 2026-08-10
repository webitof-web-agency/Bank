const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

module.exports = createSqlModel('settings', {
  schema: TABLE_SCHEMAS.settings,
  modelName: 'Settings',
  uniqueFields: ['key']
});

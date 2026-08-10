const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

module.exports = createSqlModel('roles', {
  schema: TABLE_SCHEMAS.roles,
  modelName: 'Role',
  uniqueFields: ['code']
});

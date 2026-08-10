const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

module.exports = createSqlModel('users', {
  schema: TABLE_SCHEMAS.users,
  modelName: 'User',
  omitFields: ['roles'],
  uniqueFields: ['code', 'username', 'email']
});

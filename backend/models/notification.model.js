const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

module.exports = createSqlModel('notifications', {
  schema: TABLE_SCHEMAS.notifications,
  modelName: 'Notification'
});

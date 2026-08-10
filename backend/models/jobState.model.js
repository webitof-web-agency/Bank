const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

module.exports = createSqlModel('job_states', {
  schema: TABLE_SCHEMAS.job_states,
  modelName: 'JobState',
  uniqueFields: ['key']
});

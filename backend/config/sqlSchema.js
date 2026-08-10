const { TABLE_SCHEMAS, getTableSchema } = require('./tableSchemas');

const TABLES = [...Object.keys(TABLE_SCHEMAS), 'user_roles'];

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function buildColumnSql(name, definition) {
  const meta = typeof definition === 'string' ? { type: definition } : definition || {};
  const columnName = quoteIdentifier(name);
  const type = String(meta.type || 'string').toLowerCase();

  if (name === 'id' || type === 'uuid') {
    return `${columnName} UUID NOT NULL`;
  }
  if (name === 'createdAt' || name === 'updatedAt') {
    return `${columnName} TIMESTAMPTZ NOT NULL`;
  }

  switch (type) {
    case 'boolean':
      return `${columnName} BOOLEAN NOT NULL DEFAULT FALSE`;
    case 'number':
      return `${columnName} DOUBLE PRECISION NULL DEFAULT NULL`;
    case 'date':
      return `${columnName} TIMESTAMPTZ NULL DEFAULT NULL`;
    case 'json':
      return `${columnName} JSONB NULL DEFAULT NULL`;
    case 'text':
      return `${columnName} TEXT NULL DEFAULT NULL`;
    case 'string':
    default: {
      const length = Math.max(1, Number(meta.length || 191));
      return `${columnName} VARCHAR(${length}) NULL DEFAULT NULL`;
    }
  }
}

function buildUniqueKeySql(tableName, uniqueFields = []) {
  return uniqueFields.map((fields) => {
    const list = Array.isArray(fields) ? fields : [fields];
    const keyName = `uniq_${tableName}_${list.join('_')}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63);
    const columns = list.map(quoteIdentifier).join(', ');
    return `CONSTRAINT ${quoteIdentifier(keyName)} UNIQUE (${columns})`;
  });
}

function buildCreateTableSql(tableName) {
  if (tableName === 'user_roles') {
    return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier('user_roles')} (
  ${quoteIdentifier('userId')} UUID NOT NULL,
  ${quoteIdentifier('roleId')} UUID NOT NULL,
  ${quoteIdentifier('createdAt')} TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (${quoteIdentifier('userId')}, ${quoteIdentifier('roleId')}),
  CONSTRAINT ${quoteIdentifier('fk_user_roles_user')} FOREIGN KEY (${quoteIdentifier('userId')}) REFERENCES ${quoteIdentifier('users')}(${quoteIdentifier('id')}) ON DELETE CASCADE,
  CONSTRAINT ${quoteIdentifier('fk_user_roles_role')} FOREIGN KEY (${quoteIdentifier('roleId')}) REFERENCES ${quoteIdentifier('roles')}(${quoteIdentifier('id')}) ON DELETE CASCADE
)`;
  }

  const schema = getTableSchema(tableName);
  const columns = [
    `  ${buildColumnSql('id', { type: 'uuid' })}`,
    `  ${buildColumnSql('createdAt', { type: 'date' })}`,
    `  ${buildColumnSql('updatedAt', { type: 'date' })}`,
    ...Object.entries(schema.fields).map(([fieldName, fieldDef]) => `  ${buildColumnSql(fieldName, fieldDef)}`)
  ];
  const keys = [
    `  PRIMARY KEY (${quoteIdentifier('id')})`,
    ...buildUniqueKeySql(tableName, schema.uniqueFields).map((keySql) => `  ${keySql}`)
  ];

  return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
${[...columns, ...keys].join(',\n')}
)`;
}

function getSchemaColumns(tableName) {
  if (tableName === 'user_roles') {
    return [
      { name: 'userId', definition: { type: 'uuid' } },
      { name: 'roleId', definition: { type: 'uuid' } },
      { name: 'createdAt', definition: { type: 'date' } }
    ];
  }

  const schema = getTableSchema(tableName);
  return [
    { name: 'id', definition: { type: 'uuid' } },
    { name: 'createdAt', definition: { type: 'date' } },
    { name: 'updatedAt', definition: { type: 'date' } },
    ...Object.entries(schema.fields).map(([name, definition]) => ({ name, definition }))
  ];
}

function buildAddColumnSql(tableName, columnNames = []) {
  const schemaMap = new Map(getSchemaColumns(tableName).map((column) => [column.name, column.definition]));
  const statements = [];

  for (const columnName of columnNames) {
    const definition = schemaMap.get(columnName);
    if (!definition) continue;
    statements.push(`ADD COLUMN IF NOT EXISTS ${buildColumnSql(columnName, definition)}`);
  }

  return statements.length ? `ALTER TABLE ${quoteIdentifier(tableName)}\n  ${statements.join(',\n  ')}` : null;
}

const CREATE_TABLE_SQL = TABLES.map((tableName) => buildCreateTableSql(tableName));
const CREATE_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS ${quoteIdentifier('idx_user_roles_userId')} ON ${quoteIdentifier('user_roles')} (${quoteIdentifier('userId')})`,
  `CREATE INDEX IF NOT EXISTS ${quoteIdentifier('idx_user_roles_roleId')} ON ${quoteIdentifier('user_roles')} (${quoteIdentifier('roleId')})`
];

module.exports = {
  CREATE_INDEX_SQL,
  CREATE_TABLE_SQL,
  TABLES,
  buildAddColumnSql,
  buildColumnSql,
  buildCreateTableSql,
  getSchemaColumns,
  getTableSchema,
  quoteIdentifier
};

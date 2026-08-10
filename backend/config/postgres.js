const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Client, Pool } = require('pg');
const {
  CREATE_TABLE_SQL,
  CREATE_INDEX_SQL,
  TABLES,
  buildAddColumnSql,
  getSchemaColumns,
  quoteIdentifier
} = require('./sqlSchema');

let pool = null;
let initPromise = null;
let initialized = false;
let embeddedInitPromise = null;
let embeddedProcess = null;
let embeddedConnection = null;
const tableCache = new Map();

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function shouldUseEmbedded() {
  return String(process.env.PG_EMBEDDED || 'true').trim().toLowerCase() !== 'false';
}

function getDatabaseName() {
  return process.env.PG_DATABASE || 'bank_app';
}

function getConnectionConfig(overrides = {}) {
  const base = embeddedConnection
    ? {
        host: embeddedConnection.host,
        port: embeddedConnection.port,
        user: embeddedConnection.user,
        password: embeddedConnection.password
      }
    : {
        host: process.env.PG_HOST || '127.0.0.1',
        port: Number(process.env.PG_PORT || 5432),
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || ''
      };

  return {
    ...base,
    database: getDatabaseName(),
    max: Number(process.env.PG_POOL_SIZE || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10000),
    ...(process.env.PG_SSL || '').toLowerCase() === 'true'
      ? { ssl: { rejectUnauthorized: false } }
      : {},
    ...overrides
  };
}

async function loadBinaryPaths() {
  if (process.platform !== 'win32') {
    throw new Error('Embedded PostgreSQL binaries are configured for Windows in this project.');
  }

  const mod = await import('@embedded-postgres/windows-x64');
  return {
    initdb: mod.initdb,
    postgres: mod.postgres
  };
}

function runProcess(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process failed (code: ${code}, signal: ${signal}).`));
      }
    });
  });
}
async function waitForServerReady(port, user, password, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const client = new Client({
      host: '127.0.0.1',
      port,
      user,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 1000
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return false;
}

async function ensureEmbeddedServer() {
  if (!shouldUseEmbedded()) {
    return null;
  }

  if (embeddedProcess) {
    return embeddedProcess;
  }

  if (embeddedInitPromise) {
    return embeddedInitPromise;
  }

  embeddedInitPromise = (async () => {
    const { initdb, postgres } = await loadBinaryPaths();
    const user = process.env.PG_USER || 'postgres';
    const password = process.env.PG_PASSWORD || 'postgres';
    const port = Number(process.env.PG_PORT || 5432);
    const databaseDir = process.env.PG_DATA_DIR || path.join(__dirname, '..', 'data', 'embedded-postgres');
    const persistent = String(process.env.PG_PERSISTENT || 'true').trim().toLowerCase() !== 'false';
    const pgVersionFile = path.join(databaseDir, 'PG_VERSION');

    await fs.mkdir(databaseDir, { recursive: true });

    let needsInit = false;
    try {
      await fs.access(pgVersionFile);
    } catch {
      needsInit = true;
    }

    if (needsInit) {
      const passwordFile = path.join(os.tmpdir(), `pg-password-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
      try {
        await fs.writeFile(passwordFile, `${password}\n`, 'utf8');
        await runProcess(initdb, [
          `--pgdata=${databaseDir}`,
          `--auth=${process.env.PG_AUTH_METHOD || 'password'}`,
          `--username=${user}`,
          `--pwfile=${passwordFile}`
        ]);
      } finally {
        await fs.unlink(passwordFile).catch(() => undefined);
      }
    }

    embeddedConnection = {
      host: '127.0.0.1',
      port,
      user,
      password
    };

    const child = spawn(postgres, ['-D', databaseDir, '-p', String(port)], {
      windowsHide: true,
      shell: false,
      stdio: 'inherit'
    });

    const started = await waitForServerReady(port, user, password, Number(process.env.PG_START_TIMEOUT_MS || 30000));
    if (!started) {
      throw new Error(`PostgreSQL did not become ready on port ${port}`);
    }

    embeddedProcess = child;
    embeddedProcess.once('exit', () => {
      embeddedProcess = null;
    });

    if (!persistent) {
      // Keep the data directory cleanup for shutdown.
      embeddedProcess.once('exit', () => {
        fs.rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
      });
    }

    return child;
  })();

  try {
    return await embeddedInitPromise;
  } finally {
    embeddedInitPromise = null;
  }
}

function ensureInitialized() {
  if (!initialized) {
    throw new Error('Database is not initialized yet. Call await initializeDatabase() first.');
  }
}

function normalizeMainRow(row) {
  if (!row) return null;

  const copy = clone(row);
  if (copy.id != null) copy.id = String(copy.id);
  if (copy.createdAt != null) copy.createdAt = String(copy.createdAt);
  if (copy.updatedAt != null) copy.updatedAt = String(copy.updatedAt);
  return copy;
}

function normalizeJoinRow(row) {
  if (!row) return null;

  const copy = clone(row);
  return {
    createdAt: copy.createdAt || null,
    roleId: copy.roleId == null ? null : String(copy.roleId),
    userId: copy.userId == null ? null : String(copy.userId)
  };
}

function getCachedRows(tableName) {
  ensureInitialized();
  return clone(tableCache.get(tableName) || []);
}

function setCachedRows(tableName, rows) {
  tableCache.set(tableName, clone(rows || []));
}

function updateCachedRow(tableName, row) {
  const rows = tableCache.get(tableName) || [];
  const next = clone(row);
  const index = rows.findIndex((item) => String(item.id) === String(next.id));
  if (index >= 0) {
    rows[index] = next;
  } else {
    rows.push(next);
  }
  tableCache.set(tableName, rows);
}

function removeCachedRow(tableName, id) {
  const rows = tableCache.get(tableName) || [];
  const next = rows.filter((item) => String(item.id) !== String(id));
  tableCache.set(tableName, next);
}

function getUserRoleRows() {
  ensureInitialized();
  return clone(tableCache.get('user_roles') || []);
}

function setUserRoleRows(rows) {
  tableCache.set('user_roles', clone(rows || []));
}

function serializeForColumn(definition, value) {
  const type = String(definition?.type || 'string').toLowerCase();
  if (value == null) {
    return null;
  }

  switch (type) {
    case 'boolean':
      return Boolean(value);
    case 'number': {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    case 'date':
      return value instanceof Date ? value.toISOString() : String(value);
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value);
    case 'text':
    case 'string':
    default:
      return String(value);
  }
}

async function getExistingColumns(database, tableName) {
  const result = await database.query(
    'SELECT column_name AS "columnName" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position ASC',
    [tableName]
  );
  return new Set(result.rows.map((row) => row.columnName));
}

async function syncTableSchema(database, tableName) {
  if (tableName === 'user_roles') {
    return;
  }

  const schemaColumns = getSchemaColumns(tableName);
  const existingColumns = await getExistingColumns(database, tableName);
  const missingColumns = schemaColumns
    .map((column) => column.name)
    .filter((columnName) => !existingColumns.has(columnName));

  if (missingColumns.length) {
    const statement = buildAddColumnSql(tableName, missingColumns);
    if (statement) {
      await database.query(statement);
    }
  }

  if (tableName === 'users' && existingColumns.has('phone') && !schemaColumns.some((column) => column.name === 'phone')) {
    await database.query(`ALTER TABLE ${quoteIdentifier(tableName)} DROP COLUMN IF EXISTS ${quoteIdentifier('phone')}`);
  }
}

async function loadCache(database) {
  tableCache.clear();

  for (const tableName of TABLES) {
    if (tableName === 'user_roles') {
      const result = await database.query(
        'SELECT "userId", "roleId", "createdAt" FROM user_roles ORDER BY "userId" ASC, "roleId" ASC'
      );
      setUserRoleRows(result.rows.map(normalizeJoinRow).filter(Boolean));
      continue;
    }

    const result = await database.query(
      `SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY ${quoteIdentifier('createdAt')} ASC, ${quoteIdentifier('id')} ASC`
    );
    setCachedRows(tableName, result.rows.map(normalizeMainRow).filter(Boolean));
  }
}

async function createPool() {
  if (pool) {
    return pool;
  }

  pool = new Pool(getConnectionConfig());
  return pool;
}

async function ensureDatabaseExists() {
  const databaseName = getDatabaseName();
  const client = new Client(getConnectionConfig({ database: 'postgres' }));
  await client.connect();

  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (!exists.rowCount) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    }
  } finally {
    await client.end();
  }
}

async function initializeDatabase() {
  if (initialized) {
    return pool;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (shouldUseEmbedded()) {
      await ensureEmbeddedServer();
    }

    await ensureDatabaseExists();
    const database = await createPool();

    for (const statement of CREATE_TABLE_SQL) {
      await database.query(statement);
    }
    for (const statement of CREATE_INDEX_SQL) {
      await database.query(statement);
    }

    for (const tableName of TABLES) {
      await syncTableSchema(database, tableName);
    }

    await loadCache(database);
    initialized = true;
    return database;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }

  if (embeddedProcess) {
    await new Promise((resolve) => {
      embeddedProcess.once('exit', resolve);
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(embeddedProcess.pid), '/f', '/t'], { windowsHide: true });
      } else {
        embeddedProcess.kill('SIGINT');
      }
    }).catch(() => undefined);
    embeddedProcess = null;
    embeddedConnection = null;
  }

  initPromise = null;
  embeddedInitPromise = null;
  initialized = false;
  tableCache.clear();
}

async function persistMainRow(tableName, row) {
  const database = await initializeDatabase();
  const payload = clone(row) || {};
  const columns = Object.keys(payload).filter((key) => payload[key] !== undefined);
  const values = columns.map((column) => payload[column]);
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`);

  if (!columns.includes('id')) {
    throw new Error(`persistMainRow requires an id column for ${tableName}`);
  }

  const statement = updates.length
    ? `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) ON CONFLICT (${quoteIdentifier('id')}) DO UPDATE SET ${updates.join(', ')}`
    : `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) ON CONFLICT (${quoteIdentifier('id')}) DO NOTHING`;

  await database.query(statement, values);
  updateCachedRow(tableName, payload);
  return payload;
}

async function deleteMainRow(tableName, id) {
  const database = await initializeDatabase();
  await database.query(`DELETE FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier('id')} = $1`, [String(id)]);
  removeCachedRow(tableName, id);

  if (tableName === 'users') {
    await database.query('DELETE FROM user_roles WHERE "userId" = $1', [String(id)]);
    setUserRoleRows(getUserRoleRows().filter((row) => String(row.userId) !== String(id)));
  }
}

async function replaceUserRoles(userId, roleIds = []) {
  const database = await initializeDatabase();
  const cleanedRoleIds = Array.isArray(roleIds)
    ? [...new Set(roleIds.map((value) => String(value)).filter(Boolean))]
    : [];
  const createdAt = new Date().toISOString();

  await database.query('DELETE FROM user_roles WHERE "userId" = $1', [String(userId)]);

  for (const roleId of cleanedRoleIds) {
    await database.query(
      'INSERT INTO user_roles ("userId", "roleId", "createdAt") VALUES ($1, $2, $3)',
      [String(userId), String(roleId), createdAt]
    );
  }

  const existing = getUserRoleRows().filter((row) => String(row.userId) !== String(userId));
  const nextRows = cleanedRoleIds.map((roleId) => ({
    createdAt,
    roleId: String(roleId),
    userId: String(userId)
  }));
  setUserRoleRows([...existing, ...nextRows]);
}

function getUserRoles(userId) {
  ensureInitialized();
  return getUserRoleRows()
    .filter((row) => String(row.userId) === String(userId))
    .sort((left, right) => String(left.roleId).localeCompare(String(right.roleId)))
    .map((row) => String(row.roleId));
}

function getUserRolesForUsers(userIds = []) {
  ensureInitialized();
  const map = new Map();
  const wanted = new Set(userIds.map((value) => String(value)));
  for (const row of getUserRoleRows()) {
    const userId = String(row.userId);
    if (!wanted.has(userId)) continue;
    if (!map.has(userId)) {
      map.set(userId, []);
    }
    map.get(userId).push(String(row.roleId));
  }

  for (const [userId, roles] of map.entries()) {
    map.set(userId, [...new Set(roles)].sort((left, right) => left.localeCompare(right)));
  }
  return map;
}

module.exports = {
  closeDatabase,
  deleteMainRow,
  getCachedRows,
  getUserRoles,
  getUserRolesForUsers,
  initializeDatabase,
  persistMainRow,
  replaceUserRoles
};





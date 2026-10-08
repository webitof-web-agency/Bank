const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
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
const { BANK_VOUCHER_KEYS } = require('./transactionConstants');
const { isSoftDeleteEnabled } = require('./tableSchemas');
const { getCurrentActorId } = require('../utils/requestContext');

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
  const osPlatform = os.platform();
  const osArch = os.arch();
  
  let modName;
  if (osPlatform === 'win32') {
    modName = '@embedded-postgres/windows-x64';
  } else if (osPlatform === 'linux') {
    modName = `@embedded-postgres/linux-${osArch}`;
  } else if (osPlatform === 'darwin') {
    modName = `@embedded-postgres/darwin-${osArch}`;
  } else {
    throw new Error(`Embedded PostgreSQL is not supported on platform: ${osPlatform} ${osArch}`);
  }

  const mod = await import(modName);
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
    let defaultDataDir = path.join(__dirname, '..', 'data', 'embedded-postgres');
    if (process.platform === 'linux' && __dirname.startsWith('/mnt/')) {
      defaultDataDir = path.join(os.homedir(), '.webitof-bank-embedded-postgres');
    }
    const databaseDir = process.env.PG_DATA_DIR || defaultDataDir;
    const persistent = String(process.env.PG_PERSISTENT || 'true').trim().toLowerCase() !== 'false';
    const pgVersionFile = path.join(databaseDir, 'PG_VERSION');

    await fs.mkdir(databaseDir, { recursive: true, mode: 0o700 });
    try {
      await fs.chmod(databaseDir, 0o700);
    } catch {
      // Ignore chmod errors if not supported
    }

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

  // These columns store signed file-view URLs (buildFileViewUrl()), which
  // include a JWT token and can exceed the varchar(255) they were originally
  // typed as ("value too long for type character varying(255)" on upload).
  // syncTableSchema only ever ADDS missing columns, never widens existing
  // ones, so this widens them explicitly for anyone whose DB predates T.text.
  const TEXT_WIDEN_COLUMNS = {
    users: ['avatarUrl'],
    societies: ['logoUrl', 'watermarkUrl'],
    members: ['photoUrl']
  };
  if (TEXT_WIDEN_COLUMNS[tableName]) {
    for (const columnName of TEXT_WIDEN_COLUMNS[tableName]) {
      if (!existingColumns.has(columnName)) continue;
      const typeResult = await database.query(
        `SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [tableName, columnName]
      );
      if (typeResult.rows[0] && typeResult.rows[0].data_type !== 'text') {
        await database.query(`ALTER TABLE ${quoteIdentifier(tableName)} ALTER COLUMN ${quoteIdentifier(columnName)} TYPE text`);
      }
    }
  }

  if (tableName === 'vouchers') {
    for (const columnName of ['status', 'reversalOf', 'reversedByUserId']) {
      if (existingColumns.has(columnName) && !schemaColumns.some((column) => column.name === columnName)) {
        await database.query(`ALTER TABLE ${quoteIdentifier(tableName)} DROP COLUMN IF EXISTS ${quoteIdentifier(columnName)}`);
      }
    }

    await database.query(
      `UPDATE ${quoteIdentifier(tableName)}
       SET ${quoteIdentifier('details')} = COALESCE(${quoteIdentifier('details')}, '{}'::jsonb)
         - 'fixedSettlement' - 'fromAccount' - 'toAccount' - 'fixedFrom' - 'fixedTo'
       WHERE LOWER(COALESCE(${quoteIdentifier('details')}->>'key', '')) = ANY($1::text[])
         AND (${quoteIdentifier('details')} ?| ARRAY['fixedSettlement', 'fromAccount', 'toAccount', 'fixedFrom', 'fixedTo'])`,
      [BANK_VOUCHER_KEYS]
    );
  }
}

async function readTableRows(database, tableName) {
  if (tableName === 'user_roles') {
    const result = await database.query(
      'SELECT "userId", "roleId", "createdAt" FROM user_roles ORDER BY "userId" ASC, "roleId" ASC'
    );
    return result.rows.map(normalizeJoinRow).filter(Boolean);
  }
  const result = await database.query(
    `SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY ${quoteIdentifier('createdAt')} ASC, ${quoteIdentifier('id')} ASC`
  );
  return result.rows.map(normalizeMainRow).filter(Boolean);
}

// Cache refreshes run one at a time, in commit order, each reading the
// database when its turn comes — so a refresh can never put back data older
// than what an earlier one already applied.
let refreshQueue = Promise.resolve();
function queueRefresh(task) {
  const run = refreshQueue.then(task, task);
  refreshQueue = run.catch(() => {});
  return run;
}

// Reloads `tables` (default: every table) in full. All of them are read
// first and only then swapped in, in one synchronous step: clearing the cache
// up front and refilling it table by table (seconds on the full data) left
// other requests meanwhile looking at empty tables — users and roles
// included, so they failed with "Missing permission" or saw empty lists.
async function loadCache(database, tables = TABLES) {
  return queueRefresh(async () => {
    const loaded = [];
    for (const tableName of tables) {
      loaded.push([tableName, await readTableRows(database, tableName)]);
    }
    for (const [tableName, rows] of loaded) {
      if (tableName === 'user_roles') setUserRoleRows(rows);
      else setCachedRows(tableName, rows);
    }
  });
}

// After a transaction: re-read only the rows it touched. Every write here
// stamps "updatedAt" (persistMainRow, soft delete / restore, the demand-link
// updates), so the rows updated since the transaction began are its own
// changes — plus, harmlessly, anything else committed meanwhile, which is
// current data too. A table it hard-DELETEd from, user_roles (no updatedAt)
// or a write whose table couldn't be told is reloaded in full instead.
async function refreshAfterTransaction(database, written, since) {
  const cached = new Set(TABLES);
  if (written.unknown) return loadCache(database);
  const full = [...written.tables].filter((table) => cached.has(table) && (written.deletes.has(table) || table === 'user_roles'));
  const partial = [...written.tables].filter((table) => cached.has(table) && !full.includes(table));
  return queueRefresh(async () => {
    const loaded = [];
    for (const tableName of full) loaded.push(['full', tableName, await readTableRows(database, tableName)]);
    for (const tableName of partial) {
      const result = await database.query(
        `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier('updatedAt')} >= $1 ORDER BY ${quoteIdentifier('createdAt')} ASC, ${quoteIdentifier('id')} ASC`,
        [since]
      );
      loaded.push(['rows', tableName, result.rows.map(normalizeMainRow).filter(Boolean)]);
    }
    for (const [kind, tableName, rows] of loaded) {
      if (kind === 'full') {
        if (tableName === 'user_roles') setUserRoleRows(rows);
        else setCachedRows(tableName, rows);
        continue;
      }
      const current = tableCache.get(tableName) || [];
      const indexById = new Map(current.map((row, index) => [String(row.id), index]));
      for (const row of rows) {
        const index = indexById.get(String(row.id));
        if (index === undefined) {
          indexById.set(String(row.id), current.length);
          current.push(row);
        } else {
          current[index] = row;
        }
      }
      tableCache.set(tableName, current);
    }
  });
}

// The table a statement writes, and whether it deletes rows outright:
// INSERT INTO / UPDATE / DELETE FROM "table". `undefined` for reads and
// transaction control; null when it writes but the table can't be told.
const WRITE_STATEMENT = /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/i;
const READ_OR_CONTROL = /^\s*(?:SELECT|WITH\s+\w+\s+AS\s*\(\s*SELECT|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET|SHOW)\b/i;

function writtenTable(text) {
  const sql = typeof text === 'string' ? text : String(text?.text || '');
  const match = sql.match(WRITE_STATEMENT);
  if (match) return { table: match[2], deletes: /^DELETE/i.test(match[1]) };
  return READ_OR_CONTROL.test(sql) ? undefined : null;
}

// The client handed to a transaction's callback: the real client, with
// query() noting which tables the transaction writes.
function recordingClient(client, written) {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'query') {
        return (text, ...rest) => {
          const write = writtenTable(text);
          if (write === null) written.unknown = true;
          else if (write) {
            written.tables.add(write.table);
            if (write.deletes) written.deletes.add(write.table);
          }
          return target.query(text, ...rest);
        };
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
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

// Writes one audit_log row. Called from persistMainRow/deleteMainRow/
// restoreMainRow below for every table whose schema has a `deletedAt` field
// (see isSoftDeleteEnabled in ./tableSchemas) — never called directly by
// application code. `changes` is `{before, after}`; before=null on CREATE,
// after=null on DELETE.
async function writeAuditLog(database, { tableName, recordId, action, changes }, tx = null) {
  const auditRow = {
    id: crypto.randomUUID(),
    tableName,
    recordId: String(recordId),
    action,
    actorUserId: getCurrentActorId(),
    changes: JSON.stringify(changes),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const columns = Object.keys(auditRow);
  await database.query(
    `INSERT INTO ${quoteIdentifier('audit_log')} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
    columns.map((column) => auditRow[column])
  );
  // Every read in the app goes through the in-memory tableCache (see
  // findAllRows in sql-model.js), not a live query — a raw INSERT like the
  // one above is invisible to any subsequent .find() on the AuditLog model
  // until this cache entry exists too (or the cache is fully reloaded, e.g.
  // after a transaction commits — see withTransaction below).
  if (!tx) {
    updateCachedRow('audit_log', auditRow);
  }
  return auditRow;
}

// `isNew`: the caller knows the row does not exist yet (created without an
// id), so the audit entry needs no "before" row and the lookup is skipped.
async function persistMainRow(tableName, row, tx = null, { isNew = false } = {}) {
  const database = tx || await initializeDatabase();
  const payload = clone(row) || {};
  const columns = Object.keys(payload).filter((key) => payload[key] !== undefined);
  const values = columns.map((column) => payload[column]);
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`);

  if (!columns.includes('id')) {
    throw new Error(`persistMainRow requires an id column for ${tableName}`);
  }

  const auditEnabled = isSoftDeleteEnabled(tableName) && tableName !== 'audit_log';
  let previous = null;
  if (auditEnabled && !isNew) {
    const existing = await database.query(
      `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier('id')} = $1`,
      [payload.id]
    );
    previous = existing.rows[0] || null;
  }

  const statement = updates.length
    ? `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) ON CONFLICT (${quoteIdentifier('id')}) DO UPDATE SET ${updates.join(', ')}`
    : `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) ON CONFLICT (${quoteIdentifier('id')}) DO NOTHING`;

  await database.query(statement, values);

  if (auditEnabled) {
    await writeAuditLog(database, {
      tableName,
      recordId: payload.id,
      action: previous ? 'UPDATE' : 'CREATE',
      changes: { before: previous, after: payload }
    }, tx);
  }

  if (!tx) {
    updateCachedRow(tableName, payload);
  }
  return payload;
}

// For soft-delete-enabled tables (see isSoftDeleteEnabled in ./tableSchemas),
// this marks the row deleted instead of removing it — the row, and its full
// history, always stays recoverable. Only tables without a `deletedAt` field
// (documents/images, and non-financial operational tables like notifications/
// job_states) still get a real DELETE here.
async function deleteMainRow(tableName, id, tx = null) {
  const database = tx || await initializeDatabase();

  if (isSoftDeleteEnabled(tableName)) {
    const existing = await database.query(
      `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier('id')} = $1`,
      [String(id)]
    );
    const previous = existing.rows[0] || null;
    if (!previous || previous.deletedAt) {
      // Already soft-deleted or never existed — nothing to do, matches the
      // no-op-on-missing-row semantics a real DELETE would have had.
      return;
    }

    const nowIso = new Date().toISOString();
    await database.query(
      `UPDATE ${quoteIdentifier(tableName)} SET ${quoteIdentifier('deletedAt')} = $1, ${quoteIdentifier('updatedAt')} = $1 WHERE ${quoteIdentifier('id')} = $2`,
      [nowIso, String(id)]
    );
    await writeAuditLog(database, {
      tableName,
      recordId: id,
      action: 'DELETE',
      changes: { before: previous, after: null }
    }, tx);

    if (!tx) {
      updateCachedRow(tableName, { ...previous, deletedAt: nowIso, updatedAt: nowIso });
    }
    return;
  }

  await database.query(`DELETE FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier('id')} = $1`, [String(id)]);
  if (!tx) {
    removeCachedRow(tableName, id);
  }

  if (tableName === 'users') {
    await database.query('DELETE FROM user_roles WHERE "userId" = $1', [String(id)]);
    if (!tx) {
      setUserRoleRows(getUserRoleRows().filter((row) => String(row.userId) !== String(id)));
    }
  }
}

// Un-deletes a row soft-deleted by deleteMainRow. No-op (returns null) if the
// row doesn't exist or isn't currently soft-deleted.
async function restoreMainRow(tableName, id, tx = null) {
  if (!isSoftDeleteEnabled(tableName)) {
    throw new Error(`restoreMainRow: ${tableName} is not soft-delete enabled`);
  }
  const database = tx || await initializeDatabase();

  const existing = await database.query(
    `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier('id')} = $1`,
    [String(id)]
  );
  const previous = existing.rows[0] || null;
  if (!previous || !previous.deletedAt) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const result = await database.query(
    `UPDATE ${quoteIdentifier(tableName)} SET ${quoteIdentifier('deletedAt')} = NULL, ${quoteIdentifier('updatedAt')} = $1 WHERE ${quoteIdentifier('id')} = $2 RETURNING *`,
    [nowIso, String(id)]
  );
  const restored = result.rows[0];

  await writeAuditLog(database, {
    tableName,
    recordId: id,
    action: 'RESTORE',
    changes: { before: previous, after: restored }
  }, tx);

  if (!tx) {
    updateCachedRow(tableName, restored);
  }
  return restored;
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

async function withTransaction(callback) {
  const database = await initializeDatabase();
  const client = await database.connect();
  let result;
  try {
    // Rows written in this transaction carry an "updatedAt" from now on; the
    // margin covers clock skew between this process and the database.
    const since = new Date(Date.now() - 5000).toISOString();
    await client.query('BEGIN');
    const written = { tables: new Set(), deletes: new Set(), unknown: false };
    result = await callback(recordingClient(client, written));
    await client.query('COMMIT');
    // Writes inside a transaction bypass the cache: refresh just the rows it
    // wrote instead of re-reading every table (several seconds on the full
    // data, the large legacy archives included).
    await refreshAfterTransaction(database, written, since);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return result;
}

// Where pg_dump connects for a backup: the same server and database as the app.
function getDumpConnection() {
  const { host, port, user, password, database } = getConnectionConfig();
  return { host, port, user, password, database };
}

module.exports = {
  closeDatabase,
  getDumpConnection,
  deleteMainRow,
  getCachedRows,
  getUserRoles,
  getUserRolesForUsers,
  initializeDatabase,
  persistMainRow,
  replaceUserRoles,
  restoreMainRow,
  withTransaction
};


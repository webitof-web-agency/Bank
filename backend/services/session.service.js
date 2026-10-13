// Logged-out sessions. Every login token carries a unique id (jti); logging
// out stores that id until the token would have expired anyway, and
// middlewares/auth.js refuses any token whose id is stored here. Kept in the
// database, so a logout holds across restarts and across several servers.
const { initializeDatabase } = require('../config/postgres');

let tableReady = null;

function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      const db = await initializeDatabase();
      await db.query(`CREATE TABLE IF NOT EXISTS revoked_sessions (
        jti varchar(64) PRIMARY KEY,
        "userId" varchar(40),
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz NOT NULL DEFAULT now()
      )`);
      return db;
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

// exp: the token's own expiry (seconds since epoch).
async function revokeSession({ jti, userId = null, exp }) {
  if (!jti) return;
  const db = await ensureTable();
  const expiresAt = new Date((Number(exp) || Math.floor(Date.now() / 1000) + 24 * 3600) * 1000);
  await db.query(
    `INSERT INTO revoked_sessions (jti, "userId", "expiresAt") VALUES ($1, $2, $3) ON CONFLICT (jti) DO NOTHING`,
    [String(jti), userId ? String(userId) : null, expiresAt]
  );
}

async function isSessionRevoked(jti) {
  if (!jti) return true;
  const db = await ensureTable();
  const result = await db.query('SELECT 1 FROM revoked_sessions WHERE jti = $1', [String(jti)]);
  return result.rowCount > 0;
}

// Rows for tokens that have expired are no longer needed.
async function purgeExpiredSessions() {
  const db = await ensureTable();
  await db.query('DELETE FROM revoked_sessions WHERE "expiresAt" < now()');
}

module.exports = {
  isSessionRevoked,
  purgeExpiredSessions,
  revokeSession
};

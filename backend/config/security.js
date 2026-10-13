const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:4173',
  'http://localhost:8001',
  'http://127.0.0.1:8001',
];

function cleanText(value = '') {
  return String(value || '').trim();
}

function splitList(value) {
  return cleanText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getJwtSecret() {
  const secret = cleanText(process.env.JWT_SECRET);
  if (!secret) {
    throw new Error('JWT_SECRET is missing in environment configuration.');
  }
  return secret;
}

function isStrongSecret(secret) {
  return cleanText(secret).length >= 24;
}

function getPasswordHashRounds() {
  const parsed = Number(process.env.PASSWORD_HASH_ROUNDS || 12);
  if (!Number.isFinite(parsed)) return 12;
  return Math.max(10, Math.min(14, Math.trunc(parsed)));
}

function getFileViewTokenExpiry() {
  return cleanText(process.env.FILE_VIEW_TOKEN_EXPIRES_IN || '2h');
}

function getCorsOrigins() {
  const configured = splitList(process.env.CORS_ORIGINS || process.env.FRONTEND_URL);
  const origins = configured.length ? configured : DEFAULT_CORS_ORIGINS.slice();

  if (process.env.NODE_ENV !== 'production') {
    for (const origin of DEFAULT_CORS_ORIGINS) {
      if (!origins.includes(origin)) {
        origins.push(origin);
      }
    }
  }

  return [...new Set(origins)];
}

function isOriginAllowed(origin, allowedOrigins = getCorsOrigins()) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

function buildCorsOptions() {
  const allowedOrigins = getCorsOrigins();

  return {
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-File-Access-Token'],
    exposedHeaders: ['Content-Disposition'],
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) {
        return callback(null, true);
      }
      return callback(null, false);
    }
  };
}

function validateSecurityConfig() {
  const secret = getJwtSecret();
  const weakSecret = !isStrongSecret(secret);

  if (weakSecret) {
    const message = 'JWT_SECRET should be at least 24 characters long for bank-grade security.';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.warn(`[security] ${message}`);
  }

  if (process.env.NODE_ENV === 'production') {
    // A production server must name its own frontend: the localhost defaults
    // would let any page served from the server's machine call the API.
    if (!splitList(process.env.CORS_ORIGINS || process.env.FRONTEND_URL).length) {
      throw new Error('Set CORS_ORIGINS (or FRONTEND_URL) to the frontend address, e.g. https://bank.example.com, in production.');
    }
    // Stored secrets (SMTP password, Drive token, storage keys) are encrypted with it.
    if (!cleanText(process.env.SETTINGS_ENCRYPTION_KEY)) {
      throw new Error('Set SETTINGS_ENCRYPTION_KEY (openssl rand -hex 32) in production.');
    }
    if (!process.env.TRUST_PROXY) {
      console.warn('[security] TRUST_PROXY is not set: behind a reverse proxy every client shares one rate limit. Set TRUST_PROXY=1 when behind nginx/a load balancer.');
    }
  }

  return {
    corsOrigins: getCorsOrigins(),
    fileViewTokenExpiresIn: getFileViewTokenExpiry(),
    jwtSecretStrong: !weakSecret,
    passwordHashRounds: getPasswordHashRounds()
  };
}

module.exports = {
  buildCorsOptions,
  getCorsOrigins,
  getFileViewTokenExpiry,
  getJwtSecret,
  getPasswordHashRounds,
  isOriginAllowed,
  isStrongSecret,
  validateSecurityConfig
};

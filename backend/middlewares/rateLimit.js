const buckets = new Map();

function cleanText(value = '') {
  return String(value || '').trim();
}

function toInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function purgeExpiredBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (!bucket || bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

setInterval(purgeExpiredBuckets, 15 * 60 * 1000).unref?.();

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 100,
  keyGenerator,
  message = 'Too many requests. Please try again later.'
} = {}) {
  const safeWindowMs = Math.max(1000, toInteger(windowMs, 15 * 60 * 1000));
  const safeMax = Math.max(1, toInteger(max, 100));

  return (req, res, next) => {
    const key = cleanText(typeof keyGenerator === 'function' ? keyGenerator(req) : `${req.ip || req.connection?.remoteAddress || 'unknown'}:${req.method}:${req.baseUrl || req.originalUrl}`);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + safeWindowMs
      });
      return next();
    }

    if (bucket.count >= safeMax) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message,
        retryAfter
      });
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    return next();
  };
}

const apiRateLimit = createRateLimiter({
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.API_RATE_LIMIT_MAX || 1200),
  message: 'Too many requests. Please slow down and try again.'
});

const authRateLimit = createRateLimiter({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  keyGenerator: (req) => `${req.ip || req.connection?.remoteAddress || 'unknown'}:${req.method}:${req.originalUrl}`,
  message: 'Too many authentication attempts. Please try again later.'
});

module.exports = {
  apiRateLimit,
  authRateLimit,
  createRateLimiter
};

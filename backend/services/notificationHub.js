const clients = new Map();

function normalizeUserId(userId) {
  return String(userId || '').trim();
}

function buildHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  };
}

function sendSse(res, payload = {}) {
  if (!res || res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function removeClient(userId, client) {
  const key = normalizeUserId(userId);
  const set = clients.get(key);
  if (!set) return;

  if (client?.keepAlive) {
    clearInterval(client.keepAlive);
  }

  set.delete(client);
  if (set.size === 0) {
    clients.delete(key);
  }
}

function registerNotificationStream(userId, res) {
  const key = normalizeUserId(userId);
  if (!key) return null;

  if (!clients.has(key)) {
    clients.set(key, new Set());
  }

  const client = { res, keepAlive: null };
  clients.get(key).add(client);

  Object.entries(buildHeaders()).forEach(([header, value]) => {
    res.setHeader(header, value);
  });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  client.keepAlive = setInterval(() => {
    if (res.writableEnded) {
      removeClient(key, client);
      return;
    }
    res.write(': ping\n\n');
  }, 25000);

  res.on('close', () => {
    removeClient(key, client);
  });

  res.on('error', () => {
    removeClient(key, client);
  });

  return client;
}

function emitNotificationChange(userId, payload = {}) {
  const key = normalizeUserId(userId);
  if (!key) return;

  const set = clients.get(key);
  if (!set?.size) return;

  for (const client of set) {
    sendSse(client.res, {
      type: 'notification:changed',
      timestamp: new Date().toISOString(),
      ...payload
    });
  }
}

module.exports = {
  emitNotificationChange,
  registerNotificationStream
};

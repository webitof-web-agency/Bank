const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const CACHE_PREFIX = 'bank-api-cache:v2';
const CACHE_TTL_MS = 15 * 60 * 1000;
const memoryCache = new Map();
const AUTH_TOKEN_KEYS = ['bank-auth-token', 'webitof-auth-token'];

function isBrowser() {
  return typeof window !== 'undefined';
}

function readStoredAuthToken() {
  if (!isBrowser()) return '';
  for (const key of AUTH_TOKEN_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }
  return '';
}

function appendFileAccessToken(url, token = '') {
  const safeUrl = String(url || '').trim();
  if (!safeUrl || safeUrl.includes('token=')) {
    return safeUrl;
  }

  const accessToken = String(token || readStoredAuthToken() || '').trim();
  if (!accessToken) {
    return safeUrl;
  }

  const separator = safeUrl.includes('?') ? '&' : '?';
  return `${safeUrl}${separator}token=${encodeURIComponent(accessToken)}`;
}

function getCacheKey(method, path, token) {
  return JSON.stringify({ method, path, token: token || '' });
}

function readStoredCache(key) {
  if (!isBrowser()) return null;
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry) return memoryEntry;

  try {
    const raw = window.sessionStorage.getItem(`${CACHE_PREFIX}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      window.sessionStorage.removeItem(`${CACHE_PREFIX}:${key}`);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredCache(key, value) {
  if (!isBrowser()) return;
  const entry = { timestamp: Date.now(), value };
  memoryCache.set(key, entry);
  try {
    window.sessionStorage.setItem(`${CACHE_PREFIX}:${key}`, JSON.stringify(entry));
  } catch {
    // Ignore storage issues.
  }
}

function invalidateStoredCache(prefix = '') {
  if (!isBrowser()) return;
  const storageKeys = [];
  for (let i = 0; i < window.sessionStorage.length; i += 1) {
    const key = window.sessionStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) storageKeys.push(key);
  }

  storageKeys.forEach((key) => {
    try {
      const payload = JSON.parse(key.slice(`${CACHE_PREFIX}:`.length));
      const matchesPrefix = !prefix || String(payload.path || '').startsWith(prefix) || String(prefix).startsWith(String(payload.path || ''));
      if (matchesPrefix) {
        window.sessionStorage.removeItem(key);
        memoryCache.delete(key.slice(`${CACHE_PREFIX}:`.length));
      }
    } catch {
      window.sessionStorage.removeItem(key);
    }
  });
}

async function parseResponse(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, message: text };
    }
  }

  if (!response.ok || data.success === false) {
    const error = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export async function request(path, { method = 'GET', body, token, headers = {}, formData = null, skipCache = false } = {}) {
  const cacheKey = getCacheKey(method, path, token);
  if (method === 'GET' && !skipCache) {
    const cached = readStoredCache(cacheKey);
    if (cached) return cached.value;
  }

  const init = {
    method,
    cache: skipCache ? 'no-store' : 'default',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  };

  let finalPath = path;
  if (isBrowser() && (path.startsWith('/banking/reports') || path.startsWith('/banking/transactions') || path.startsWith('/banking/dashboard'))) {
    try {
      const stored = window.localStorage.getItem('bank-active-fy');
      if (stored) {
        const fy = JSON.parse(stored);
        if (fy && fy.start && fy.end) {
          const separator = finalPath.includes('?') ? '&' : '?';
          if (!finalPath.includes('fyStart=')) {
            finalPath = `${finalPath}${separator}fyStart=${encodeURIComponent(fy.start)}&fyEnd=${encodeURIComponent(fy.end)}`;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (formData) {
    init.body = formData;
  } else if (body != null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${finalPath}`, init);
  const data = await parseResponse(response);

  if (method === 'GET' && !skipCache) {
    writeStoredCache(cacheKey, data);
  } else {
    invalidateStoredCache(finalPath.split('?')[0]);
  }

  return data;
}

function buildQuery(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value == null || value === '') return;
    params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return suffix;
}

export const api = {
  auth: {
    login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
    me: (token) => request('/auth/me', { token, skipCache: true }),
    forgotPassword: (payload) => request('/auth/forgot-password', { method: 'POST', body: payload }),
    resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', body: payload }),
    changePassword: (token, payload) => request('/auth/change-password', { method: 'POST', token, body: payload }),
    updateProfile: (token, payload) => request('/auth/profile', { method: 'PATCH', token, body: payload }),
    deleteAvatar: (token) => request('/auth/avatar', { method: 'DELETE', token })
  },
  users: {
    list: (token, search = '') => request(`/users${buildQuery({ search })}`, { token }),
    lookup: (token, search = '') => request(`/users/lookup${buildQuery({ search })}`, { token }),
    get: (token, id) => request(`/users/${id}`, { token }),
    create: (token, payload) => request('/users', { method: 'POST', token, body: payload }),
    update: (token, id, payload) => request(`/users/${id}`, { method: 'PUT', token, body: payload }),
    remove: (token, id) => request(`/users/${id}`, { method: 'DELETE', token })
  },
  roles: {
    list: (token, search = '') => request(`/roles${buildQuery({ search })}`, { token }),
    get: (token, id) => request(`/roles/${id}`, { token }),
    create: (token, payload) => request('/roles', { method: 'POST', token, body: payload }),
    update: (token, id, payload) => request(`/roles/${id}`, { method: 'PUT', token, body: payload }),
    remove: (token, id) => request(`/roles/${id}`, { method: 'DELETE', token })
  },
  notifications: {
    list: (token, query = {}) => request(`/notifications${buildQuery(query)}`, { token, skipCache: true }),
    get: (token, id) => request(`/notifications/${id}`, { token, skipCache: true }),
    unreadCount: (token) => request('/notifications/unread-count', { token, skipCache: true }),
    create: (token, payload) => request('/notifications', { method: 'POST', token, body: payload }),
    markRead: (token, id) => request(`/notifications/${id}/read`, { method: 'PATCH', token }),
    markAllRead: (token) => request('/notifications/read-all', { method: 'PATCH', token }),
    remove: (token, id) => request(`/notifications/${id}`, { method: 'DELETE', token }),
    streamUrl: (token) => `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token || '')}`
  },
  permissions: {
    list: (token) => request('/permissions/flat', { token }),
    catalog: (token) => request('/permissions', { token })
  },
  banking: {
    getMaster: (path, token) => request(`/banking${path}`, { token, skipCache: true }),
    updateMaster: (path, token, payload) => request(`/banking${path}`, { method: 'PUT', token, body: payload }),
    dashboard: (token) => request('/banking/dashboard', { token, skipCache: true }),
    getTransactionCatalog: (token) => request('/banking/transactions/catalog', { token, skipCache: true }),
    getLookups: (token) => request('/banking/lookups', { token, skipCache: true }),
    listTransactionVouchers: (token, query = {}) => request(`/banking/transactions/vouchers${buildQuery(query)}`, { token, skipCache: true }),
    getNextVoucherNo: (token, branchCode = '') => request(`/banking/transactions/vouchers/next?branchCode=${encodeURIComponent(branchCode)}`, { token, skipCache: true }),
    getTransactionVoucher: (token, id) => request(`/banking/transactions/vouchers/${id}`, { token, skipCache: true }),
    createTransactionVoucher: (token, payload) => request('/banking/transactions/vouchers', { method: 'POST', token, body: payload }),
    updateTransactionVoucher: (token, id, payload) => request(`/banking/transactions/vouchers/${id}`, { method: 'PUT', token, body: payload }),
    deleteTransactionVoucher: (token, id) => request(`/banking/transactions/vouchers/${id}`, { method: 'DELETE', token }),
    reverseTransactionVoucher: (token, id) => request(`/banking/transactions/vouchers/${id}/reverse`, { method: 'POST', token }),
    listBankTransactions: (token, query = {}) => request(`/banking/transactions/bank-transactions${buildQuery(query)}`, { token, skipCache: true }),
    reports: {
      memberLedger: (token, query = {}) => request(`/banking/reports/member-ledger${buildQuery(query)}`, { token, skipCache: true }),
      accountStatement: (token, query = {}) => request(`/banking/reports/account-statement${buildQuery(query)}`, { token, skipCache: true }),
      demandList: (token, query = {}) => request(`/banking/reports/demand-list${buildQuery(query)}`, { token, skipCache: true }),
      allMemberList: (token) => request('/banking/reports/all-member-list', { token, skipCache: true }),
      branchList: (token) => request('/banking/reports/branch-list', { token, skipCache: true }),
      dividendReport: (token, query = {}) => request(`/banking/reports/dividend-report${buildQuery(query)}`, { token, skipCache: true }),
      voucherSummary: (token, query = {}) => request(`/banking/reports/voucher-summary${buildQuery(query)}`, { token, skipCache: true }),
      paymentReceiptStatement: (token, query = {}) => request(`/banking/reports/payment-receipt-statement${buildQuery(query)}`, { token, skipCache: true }),
      monthlySummary: (token, query = {}) => request(`/banking/reports/monthly-summary${buildQuery(query)}`, { token, skipCache: true }),
      dayBook: (token, query = {}) => request(`/banking/reports/day-book${buildQuery(query)}`, { token, skipCache: true }),
      cashBook: (token, query = {}) => request(`/banking/reports/cash-book${buildQuery(query)}`, { token, skipCache: true }),
      trialBalance: (token, query = {}) => request(`/banking/reports/trial-balance${buildQuery(query)}`, { token, skipCache: true }),
      balanceSheet: (token, query = {}) => request(`/banking/reports/balance-sheet${buildQuery(query)}`, { token, skipCache: true }),
      profitLoss: (token, query = {}) => request(`/banking/reports/profit-loss${buildQuery(query)}`, { token, skipCache: true })
    }
  },
  settings: {
    get: (token) => request('/settings', { token, skipCache: true }),
    getPublic: () => request('/settings/public', { skipCache: true }),
    save: (token, payload) => request('/settings', { method: 'PUT', token, body: payload })
  },
  files: {
    list: (token, query = {}) => request(`/files${buildQuery(query)}`, { token, skipCache: true }),
    get: (token, id) => request(`/files/${id}`, { token }),
    upload: (token, formData) => request('/files/upload', { method: 'POST', token, formData }),
    archive: (token, id) => request(`/files/${id}/archive`, { method: 'PATCH', token }),
    remove: (token, id) => request(`/files/${id}`, { method: 'DELETE', token }),
    createFolder: (token, payload) => request('/files/folders', { method: 'POST', token, body: payload }),
    renameFolder: (token, folderId, name) => request(`/files/folders/${folderId}`, { method: 'PUT', token, body: { name } }),
    deleteFolder: (token, folderId) => request(`/files/folders/${folderId}`, { method: 'DELETE', token }),
    viewUrl: (id, token = readStoredAuthToken()) => appendFileAccessToken(`${API_BASE_URL}/files/${id}/view`, token)
  },
  resources: {
    list: (path, token, search = '', query = {}) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      Object.entries(query || {}).forEach(([key, value]) => {
        if (value == null || value === '') return;
        params.set(key, value);
      });
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request(`${path}${suffix}`, { token });
    },
    get: (path, id, token) => request(`${path}/${id}`, { token }),
    create: (path, payload, token) => request(path, { method: 'POST', body: payload, token }),
    update: (path, id, payload, token) => request(`${path}/${id}`, { method: 'PUT', body: payload, token }),
    remove: (path, id, token) => request(`${path}/${id}`, { method: 'DELETE', token })
  },
  cache: {
    invalidate: (prefix = '') => invalidateStoredCache(prefix),
    clear: () => invalidateStoredCache('')
  }
};

export { API_BASE_URL };

export function getImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/api')) {
    if (/^\/api\/files\/[^/]+\/view(?:\?.*)?$/i.test(url)) {
      return appendFileAccessToken(url);
    }
    const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;
    return `${base}${url}`;
  }
  return url;
}

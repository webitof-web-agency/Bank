// Where an uploaded file is stored (local uploads folder and Google Drive alike):
//   site/<file>                          society logo, watermark, branding
//   <year>/<mon>/<section>/<code>/<file> everything else, e.g. 2026/oct/recovery/2543/photo.png
// <code> is the record's unique code (member code, employee code, voucher
// number); left out when the upload is not tied to a record.
// The year and month are the upload date in India time.

const SITE_MODULES = new Set(['site', 'society', 'settings', 'branding']);

// Upload "module" sent by a page -> section folder.
const MODULE_FOLDERS = {
  members: 'member',
  member: 'member',
  employees: 'employee',
  employee: 'employee',
  users: 'employee',
  calendar: 'calendar'
};

// Transaction voucher type (catalog item key) -> section folder.
const TRANSACTION_FOLDERS = {
  'loan-paid-member': 'loan-paid',
  'deposit-paid-member': 'deposit-paid',
  'insurance-paid-member': 'insurance-paid',
  'ssa-paid-member': 'ssa-paid',
  'recovery-member': 'recovery',
  'advance-paid-emp': 'advance-paid',
  'advance-recovery-emp': 'advance-recovery',
  'interest-paid-member': 'interest-paid',
  'interest-recv-member': 'interest-received-member',
  'interest-recv-employee': 'interest-received-employee'
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isSiteModule(moduleName) {
  return SITE_MODULES.has(slug(moduleName));
}

// Section folder for a module, or for a transaction voucher type when known.
function sectionFolder(moduleName, voucherKey = '') {
  const key = slug(voucherKey);
  if (key) return TRANSACTION_FOLDERS[key] || key;
  const module = slug(moduleName);
  return MODULE_FOLDERS[module] || module || 'general';
}

function istYearMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return { year, month: MONTHS[month - 1] };
}

// A code as one safe folder name ("EMP-1000" stays, "A/B" -> "A-B").
function codeFolder(code) {
  return String(code ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '');
}

// storedName is the file's own (already unique) name.
function buildStorageKey({ moduleName = '', voucherKey = '', code = '', storedName, date = new Date() }) {
  if (isSiteModule(moduleName)) return `site/${storedName}`;
  const { year, month } = istYearMonth(date);
  const folder = codeFolder(code);
  return [year, month, sectionFolder(moduleName, voucherKey), folder, storedName].filter(Boolean).join('/');
}

module.exports = { buildStorageKey, isSiteModule, sectionFolder, istYearMonth };

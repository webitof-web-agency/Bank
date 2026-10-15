'use strict';

// Member / employee mobile-app portal (read-only): login by mobile + password,
// then FY-scoped summary + passbooks. It reuses the heavy lifting already in
// banking.service (buildMemberLedgerReport / buildEmployeeLedgerReport), which
// compute per-product running balances and interest exactly as the legacy
// desktop app did.

const { Branch, Member, Employee } = require('../models/banking.models');
const User = require('../models/user.model');
const bankingService = require('./banking.service');
const { comparePassword, signToken } = require('./auth.service');
const { getSettings } = require('./settings.service');
const { normalizeMobile, isValidMobile } = require('../utils/mobile');

// ---- Financial-year helpers (Indian FY: 1 Apr → 31 Mar) -------------------
const FIRST_FY_START_YEAR = 2021; // FY 2021-22 is the earliest archive we hold.

function currentFyStartYear(now = new Date()) {
  // Months are 0-based; April = 3.
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}
function fyLabel(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
function fyDates(startYear) {
  return { fyStart: `${startYear}-04-01`, fyEnd: `${startYear + 1}-03-31` };
}
function startYearFromLabel(label) {
  const n = Number(String(label || '').slice(0, 4));
  return Number.isFinite(n) ? n : null;
}
function yearOf(dateStr) {
  const n = Number(String(dateStr || '').slice(0, 4));
  return Number.isFinite(n) && n > 1900 ? n : null;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
function unauthorized(message = 'Invalid mobile number or password') {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

// ---- Product definitions per account type ---------------------------------
// Keys match the per-row buckets returned by the ledger reports.
const MEMBER_PRODUCTS = [
  { key: 'share', label: 'Share', nature: 'Cr' },
  { key: 'specialDeposit', label: 'Special Saving A/c', nature: 'Cr' },
  { key: 'compulsoryDeposit', label: 'Compulsory Deposit', nature: 'Cr' },
  { key: 'loan', label: 'Regular Loan', nature: 'Dr' },
  { key: 'loanAgainstDeposit', label: 'Loan Against Deposit', nature: 'Dr' }
];
const EMPLOYEE_PRODUCTS = [
  { key: 'housingLoan', label: 'Home Loan', nature: 'Dr' },
  { key: 'vehicleLoan', label: 'Vehicle Loan', nature: 'Dr' },
  { key: 'grainAdvance', label: 'Grain Advance', nature: 'Dr' }
];

function productsFor(type) {
  return type === 'employee' ? EMPLOYEE_PRODUCTS : MEMBER_PRODUCTS;
}

// ---- Authentication --------------------------------------------------------
async function login(mobileRaw, passwordRaw) {
  const mobile = normalizeMobile(mobileRaw);
  const password = String(passwordRaw || '');
  if (!isValidMobile(mobile)) throw badRequest('Enter a valid 10-digit mobile number');
  if (!password) throw badRequest('Password is required');

  // A member first (members table carries its own passwordHash), then an
  // employee (their login lives on the users table).
  // Stored numbers vary in shape ("+91 98…", "098…"), so match on the
  // normalized form. Two members can share a number: the first whose
  // password matches signs in.
  const members = (await Member.find({}).lean())
    .filter((row) => row.passwordHash && normalizeMobile(row.mobileNo) === mobile)
    .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  for (const member of members) {
    if (await comparePassword(password, member.passwordHash)) return issue('member', member.code, member.name);
  }

  const user = (await User.find({}).lean()).find((row) => row.passwordHash && normalizeMobile(row.mobileNo) === mobile);
  if (user && user.isActive !== false && (await comparePassword(password, user.passwordHash))) {
    // Resolve to the linked employee HR row for their account code.
    const empCode = user.employeeCode || user.code;
    return issue('employee', empCode, user.fullName || user.name);
  }

  throw unauthorized();
}

function issue(type, code, name) {
  const token = signToken({ scope: 'app', acct: type, sub: code, name: name || '' });
  return { token, account: { type, code, name: name || '' } };
}

async function resolveAccount(principal) {
  if (!principal || principal.scope !== 'app' || !principal.sub) throw unauthorized('Session expired');
  if (principal.acct === 'employee') {
    const employee = await Employee.findOne({ code: principal.sub }).lean();
    if (!employee) throw unauthorized('Account not found');
    return { type: 'employee', code: employee.code, record: employee };
  }
  const member = await Member.findOne({ code: principal.sub }).lean();
  if (!member) throw unauthorized('Account not found');
  return { type: 'member', code: member.code, record: member };
}

// ---- Financial years the account can view ---------------------------------
function financialYears(account) {
  const current = currentFyStartYear();
  const rec = account.record || {};
  // Lower bound: the FY the member/employee joined, if we know it; never
  // earlier than the archive start.
  const joinedYear = yearOf(rec.membershipDate || rec.appointmentDate || '');
  const startFrom = joinedYear && joinedYear > FIRST_FY_START_YEAR
    ? (new Date(rec.membershipDate || rec.appointmentDate).getMonth() >= 3 ? joinedYear : joinedYear - 1)
    : FIRST_FY_START_YEAR;
  // Upper bound: if they left, the FY they left in; else the current FY.
  const leftYear = yearOf(rec.dismemberedDate || rec.retirementDate || '');
  const endAt = leftYear ? Math.min(current, leftYear) : current;

  const years = [];
  for (let y = endAt; y >= startFrom; y -= 1) {
    years.push({ fy: fyLabel(y), startYear: y, current: y === current });
  }
  // Always expose at least the current FY.
  if (!years.length) years.push({ fy: fyLabel(current), startYear: current, current: true });
  return years;
}

// ---- Per-product summary + passbook ---------------------------------------
function cellOf(row, key) {
  const c = row && row[key];
  if (!c || typeof c !== 'object') return null;
  return {
    credit: Number(c.credit || 0),
    debit: Number(c.debit || 0),
    balance: Number(c.balance || 0),
    interest: Number(c.interest || 0)
  };
}

function summarizeProduct(rows, key) {
  let balance = 0;
  let interest = 0;
  let seen = false;
  for (const row of rows) {
    const c = cellOf(row, key);
    if (!c) continue;
    seen = true;
    balance = c.balance; // rows are chronological; last wins
    interest += c.interest;
  }
  return { balance, interest, seen };
}

function lastTransactionDate(rows) {
  let last = '';
  for (const row of rows) {
    if (row && row.isOpening) continue;
    if (row && row.date && row.date > last) last = row.date;
  }
  return last;
}

async function ledgerFor(account, startYear) {
  const { fyStart, fyEnd } = fyDates(startYear);
  if (account.type === 'employee') {
    const data = await bankingService.buildEmployeeLedgerReport({ employeeCode: account.code, dateFrom: fyStart, dateTo: fyEnd });
    return { data, rows: (data && data.rows) || [] };
  }
  const data = await bankingService.buildMemberLedgerReport({ memberCode: account.code, dateFrom: fyStart, dateTo: fyEnd });
  return { data, rows: (data && data.rows) || [] };
}

async function getSummary(account, startYear) {
  const { rows } = await ledgerFor(account, startYear);
  const products = productsFor(account.type).map((p) => {
    const { balance, interest } = summarizeProduct(rows, p.key);
    return { key: p.key, label: p.label, nature: p.nature, balance, interest };
  });
  return {
    fy: fyLabel(startYear),
    lastTransactionDate: lastTransactionDate(rows),
    products
  };
}

// Branch name ("SADAR BAZAR") for the profile; the code if it isn't found.
async function branchName(code) {
  if (!code) return '';
  const branch = await Branch.findOne({ code }).lean();
  return branch?.label || branch?.name || code;
}

async function getProfile(account) {
  const r = account.record || {};
  const branch = await branchName(r.branchCode);
  if (account.type === 'employee') {
    return {
      type: 'employee',
      name: r.name || '',
      code: r.code || '',
      mobileNo: normalizeMobile(r.mobileNo || ''),
      designation: r.designation || '',
      branchCode: r.branchCode || '',
      branchName: branch,
      fatherName: r.fatherName || '',
      dateOfBirth: r.dateOfBirth || '',
      appointmentDate: r.appointmentDate || '',
      address: r.address || ''
    };
  }
  return {
    type: 'member',
    name: r.name || '',
    code: r.code || '',
    mobileNo: normalizeMobile(r.mobileNo || ''),
    membershipNo: r.membershipNo || '',
    pfNo: r.pfNo || '',
    designation: r.designation || '',
    branchCode: r.branchCode || '',
    branchName: branch,
    fatherOrHusbandName: r.fatherOrHusbandName || '',
    dateOfBirth: r.dateOfBirth || '',
    membershipDate: r.membershipDate || '',
    category: r.category || '',
    address: r.address || '',
    status: r.status || ''
  };
}

async function getStatement(account, productKey, startYear) {
  const product = productsFor(account.type).find((p) => p.key === productKey);
  if (!product) throw badRequest('Unknown account/product');
  const { rows } = await ledgerFor(account, startYear);

  const lines = [];
  for (const row of rows) {
    const c = cellOf(row, productKey);
    if (!c) continue;
    const isOpening = Boolean(row.isOpening);
    // Keep the opening row and any row that actually moves this product.
    if (!isOpening && !c.credit && !c.debit) continue;
    lines.push({
      date: row.date || '',
      voucherNo: isOpening ? 'Opening Balance' : (row.voucherNo || ''),
      particular: row.particular || row.transType || (isOpening ? 'Opening Balance' : ''),
      credit: c.credit,
      debit: c.debit,
      balance: c.balance,
      nature: product.nature
    });
  }
  return { fy: fyLabel(startYear), product: { key: product.key, label: product.label, nature: product.nature }, lines };
}

// ---- Public app config (before login) -------------------------------------
// The society's identity from Settings -> Society Details and the theme
// colours from Settings -> Branding, so the app shows the same name, logo and
// colours as the web app. logoUrl is a signed path under /api (2h token): the
// app re-reads this on every launch.
async function getAppConfig() {
  const [society, settings] = await Promise.all([bankingService.getSingle('society'), getSettings()]);
  const branding = settings?.payload?.branding || {};
  const hex = (value, fallback) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim()) ? String(value).trim() : fallback);
  return {
    society: {
      name: society?.name || settings?.appName || '',
      shortName: society?.prefix || '',
      regNo: society?.regNo || '',
      place: society?.place || '',
      address: society?.address || '',
      email: society?.email || '',
      phone: society?.phone || '',
      logoUrl: society?.logoUrl || ''
    },
    theme: {
      primaryColor: hex(branding.primaryColor, '#1661F6'),
      accentColor: hex(branding.accentColor, '#1661F6'),
      sidebarBg: hex(branding.sidebarBg, '#090d16')
    }
  };
}

module.exports = {
  getAppConfig,
  login,
  resolveAccount,
  financialYears,
  getSummary,
  getProfile,
  getStatement,
  productsFor,
  fyLabel,
  startYearFromLabel,
  currentFyStartYear
};

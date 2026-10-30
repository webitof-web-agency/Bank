'use strict';

// Member / employee mobile-app portal (read-only): login by mobile + password,
// then FY-scoped summary + passbooks. It reuses the heavy lifting already in
// banking.service (buildMemberLedgerReport / buildEmployeeLedgerReport), which
// compute per-ledger running balances and interest exactly as the legacy
// desktop app did.

const { Branch, Member, Employee } = require('../models/banking.models');
const User = require('../models/user.model');
const bankingService = require('./banking.service');
const { comparePassword, hashPassword, signToken } = require('./auth.service');
const { getSettings } = require('./settings.service');
const { normalizeMobile, isValidMobile } = require('../utils/mobile');
const { createHash } = require('crypto');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');
const { isSessionRevoked } = require('./session.service');

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

// ---- Ledger definitions per account type --------------------------------
// Keys match the per-row buckets returned by the ledger reports.
const MEMBER_LEDGERS = [
  { key: 'share', label: 'Share', nature: 'Cr' },
  { key: 'specialDeposit', label: 'Special Saving A/c', nature: 'Cr' },
  { key: 'compulsoryDeposit', label: 'Compulsory Deposit', nature: 'Cr' },
  { key: 'loan', label: 'Regular Loan', nature: 'Dr' },
  { key: 'loanAgainstDeposit', label: 'Loan Against Deposit', nature: 'Dr' }
];
const EMPLOYEE_LEDGERS = [
  { key: 'housingLoan', label: 'Home Loan', nature: 'Dr' },
  { key: 'vehicleLoan', label: 'Vehicle Loan', nature: 'Dr' },
  { key: 'grainAdvance', label: 'Grain Advance', nature: 'Dr' }
];

function ledgersFor(type) {
  return type === 'employee' ? EMPLOYEE_LEDGERS : MEMBER_LEDGERS;
}

// ---- Authentication --------------------------------------------------------
// A dismembered (or Inactive / Exited) member can no longer sign in.
function isMemberActive(member = {}) {
  const status = String(member.status || '').trim().toLowerCase();
  return member.dismembered !== true && !status.startsWith('inact') && !status.startsWith('exit');
}

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
    .filter((row) => row.passwordHash && normalizeMobile(row.mobileNo) === mobile && isMemberActive(row))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  for (const member of members) {
    if (await comparePassword(password, member.passwordHash)) return issue('member', member.code, member.name, member.passwordHash);
  }

  // App access follows the employee record (on the rolls, not retired), not
  // the user's web-login switch: staff whose admin access is turned off
  // (isActive false / "Inactive") still see their own loans in the app.
  const user = (await User.find({}).lean()).find((row) => row.passwordHash && normalizeMobile(row.mobileNo) === mobile);
  if (user && (await comparePassword(password, user.passwordHash))) {
    const empCode = user.employeeCode || user.code;
    const employee = await Employee.findOne({ code: empCode }).lean();
    if (employee && employee.retired !== true) {
      return issue('employee', empCode, employee.name || user.fullName || user.name, user.passwordHash);
    }
  }

  throw unauthorized();
}

// pwv: a short fingerprint of the password hash the token was issued
// against. Changing or clearing the password changes it, which ends every
// session signed in with the old one.
function passwordVersion(hash) {
  return hash ? createHash('sha256').update(String(hash)).digest('hex').slice(0, 16) : '';
}

function issue(type, code, name, passwordHash) {
  const token = signToken({ scope: 'app', acct: type, sub: code, name: name || '', pwv: passwordVersion(passwordHash) });
  return { token, account: { type, code, name: name || '' } };
}

// The employee's login lives on the users table, keyed by employee code.
async function findEmployeeUser(code) {
  return (await User.find({}).lean()).find((row) => String(row.employeeCode || row.code || '') === String(code)) || null;
}

// Every /me request re-checks the account behind the token, so a retired
// employee, a deleted member or a changed/removed password loses access at
// once rather than when the token expires.
async function resolveAccount(principal) {
  if (!principal || principal.scope !== 'app' || !principal.sub || !principal.pwv) throw unauthorized('Session expired');
  if (principal.acct === 'employee') {
    const employee = await Employee.findOne({ code: principal.sub }).lean();
    if (!employee || employee.retired === true) throw unauthorized('Account not found');
    const user = await findEmployeeUser(employee.code);
    if (!user || passwordVersion(user.passwordHash) !== principal.pwv) throw unauthorized('Session expired');
    return { type: 'employee', code: employee.code, record: employee };
  }
  if (principal.acct !== 'member') throw unauthorized('Session expired');
  const member = await Member.findOne({ code: principal.sub }).lean();
  if (!member) throw unauthorized('Account not found');
  if (!isMemberActive(member)) throw unauthorized('This membership is inactive');
  if (passwordVersion(member.passwordHash) !== principal.pwv) throw unauthorized('Session expired');
  return { type: 'member', code: member.code, record: member };
}

// The signed-in member / employee changes their own password. A member's
// hash lives on the members row; an employee's on their users row, which is
// also their web login, so its stricter minimum applies. The new hash ends
// every other session (see passwordVersion); this device gets a fresh token.
async function changePassword(principal, currentPasswordRaw, newPasswordRaw) {
  const account = await resolveAccount(principal);
  const currentPassword = String(currentPasswordRaw || '');
  const newPassword = String(newPasswordRaw || '').trim();
  if (!currentPassword || !newPassword) throw badRequest('Current and new password are required');

  const minLength = account.type === 'employee' ? 8 : 4;
  if (newPassword.length < minLength) throw badRequest(`New password must be at least ${minLength} characters`);

  const lean = account.type === 'employee' ? await findEmployeeUser(account.code) : account.record;
  const doc = account.type === 'employee' ? await User.findById(lean._id || lean.id) : await Member.findById(lean._id || lean.id);
  if (!doc) throw unauthorized('Account not found');
  if (!(await comparePassword(currentPassword, doc.passwordHash))) throw badRequest('Current password is incorrect');
  if (await comparePassword(newPassword, doc.passwordHash)) throw badRequest('New password must be different from the current one');

  doc.passwordHash = await hashPassword(newPassword);
  if (account.type === 'employee') doc.passwordChangedAt = new Date();
  await doc.save();

  const name = account.record.name || doc.fullName || doc.name || '';
  return { message: 'Password changed successfully', ...issue(account.type, account.code, name, doc.passwordHash) };
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

// The requested FY, refused unless it is one the account can view.
function allowedStartYear(account, startYear) {
  const year = Number(startYear);
  if (!financialYears(account).some((row) => row.startYear === year)) throw badRequest('Financial year not available');
  return year;
}

// ---- Per-ledger summary + passbook ---------------------------------------
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

function summarizeLedger(rows, key) {
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
  const { fyStart, fyEnd } = fyDates(allowedStartYear(account, startYear));
  if (account.type === 'employee') {
    const data = await bankingService.buildEmployeeLedgerReport({ employeeCode: account.code, dateFrom: fyStart, dateTo: fyEnd });
    return { data, rows: (data && data.rows) || [] };
  }
  const data = await bankingService.buildMemberLedgerReport({ memberCode: account.code, dateFrom: fyStart, dateTo: fyEnd });
  return { data, rows: (data && data.rows) || [] };
}

async function getSummary(account, startYear) {
  const { rows } = await ledgerFor(account, startYear);
  const ledgers = ledgersFor(account.type).map((p) => {
    const { balance, interest } = summarizeLedger(rows, p.key);
    return { key: p.key, label: p.label, nature: p.nature, balance, interest };
  });
  return {
    fy: fyLabel(startYear),
    lastTransactionDate: lastTransactionDate(rows),
    ledgers
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

async function getStatement(account, ledgerKey, startYear) {
  const ledger = ledgersFor(account.type).find((p) => p.key === ledgerKey);
  if (!ledger) throw badRequest('Unknown ledger');
  const { rows } = await ledgerFor(account, startYear);

  const lines = [];
  for (const row of rows) {
    const c = cellOf(row, ledgerKey);
    if (!c) continue;
    const isOpening = Boolean(row.isOpening);
    // Keep the opening row and any row that actually moves this ledger.
    if (!isOpening && !c.credit && !c.debit) continue;
    lines.push({
      date: row.date || '',
      voucherNo: isOpening ? 'Opening Balance' : (row.voucherNo || ''),
      particular: row.particular || row.transType || (isOpening ? 'Opening Balance' : ''),
      credit: c.credit,
      debit: c.debit,
      balance: c.balance,
      nature: ledger.nature
    });
  }
  return { fy: fyLabel(startYear), ledger: { key: ledger.key, label: ledger.label, nature: ledger.nature }, lines };
}

// ---- Public app config (before login) -------------------------------------
// The society's identity from Settings -> Society Details and the theme
// colours from Settings -> Branding, so the app shows the same name, logo and
// colours as the web app. logoUrl is a signed path under /api (2h token): the
// app re-reads this on every launch.
function webAppUrl() {
  const first = String(process.env.WEB_APP_URL || process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '').split(',')[0].trim();
  return /^https?:\/\/[^\s/]+/i.test(first) ? first.replace(/\/+$/, '') : '';
}

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
    // The website (its ledger page opens in the app): WEB_APP_URL, else the
    // first allowed web origin.
    webUrl: webAppUrl(),
    theme: {
      primaryColor: hex(branding.primaryColor, '#1661F6'),
      accentColor: hex(branding.accentColor, '#1661F6'),
      sidebarBg: hex(branding.sidebarBg, '#090d16')
    }
  };
}

// ---- App update (public) ---------------------------------------------------
// The latest app release, set in Settings -> Mobile App (settings
// payload.appUpdate): the app compares its own version with this on launch
// and offers the APK at downloadUrl. Empty version = no update offered.
async function getAppVersion() {
  const settings = await getSettings();
  const update = settings?.payload?.appUpdate || {};
  const version = String(update.version || '').trim();
  const buildNumber = Number.parseInt(update.buildNumber, 10);
  return {
    version,
    buildNumber: Number.isFinite(buildNumber) ? buildNumber : null,
    downloadUrl: String(update.downloadUrl || '').trim(),
    notes: String(update.notes || '').trim(),
    force: update.force === true
  };
}

// ---- Ledger view (the website's ledger template, opened by the app) -------
// The app asks for a ticket with its own token; the ledger page (a website
// page shown in the app's web view) trades the ticket for the ledger. The
// ticket is short-lived, carries no app token, names one account and FY, and
// dies with the app session (revoked, or the password changed).
const LEDGER_TICKET_SCOPE = 'ledger-view';
const LEDGER_TICKET_TTL = '10m';

async function ledgerTicket(principal, startYear) {
  const account = await resolveAccount(principal);
  const year = allowedStartYear(account, startYear);
  const ticket = jwt.sign(
    { scope: LEDGER_TICKET_SCOPE, acct: account.type, sub: account.code, pwv: principal.pwv, sid: principal.jti || '', fy: year },
    getJwtSecret(),
    { expiresIn: LEDGER_TICKET_TTL }
  );
  return { ticket, fy: fyLabel(year) };
}

async function ledgerView(ticket) {
  let decoded;
  try {
    decoded = jwt.verify(String(ticket || ''), getJwtSecret(), { algorithms: ['HS256'] });
  } catch {
    throw unauthorized('This ledger link has expired. Open the ledger again from the app.');
  }
  if (decoded?.scope !== LEDGER_TICKET_SCOPE || !decoded.sid || await isSessionRevoked(decoded.sid)) {
    throw unauthorized('This ledger link has expired. Open the ledger again from the app.');
  }
  const account = await resolveAccount({ ...decoded, scope: 'app' });
  const { data } = await ledgerFor(account, decoded.fy);
  if (!data) throw unauthorized('Account not found');
  // The letterhead (name, address, logo, watermark) as the website prints it.
  const society = await bankingService.getSingle('society');
  return { type: account.type, fy: fyLabel(decoded.fy), ledger: data, society: society || {} };
}

module.exports = {
  ledgerTicket,
  ledgerView,
  getAppConfig,
  getAppVersion,
  login,
  changePassword,
  resolveAccount,
  financialYears,
  getSummary,
  getProfile,
  getStatement,
  ledgersFor,
  fyLabel,
  startYearFromLabel,
  currentFyStartYear
};

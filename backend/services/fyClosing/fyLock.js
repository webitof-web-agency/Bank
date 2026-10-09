// Which financial years are closed, and the lock that stops any accounting
// entry dated in one.
//
// The legacy software kept one SQL Server database per FY; every FY up to
// 2025-26 was closed there and lives here only as a read-only archive. This
// app keeps every year in one database, so closing a year (fyClosing.service)
// is what starting a new legacy database used to be: the year is locked and
// its balances and interest carried into the next.
const Settings = require('../../models/settings.model');

const STATE_KEY = 'financial_year_closings';
// The first FY kept in this app. Every earlier FY was closed in the legacy
// software (one database per year) and is always locked here.
const FIRST_APP_FY = '2026-27';
const FIRST_APP_FY_START = '2026-04-01';

function cleanText(value) {
  return String(value ?? '').trim();
}

// '2026-11-05' -> '2026-27'.
function fyOfDate(isoDate) {
  const date = cleanText(isoDate).slice(0, 10);
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

async function readState() {
  const doc = await Settings.findOne({ key: STATE_KEY }).lean();
  const payload = doc?.payload && typeof doc.payload === 'object' ? doc.payload : {};
  return { years: payload.years && typeof payload.years === 'object' ? payload.years : {} };
}

async function writeState(state) {
  await Settings.findOneAndUpdate({ key: STATE_KEY }, { $set: { key: STATE_KEY, payload: { years: state.years || {} } } }, { upsert: true, new: true });
}

// { locked, fy, reason } for an accounting date.
async function lockFor(isoDate, state = null) {
  const date = cleanText(isoDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { locked: false, fy: '', reason: '' };
  const fy = fyOfDate(date);
  if (date < FIRST_APP_FY_START) {
    return { locked: true, fy, reason: `FY ${fy} was closed in the old software and is read-only.` };
  }
  const years = (state || await readState()).years;
  if (years[fy]?.status === 'CLOSED') {
    return { locked: true, fy, reason: `FY ${fy} is closed. Reopen it (Settings -> Financial Year Closing) to change its entries.` };
  }
  return { locked: false, fy, reason: '' };
}

// Throws 409 when any of the dates falls in a closed FY. `options.allowFy`
// lets the year-end close post its own entries into the year it is closing.
async function assertDatesOpen(dates = [], { allowFy = '' } = {}) {
  const state = await readState();
  for (const date of dates) {
    if (!cleanText(date)) continue;
    const lock = await lockFor(date, state);
    if (lock.locked && lock.fy !== allowFy) {
      const error = new Error(lock.reason);
      error.statusCode = 409;
      error.code = 'FY_CLOSED';
      throw error;
    }
  }
}

module.exports = {
  FIRST_APP_FY,
  FIRST_APP_FY_START,
  STATE_KEY,
  assertDatesOpen,
  fyOfDate,
  lockFor,
  readState,
  writeState
};

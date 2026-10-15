// Dividend declared per financial year.
//
// Unlike the interest rates (utils/rateHistory.js), the dividend is not a rate
// that takes effect from a date: the society declares it for a whole FY, and
// does so a year late (the 2025-26 dividend is decided when 2026-27 closes).
// So it is kept as one rate per FY, set or corrected at any time, independent
// of the FY closing, and the Dividend Report for an FY uses that FY's rate.
//
// Shape (ratesConfig.dividendByFy): [{ fy: '2024-25', rate: 10, note, updatedAt }],
// one per FY, oldest first. A list, not an object keyed by FY: settings saves
// deep-merge objects (services/settings.service.js), so a removed FY would
// come back; a list is replaced whole.

const FY = /^(\d{4})-(\d{2})$/;

function cleanText(value) {
  return String(value ?? '').trim();
}

function isFy(value) {
  const match = FY.exec(cleanText(value));
  return Boolean(match) && (Number(match[1]) + 1) % 100 === Number(match[2]);
}

// '2026-11-05' -> '2026-27'.
function fyOfDate(isoDate) {
  const date = cleanText(isoDate).slice(0, 10);
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function fyEndDate(fy) {
  return `${Number(fy.slice(0, 4)) + 1}-03-31`;
}

function normalizeRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
}

function normalizeDividendByFy(value) {
  const byFy = new Map();
  for (const entry of Array.isArray(value) ? value : []) {
    const fy = cleanText(entry?.fy);
    const rate = normalizeRate(entry?.rate);
    if (!isFy(fy) || rate === null) continue;
    byFy.set(fy, { fy, rate, note: cleanText(entry?.note), updatedAt: cleanText(entry?.updatedAt) });
  }
  return [...byFy.values()].sort((a, b) => a.fy.localeCompare(b.fy));
}

// null when nothing has been declared for that FY.
function dividendRateFor(dividendByFy, fy) {
  const entry = (dividendByFy || []).find((item) => item.fy === fy);
  return entry ? entry.rate : null;
}

module.exports = { isFy, fyOfDate, fyEndDate, normalizeRate, normalizeDividendByFy, dividendRateFor };

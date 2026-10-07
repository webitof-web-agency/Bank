// Effective-dated interest rates.
//
// Interest rates are kept as a history of periods, each with the date it takes
// effect from. A report that accrues interest over a span uses the rate that
// was in force on each day of that span, so changing a rate today does not
// rewrite interest already shown for earlier periods.
//
// Period shape: { effectiveFrom: 'YYYY-MM-DD' | '', rates: { paid, receive }, note, recordedAt }
// An empty effectiveFrom marks the opening period, which applies from the
// beginning of time until the first dated change.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BEGINNING = '';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const INTEREST_RATE_KEYS = {
  paid: ['compulsoryDeposit', 'specialSaving', 'cashCredit', 'dividend'],
  receive: ['loan', 'loanAgainstDeposit', 'houseLoanStaff', 'vehicleLoanStaff']
};

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isIsoDate(value) {
  if (!ISO_DATE.test(String(value || ''))) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function todayIso(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

// Reports pass row dates that are usually 'YYYY-MM-DD' but can be full
// timestamps; comparisons against effectiveFrom only need the day.
function toDay(value) {
  return String(value || '').slice(0, 10);
}

function normalizeRates(rates = {}, fallback = {}) {
  const result = {};
  for (const [group, keys] of Object.entries(INTEREST_RATE_KEYS)) {
    result[group] = {};
    for (const key of keys) {
      result[group][key] = toNumber(rates?.[group]?.[key], toNumber(fallback?.[group]?.[key], 0));
    }
  }
  return result;
}

function sameRates(a = {}, b = {}) {
  return Object.entries(INTEREST_RATE_KEYS).every(([group, keys]) => (
    keys.every((key) => toNumber(a?.[group]?.[key]) === toNumber(b?.[group]?.[key]))
  ));
}

// Sorted, de-duplicated history. When nothing has been recorded yet, the
// single flat `fallbackRates` becomes the opening period, so data written
// before rate history existed keeps working unchanged.
function normalizeRateHistory(history, fallbackRates = {}) {
  const byDate = new Map();
  for (const entry of Array.isArray(history) ? history : []) {
    const effectiveFrom = entry?.effectiveFrom ? String(entry.effectiveFrom) : BEGINNING;
    if (effectiveFrom !== BEGINNING && !isIsoDate(effectiveFrom)) continue;
    byDate.set(effectiveFrom, {
      effectiveFrom,
      rates: normalizeRates(entry.rates, fallbackRates),
      note: String(entry.note || ''),
      recordedAt: String(entry.recordedAt || '')
    });
  }

  if (!byDate.size) {
    byDate.set(BEGINNING, { effectiveFrom: BEGINNING, rates: normalizeRates(fallbackRates), note: '', recordedAt: '' });
  }

  const sorted = [...byDate.values()].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  // The earliest period always covers everything before it.
  sorted[0] = { ...sorted[0], effectiveFrom: BEGINNING };
  return sorted;
}

function periodIndexOn(history, date) {
  const day = toDay(date);
  let index = 0;
  for (let i = 1; i < history.length; i += 1) {
    if (day && history[i].effectiveFrom <= day) index = i;
  }
  return index;
}

function ratesAsOf(history, date) {
  if (!history.length) return normalizeRates({});
  return history[periodIndexOn(history, date)].rates;
}

function rateAsOf(history, group, key, date) {
  return toNumber(ratesAsOf(history, date)?.[group]?.[key], 0);
}

// One rate head as [{ from, rate }], dropping periods where it didn't change.
function rateTimeline(history, group, key) {
  const timeline = [];
  for (const period of history) {
    const rate = toNumber(period.rates?.[group]?.[key], 0);
    if (!timeline.length) {
      timeline.push({ from: BEGINNING, rate });
    } else if (timeline[timeline.length - 1].rate !== rate) {
      timeline.push({ from: period.effectiveFrom, rate });
    }
  }
  return timeline.length ? timeline : [{ from: BEGINNING, rate: 0 }];
}

function daysBetween(fromDate, toDate) {
  return Math.max(0, Math.round((new Date(toDate) - new Date(fromDate)) / MS_PER_DAY));
}

// Simple interest (annual rate / 365 days) on `balance` held from `fromDate`
// to `toDate`, applying each rate only to the days it was in force. Returns
// the unrounded amount; callers round the same way they always have. With a
// single rate this is exactly balance * (rate / 100) * (days / 365).
function accrueInterest(balance, fromDate, toDate, timeline) {
  if (!fromDate || !toDate) return 0;
  const startIndex = periodIndexOnTimeline(timeline, toDay(fromDate));
  const end = toDay(toDate);
  // Rate changes that fall strictly inside the span split it.
  const changes = timeline.slice(startIndex + 1).filter((change) => change.from < end);
  let rate = timeline[startIndex].rate;
  if (!changes.length) {
    return balance * (rate / 100) * (daysBetween(fromDate, toDate) / 365);
  }
  let total = 0;
  let segmentStart = fromDate;
  for (const change of changes) {
    total += balance * (rate / 100) * (daysBetween(segmentStart, change.from) / 365);
    segmentStart = change.from;
    rate = change.rate;
  }
  return total + balance * (rate / 100) * (daysBetween(segmentStart, toDate) / 365);
}

function periodIndexOnTimeline(timeline, day) {
  let index = 0;
  for (let i = 1; i < timeline.length; i += 1) {
    if (timeline[i].from <= day) index = i;
  }
  return index;
}

// Records a rate change. `changes` may be partial ({ receive: { loan: 12 } });
// unchanged heads carry over from the period in force on `effectiveFrom`.
// Saving on a date that already has a period replaces that period. Returns the
// history unchanged when the rates already match what is in force that day.
function applyRateChange(history, { rates: changes = {}, effectiveFrom = BEGINNING, note = '', recordedAt = '' } = {}) {
  const date = effectiveFrom ? String(effectiveFrom) : BEGINNING;
  if (date !== BEGINNING && !isIsoDate(date)) {
    throw new Error(`Invalid effective-from date: ${effectiveFrom}`);
  }

  const existing = history.find((period) => period.effectiveFrom === date);
  const base = existing ? existing.rates : ratesAsOf(history, date);
  const rates = normalizeRates(mergeRates(base, changes), base);
  if (!existing && sameRates(rates, base)) return history;
  if (existing && sameRates(rates, existing.rates) && (!note || note === existing.note)) return history;

  const next = history.filter((period) => period.effectiveFrom !== date);
  next.push({ effectiveFrom: date, rates, note: String(note || existing?.note || ''), recordedAt: String(recordedAt || '') });
  return normalizeRateHistory(next);
}

function removeRatePeriod(history, effectiveFrom) {
  if (!effectiveFrom || effectiveFrom === BEGINNING) {
    throw new Error('The opening rate period cannot be removed');
  }
  if (!history.some((period) => period.effectiveFrom === effectiveFrom)) {
    throw new Error(`No rate period starts on ${effectiveFrom}`);
  }
  return normalizeRateHistory(history.filter((period) => period.effectiveFrom !== effectiveFrom));
}

function mergeRates(base = {}, changes = {}) {
  const result = {};
  for (const group of Object.keys(INTEREST_RATE_KEYS)) {
    result[group] = { ...(base[group] || {}), ...(changes?.[group] || {}) };
  }
  return result;
}

module.exports = {
  BEGINNING,
  INTEREST_RATE_KEYS,
  accrueInterest,
  applyRateChange,
  isIsoDate,
  normalizeRateHistory,
  normalizeRates,
  rateAsOf,
  rateTimeline,
  ratesAsOf,
  removeRatePeriod,
  sameRates,
  todayIso
};

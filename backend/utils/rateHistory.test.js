const test = require('node:test');
const assert = require('node:assert/strict');
const {
  accrueInterest,
  applyRateChange,
  normalizeRateHistory,
  rateAsOf,
  rateTimeline,
  removeRatePeriod
} = require('./rateHistory');

const BASE_RATES = {
  paid: { compulsoryDeposit: 7, specialSaving: 8, cashCredit: 0, dividend: 5 },
  receive: { loan: 10, loanAgainstDeposit: 9, houseLoanStaff: 9, vehicleLoanStaff: 7 }
};

function legacyFormula(balance, rate, fromDate, toDate) {
  const days = Math.max(0, Math.round((new Date(toDate) - new Date(fromDate)) / (24 * 60 * 60 * 1000)));
  return balance * (rate / 100) * (days / 365);
}

test('empty history falls back to the flat rates as the opening period', () => {
  const history = normalizeRateHistory(undefined, BASE_RATES);
  assert.equal(history.length, 1);
  assert.equal(history[0].effectiveFrom, '');
  assert.equal(rateAsOf(history, 'receive', 'loan', '2020-01-01'), 10);
  assert.equal(rateAsOf(history, 'receive', 'loan', ''), 10);
});

test('a dated change applies from that date onward only', () => {
  let history = normalizeRateHistory([], BASE_RATES);
  history = applyRateChange(history, { rates: { receive: { loan: 12 } }, effectiveFrom: '2026-10-01' });

  assert.equal(history.length, 2);
  assert.equal(rateAsOf(history, 'receive', 'loan', '2026-09-30'), 10);
  assert.equal(rateAsOf(history, 'receive', 'loan', '2026-10-01'), 12);
  assert.equal(rateAsOf(history, 'receive', 'loan', '2027-03-31'), 12);
  // Heads that weren't changed carry over.
  assert.equal(rateAsOf(history, 'paid', 'dividend', '2026-10-01'), 5);
});

test('single-rate accrual is identical to the pre-history formula', () => {
  const timeline = rateTimeline(normalizeRateHistory([], BASE_RATES), 'receive', 'loan');
  for (const [balance, from, to] of [[123457, '2025-04-01', '2025-09-17'], [99, '2024-02-28', '2024-03-01'], [5000000, '2025-01-01', '2026-01-01']]) {
    assert.equal(accrueInterest(balance, from, to, timeline), legacyFormula(balance, 10, from, to));
  }
});

test('accrual splits a span at the change date', () => {
  const history = applyRateChange(normalizeRateHistory([], BASE_RATES), { rates: { receive: { loan: 12 } }, effectiveFrom: '2026-10-01' });
  const timeline = rateTimeline(history, 'receive', 'loan');

  // 2026-09-01 -> 2026-10-01 is 30 days at 10%; -> 2026-10-31 is 30 more at 12%.
  const expected = 36500 * 0.10 * (30 / 365) + 36500 * 0.12 * (30 / 365);
  assert.equal(Math.round(accrueInterest(36500, '2026-09-01', '2026-10-31', timeline)), Math.round(expected));

  // Entirely before or after the change uses one rate.
  assert.equal(accrueInterest(36500, '2026-08-01', '2026-08-31', timeline), legacyFormula(36500, 10, '2026-08-01', '2026-08-31'));
  assert.equal(accrueInterest(36500, '2026-10-01', '2026-10-31', timeline), legacyFormula(36500, 12, '2026-10-01', '2026-10-31'));
  // A span ending exactly on the change date is all old rate.
  assert.equal(accrueInterest(36500, '2026-09-01', '2026-10-01', timeline), legacyFormula(36500, 10, '2026-09-01', '2026-10-01'));
});

test('accrual handles several changes inside one span', () => {
  let history = normalizeRateHistory([], BASE_RATES);
  history = applyRateChange(history, { rates: { receive: { loan: 12 } }, effectiveFrom: '2026-02-01' });
  history = applyRateChange(history, { rates: { receive: { loan: 8 } }, effectiveFrom: '2026-03-01' });
  const timeline = rateTimeline(history, 'receive', 'loan');

  const expected = 36500 * (0.10 * 31 + 0.12 * 28 + 0.08 * 31) / 365;
  assert.ok(Math.abs(accrueInterest(36500, '2026-01-01', '2026-04-01', timeline) - expected) < 1e-9);
});

test('timeline ignores periods where that head did not change', () => {
  let history = normalizeRateHistory([], BASE_RATES);
  history = applyRateChange(history, { rates: { paid: { dividend: 6 } }, effectiveFrom: '2026-04-01' });
  assert.deepEqual(rateTimeline(history, 'receive', 'loan'), [{ from: '', rate: 10 }]);
  assert.deepEqual(rateTimeline(history, 'paid', 'dividend'), [{ from: '', rate: 5 }, { from: '2026-04-01', rate: 6 }]);
});

test('saving the same rates creates no period; same date replaces', () => {
  const opening = normalizeRateHistory([], BASE_RATES);
  assert.equal(applyRateChange(opening, { rates: { receive: { loan: 10 } }, effectiveFrom: '2026-10-01' }), opening);

  let history = applyRateChange(opening, { rates: { receive: { loan: 12 } }, effectiveFrom: '2026-10-01' });
  history = applyRateChange(history, { rates: { receive: { loan: 11 } }, effectiveFrom: '2026-10-01' });
  assert.equal(history.length, 2);
  assert.equal(rateAsOf(history, 'receive', 'loan', '2026-12-01'), 11);
});

test('a back-dated change does not disturb later periods', () => {
  let history = normalizeRateHistory([], BASE_RATES);
  history = applyRateChange(history, { rates: { receive: { loan: 12 } }, effectiveFrom: '2026-10-01' });
  history = applyRateChange(history, { rates: { receive: { loan: 11 } }, effectiveFrom: '2026-06-01' });
  assert.deepEqual(history.map((p) => [p.effectiveFrom, p.rates.receive.loan]), [['', 10], ['2026-06-01', 11], ['2026-10-01', 12]]);
});

test('opening period can be corrected and cannot be removed', () => {
  let history = normalizeRateHistory([], BASE_RATES);
  history = applyRateChange(history, { rates: { receive: { loan: 9.5 } }, effectiveFrom: '' });
  assert.equal(history.length, 1);
  assert.equal(rateAsOf(history, 'receive', 'loan', '2000-01-01'), 9.5);
  assert.throws(() => removeRatePeriod(history, ''), /opening rate period/);
});

test('removing a period restores the earlier rate', () => {
  let history = applyRateChange(normalizeRateHistory([], BASE_RATES), { rates: { receive: { loan: 12 } }, effectiveFrom: '2026-10-01' });
  history = removeRatePeriod(history, '2026-10-01');
  assert.equal(history.length, 1);
  assert.equal(rateAsOf(history, 'receive', 'loan', '2027-01-01'), 10);
  assert.throws(() => removeRatePeriod(history, '2026-10-01'), /No rate period/);
});

test('invalid dates are rejected', () => {
  const history = normalizeRateHistory([], BASE_RATES);
  assert.throws(() => applyRateChange(history, { rates: { receive: { loan: 12 } }, effectiveFrom: '2026-02-30' }), /Invalid effective-from/);
  assert.throws(() => applyRateChange(history, { rates: { receive: { loan: 12 } }, effectiveFrom: '01/10/2026' }), /Invalid effective-from/);
});

test('timestamp-style row dates resolve by day', () => {
  const history = applyRateChange(normalizeRateHistory([], BASE_RATES), { rates: { receive: { loan: 12 } }, effectiveFrom: '2026-10-01' });
  assert.equal(rateAsOf(history, 'receive', 'loan', '2026-10-01T00:00:00.000Z'), 12);
  assert.equal(rateAsOf(history, 'receive', 'loan', '2026-09-30T23:00:00.000Z'), 10);
});

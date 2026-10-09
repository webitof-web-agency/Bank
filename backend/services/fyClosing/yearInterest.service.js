// Year-end interest for one FY, member by member and employee by employee,
// computed with the legacy algorithm (legacyInterest.js) over the app's own
// balance timelines (archived legacy rows, year-end carry-forwards and live
// vouchers).
const { Employee, Member, NoInterestMember, RecoveryLine, Voucher } = require('../../models/banking.models');
const { initializeDatabase } = require('../../config/postgres');
const banking = require('../banking.service');
const rateHistory = require('../../utils/rateHistory');
const { memberYearInterest, employeeYearInterest } = require('./legacyInterest');

const BUCKETS = { cd: 'compulsoryDeposit', ssa: 'specialDeposit', loan: 'loan', dloan: 'loanAgainstDeposit' };

function cleanText(value) {
  return String(value ?? '').trim();
}

const rupees = (paise) => Math.round(Number(paise || 0)) / 100;

// '2026-27' -> { fy, start: '2026-04-01', end: '2027-03-31' }.
function fyBounds(fy) {
  const match = /^(\d{4})-(\d{2})$/.exec(cleanText(fy));
  if (!match || (Number(match[1]) + 1) % 100 !== Number(match[2])) {
    const error = new Error(`Financial year must look like 2026-27 (got "${fy}").`);
    error.statusCode = 400;
    throw error;
  }
  const year = Number(match[1]);
  return { fy: cleanText(fy), start: `${year}-04-01`, end: `${year + 1}-03-31`, next: `${year + 1}-${String((year + 2) % 100).padStart(2, '0')}`, nextStart: `${year + 1}-04-01` };
}

// The signed balances (paise) a member opens `start` with: after every row
// before it (a carry-forward dated `start` is part of the opening, as in the
// member reports).
function openingAt(timeline, start) {
  const before = timeline.rows.filter((r) => r.date < start || (r.date === start && r.isCarryForward));
  const opening = {};
  for (const key of Object.values(BUCKETS).concat('share')) {
    if (before.length) opening[key] = before[before.length - 1][key].signed;
    else if (timeline.rows.length) {
      const first = timeline.rows[0][key];
      opening[key] = first.signed - (first.credit - first.debit);
    } else opening[key] = timeline.anchors[key] || 0;
  }
  return opening;
}

// The FY in the legacy `getledger 'MEMBER WISE'` row shape (rupees).
function legacyRowsForYear(timeline, start, end) {
  const opening = openingAt(timeline, start);
  const split = (amount) => ({ cr: amount > 0 ? amount : 0, dr: amount < 0 ? amount : 0 });
  const toRow = (dated, vchNo, vchType, amounts) => {
    const row = { dated, vchNo, vchType };
    for (const [short, key] of Object.entries(BUCKETS)) {
      const { cr, dr } = split(rupees(amounts[key]));
      row[`${short}Cr`] = cr;
      row[`${short}Dr`] = dr;
    }
    return row;
  };
  const rows = [toRow(start, 0, 'O', opening)];
  const inYear = timeline.rows.filter((r) => r.date >= start && r.date <= end && !(r.date === start && r.isCarryForward));
  inYear.forEach((r, i) => {
    const row = toRow(r.date, i + 1, 'V', Object.fromEntries(Object.values(BUCKETS).map((key) => [key, r[key].credit - r[key].debit])));
    // A legacy interest settlement voucher: its interest is counted as is.
    if (r.interestOnly) {
      for (const [short, key] of Object.entries(BUCKETS)) row[`${short}Int`] = r.interestOnly[key] || 0;
    }
    rows.push(row);
  });
  const closing = { ...opening };
  for (const r of inYear) for (const key of Object.keys(closing)) closing[key] += r[key].credit - r[key].debit;
  return { rows, opening, closing };
}

function isActiveMember(member) {
  return cleanText(member.status).toUpperCase() === 'ACTIVE' && !member.dismembered && !member.deletedAt;
}

async function noInterestMemberCodes() {
  const rows = await NoInterestMember.find({}).lean();
  return new Set(rows
    .filter((row) => cleanText(row.status).toUpperCase() !== 'INACTIVE')
    .map((row) => cleanText(row.memberCode).toUpperCase())
    .filter(Boolean));
}

async function memberRates(end) {
  const { interestRateHistory } = await banking.getGlobalRatesConfig();
  return {
    cd: rateHistory.rateAsOf(interestRateHistory, 'paid', 'compulsoryDeposit', end),
    ssa: rateHistory.rateAsOf(interestRateHistory, 'paid', 'specialSaving', end),
    loan: rateHistory.rateAsOf(interestRateHistory, 'receive', 'loan', end),
    dloan: rateHistory.rateAsOf(interestRateHistory, 'receive', 'loanAgainstDeposit', end),
    housing: rateHistory.rateAsOf(interestRateHistory, 'receive', 'houseLoanStaff', end),
    vehicle: rateHistory.rateAsOf(interestRateHistory, 'receive', 'vehicleLoanStaff', end)
  };
}

// Every member's FY interest. Interest is computed for members active at the
// close and not on the no-interest list (as legacy did); every member gets an
// opening/closing so the next FY's openings can be written for all.
// options.members / options.isEligible / options.noInterest let a check run
// it against an archived year.
async function computeMemberInterest(fy, options = {}) {
  const { start, end } = fyBounds(fy);
  const rates = options.rates || await memberRates(end);
  const members = options.members || await Member.find({}).lean();
  const noInterest = options.noInterest || await noInterestMemberCodes();
  const isEligible = options.isEligible || isActiveMember;
  const timelines = await banking.buildMemberBalanceTimelines(members);
  return members.map((member) => {
    const { rows, opening, closing } = legacyRowsForYear(timelines.get(member.code), start, end);
    const eligible = isEligible(member);
    const excluded = noInterest.has(cleanText(member.code).toUpperCase());
    const interest = eligible
      ? memberYearInterest(rows, rates, end, { noInterest: excluded })
      : { cd: 0, ssa: 0, loan: 0, dloan: 0 };
    return {
      memberCode: member.code,
      name: member.name,
      branchCode: member.branchCode,
      eligible,
      noInterest: eligible && excluded,
      interest,
      opening: Object.fromEntries(Object.entries(opening).map(([k, v]) => [k, rupees(v)])),
      closing: Object.fromEntries(Object.entries(closing).map(([k, v]) => [k, rupees(v)]))
    };
  });
}

const EMPLOYEE_BUCKETS = ['housingLoan', 'vehicleLoan', 'grainAdvance'];

// Each employee's opening on `start` (rupees, credit-positive: a loan owed is
// negative), from the archived FY openings (legacy years, and the openings
// every year-end close writes).
async function employeeOpenings(codes, start) {
  if (!codes.length) return new Map();
  const db = await initializeDatabase();
  const result = await db.query(
    'SELECT "employeeCode", "housingLoan", "vehicleLoan", "grainAdvance" FROM legacy_historical_employee_openings WHERE "fyStart" = $1 AND "employeeCode" = ANY($2)',
    [start, codes]
  );
  return new Map(result.rows.map((r) => [r.employeeCode, {
    housingLoan: Number(r.housingLoan || 0), vehicleLoan: Number(r.vehicleLoan || 0), grainAdvance: Number(r.grainAdvance || 0)
  }]));
}

// Every employee's FY interest (housing / vehicle loan), legacy algorithm,
// and the FY closing balances for the next FY's openings.
async function computeEmployeeInterest(fy, options = {}) {
  const { start, end } = fyBounds(fy);
  const rates = options.rates || await memberRates(end);
  const employees = options.employees || await Employee.find({}).lean();
  const openings = await employeeOpenings(employees.map((e) => e.code), start);
  const vouchers = await Voucher.find({}).sort({ date: 1, createdAt: 1 }).lean();
  const lines = await RecoveryLine.find({}).lean();
  const linesByVoucher = {};
  for (const line of lines) {
    const key = line.voucherId || line.voucherNo;
    (linesByVoucher[key] = linesByVoucher[key] || []).push(line);
  }
  const results = [];
  for (const employee of employees) {
    const historical = await banking.getHistoricalEmployeeLedgerRows(employee);
    const live = banking.liveEmployeeLedgerRows(employee, vouchers, linesByVoucher);
    // Credit-positive rupees, like the legacy view.
    const net = (cell) => (Number(cell.credit || 0) - Number(cell.debit || 0)) / 100;
    let opening = openings.get(employee.code);
    if (!opening) {
      // Not in the archive (an employee added after cutover): the stored
      // balances plus live movements before the FY.
      opening = {
        housingLoan: Number(employee.homeLoanBalance || 0),
        vehicleLoan: Number(employee.vehicleLoanBalance || 0),
        grainAdvance: Number(employee.grainAdvanceBalance || 0)
      };
      for (const row of live.filter((r) => r.date < start)) for (const key of EMPLOYEE_BUCKETS) opening[key] += net(row[key]);
    }
    const inYear = historical.concat(live).filter((r) => r.date >= start && r.date <= end)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const split = (amount) => ({ cr: amount > 0 ? amount : 0, dr: amount < 0 ? amount : 0 });
    const toRow = (dated, vchNo, vchType, h, v) => ({
      dated, vchNo, vchType,
      housingCr: split(h).cr, housingDr: split(h).dr, vehicleCr: split(v).cr, vehicleDr: split(v).dr
    });
    const rows = [toRow(start, 0, 'O', opening.housingLoan, opening.vehicleLoan)];
    const closing = { ...opening };
    inYear.forEach((r, i) => {
      const row = toRow(r.date, i + 1, 'V', net(r.housingLoan), net(r.vehicleLoan));
      // Interest Receive From Employee (legacy TransType 22): -amount.
      if (r.housingLoan.interestReceived) row.housingInt = -r.housingLoan.interestReceived / 100;
      if (r.vehicleLoan.interestReceived) row.vehicleInt = -r.vehicleLoan.interestReceived / 100;
      rows.push(row);
      for (const key of EMPLOYEE_BUCKETS) closing[key] += net(r[key]);
    });
    const round2 = (x) => Math.round(x * 100) / 100;
    results.push({
      employeeCode: employee.code,
      name: employee.name,
      interest: employeeYearInterest(rows, rates, end),
      // Interest received during the year (Interest Receive From Employee).
      received: round2(inYear.reduce((t, r) => t + (Number(r.housingLoan.interestReceived || 0) + Number(r.vehicleLoan.interestReceived || 0)) / 100, 0)),
      opening: Object.fromEntries(Object.entries(opening).map(([k, v]) => [k, round2(v)])),
      closing: Object.fromEntries(Object.entries(closing).map(([k, v]) => [k, round2(v)]))
    });
  }
  return results;
}

module.exports = {
  BUCKETS,
  EMPLOYEE_BUCKETS,
  computeEmployeeInterest,
  computeMemberInterest,
  employeeYearInterest,
  fyBounds,
  legacyRowsForYear,
  memberRates,
  openingAt
};

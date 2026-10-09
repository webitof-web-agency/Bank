// Year-end interest exactly as the legacy desktop app computed it
// (BankingSoft MainMDI.cs: GetMemberLedger / SaveEmpLedgerInterest, the
// figures it saved in MbrCBlnc / EmpCBlnc). Verified to the rupee against
// every member of FY 2024-25 (659) and 2025-26 (615), and every employee,
// with the interest run to 31 March.
//
// Input rows have the shape of the legacy `getledger` procedure output: an
// opening row (vchType 'O', dated 1 April, the opening balance in the Cr/Dr
// columns) followed by each movement, in date order. Amounts are rupees,
// signed credit-positive: a deposit credit or a loan repayment is positive,
// a payment out or a loan disbursed negative. Loan interest comes out
// negative (charged to the member), deposit interest positive.
//
// Not reproduced, on purpose: the legacy save loop wrote each member's
// total only when the next member's rows began, so the last member in its
// list (and any member missing from MbrCBlnc) got no interest at all.

// .NET Math.Round(x) / Math.Round(x, digits): banker's rounding, applied to
// an exact half only.
function roundHalfEven(value, digits = 0) {
  const factor = 10 ** digits;
  const x = value * factor;
  const floor = Math.floor(x);
  const r = x - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(x);
  return r / factor;
}

function dayDiff(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// new decimal(double) keeps 15 significant digits.
const toDecimal = (x) => Number(x.toPrecision(15));

function sumInterest(rows) {
  return rows.reduce((t, r) => ({
    cd: t.cd + Number(r.cdInt || 0),
    ssa: t.ssa + Number(r.ssaInt || 0),
    loan: t.loan + Number(r.loanInt || 0),
    dloan: t.dloan + Number(r.dloanInt || 0)
  }), { cd: 0, ssa: 0, loan: 0, dloan: 0 });
}

// rows: [{ dated, vchNo, vchType, cdCr, cdDr, ssaCr, ssaDr, loanCr, loanDr,
//          dloanCr, dloanDr, cdInt?, ssaInt?, loanInt?, dloanInt? }]
// rates: { cd, ssa, loan, dloan } in percent a year. tillDate: 'YYYY-MM-DD'.
// noInterest: the member is on the no-interest list (legacy EndIntrstCal).
// Returns { cd, ssa, loan, dloan } in whole rupees, legacy signs.
function memberYearInterest(inputRows, rates, tillDate, { noInterest = false } = {}) {
  const rows = inputRows.map((r) => ({ cdInt: 0, ssaInt: 0, loanInt: 0, dloanInt: 0, ...r }));
  if (!rows.length || noInterest) return sumInterest(rows);

  // `index` (the row the run-to-date interest lands on) and `date` are shared
  // across the four passes, as in the legacy code. Only totals matter here,
  // but the passes are kept identical so the rounding is too.
  let index = 0;
  let date = null;

  // Compulsory Deposit: only while the balance is positive; no 2dp step.
  {
    let balance = 0;
    rows.forEach((row, i) => {
      const moves = row.cdCr !== 0 || row.cdDr !== 0;
      if (balance > 0 && moves) row.cdInt = roundHalfEven((balance / 100) * rates.cd / 365 * dayDiff(date, row.dated));
      balance = toDecimal(balance + row.cdCr + row.cdDr);
      if (moves || i === 0) date = row.dated;
      if (Number(row.vchNo) > 0 && row.cdInt !== 0) index = i;
      if (i === rows.length - 1) {
        const v = (balance / 100) * rates.cd / 365 * dayDiff(date, tillDate);
        if (row.cdInt > 0 || v !== 0) rows[index].cdInt += roundHalfEven(v);
      }
    });
  }

  // Loan and Loan against Deposit: while the balance is non-zero; the daily
  // interest is rounded to 2 decimals first; charged (negative).
  const loanPass = (crKey, drKey, intKey, rate) => {
    let balance = 0;
    rows.forEach((row, i) => {
      const moves = row[crKey] !== 0 || row[drKey] !== 0;
      if (balance !== 0 && moves) {
        row[intKey] = 0 - roundHalfEven(roundHalfEven((balance / 100) * rate / 365, 2) * dayDiff(date, row.dated));
      }
      balance = toDecimal(balance + row[crKey] + row[drKey]);
      if (moves || i === 0) date = row.dated;
      if (Number(row.vchNo) > 0 && row[intKey] > 0) index = i;
      if (i === rows.length - 1) {
        const v = (balance / 100) * rate / 365 * dayDiff(date, tillDate);
        if (row[intKey] > 0 || v !== 0) rows[index][intKey] += roundHalfEven(0 - v);
      }
    });
  };
  loanPass('loanCr', 'loanDr', 'loanInt', rates.loan);
  loanPass('dloanCr', 'dloanDr', 'dloanInt', rates.dloan);

  // Special Saving: while the balance is non-zero, 2dp daily step, paid (positive).
  {
    let balance = 0;
    rows.forEach((row, i) => {
      const moves = row.ssaCr !== 0 || row.ssaDr !== 0;
      if (balance !== 0 && moves) {
        row.ssaInt = roundHalfEven(roundHalfEven((balance / 100) * rates.ssa / 365, 2) * dayDiff(date, row.dated));
      }
      balance = toDecimal(balance + row.ssaCr + row.ssaDr);
      if (moves || i === 0) date = row.dated;
      if (Number(row.vchNo) > 0 && row.ssaInt !== 0) index = i;
      if (i === rows.length - 1) {
        const v = (balance / 100) * rates.ssa / 365 * dayDiff(date, tillDate);
        if (row.ssaInt > 0 || v !== 0) rows[index].ssaInt += roundHalfEven(v);
      }
    });
  }

  return sumInterest(rows);
}

// Employees: housing loan (rate `housing`) and vehicle loan (rate `vehicle`).
// rows: [{ dated, vchNo, vchType, housingCr, housingDr, vehicleCr, vehicleDr }]
// Returns { housing, vehicle } in whole rupees, legacy signs. The legacy
// vehicle branch only accrues on a positive balance, so a vehicle loan
// (a negative balance) earns nothing there; kept as legacy has it.
function employeeYearInterest(inputRows, rates, tillDate) {
  const rows = inputRows.map((r) => ({ housingInt: 0, vehicleInt: 0, ...r }));
  let date = null;
  const pass = (crKey, drKey, intKey, rate, { positiveOnly, dailyStep, negate }) => {
    let balance = 0;
    let index = -1;
    let lastMove = null;
    rows.forEach((row, i) => {
      const moves = row[crKey] !== 0 || row[drKey] !== 0;
      const accrues = positiveOnly ? balance > 0 : balance !== 0;
      if (accrues && moves) {
        const days = dayDiff(lastMove, row.dated);
        const daily = (balance / 100) * rate / 365;
        const v = dailyStep ? roundHalfEven(daily, 2) * days : daily * days;
        row[intKey] = roundHalfEven(negate ? 0 - v : v);
      }
      balance = toDecimal(balance + row[crKey] + row[drKey]);
      if (moves || row.vchType === 'O') lastMove = row.dated;
      if (Number(row.vchNo) > 0 && (negate ? row[intKey] > 0 : row[intKey] !== 0)) { index = i; date = row.dated; }
    });
    if (index !== -1) {
      const v = (balance / 100) * rate / 365 * dayDiff(date, tillDate);
      rows[index][intKey] += roundHalfEven(negate ? 0 - v : v);
    }
  };
  pass('vehicleCr', 'vehicleDr', 'vehicleInt', rates.vehicle, { positiveOnly: true, dailyStep: false, negate: false });
  pass('housingCr', 'housingDr', 'housingInt', rates.housing, { positiveOnly: false, dailyStep: true, negate: true });
  return {
    housing: rows.reduce((t, r) => t + Number(r.housingInt || 0), 0),
    vehicle: rows.reduce((t, r) => t + Number(r.vehicleInt || 0), 0)
  };
}

module.exports = {
  employeeYearInterest,
  memberYearInterest,
  roundHalfEven
};

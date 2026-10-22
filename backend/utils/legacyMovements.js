// What one archived legacy voucher (legacy_historical_vouchers, by its
// TransType = voucherCategory) moves, as legacy's views count it. Shared by
// the reports (banking.service) and by editing / deleting an archived voucher
// (archivedVoucher.service), so both always agree.

function legacyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toPaise(value) {
  return Math.round(legacyNumber(value) * 100);
}

const MEMBER_BUCKETS = ['share', 'specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'];
const EMPLOYEE_GROUPS = ['housingLoan', 'vehicleLoan', 'grainAdvance'];

function emptyMovement(keys) {
  return Object.fromEntries(keys.map((key) => [key, { credit: 0, debit: 0 }]));
}

// A member's own voucher (Loan / Deposit / SSA Paid, Transfer Voucher Paid /
// Recover), paise. null for any other type: those don't move a member's
// principal (recovery moves it through its lines, interest vouchers 20/21
// only the interest).
function memberVoucherMovement(category, raw = {}) {
  const type = String(category);
  if (!['1', '2', '3', '14', '15'].includes(type)) return null;
  const m = emptyMovement(MEMBER_BUCKETS);
  if (type === '1') {
    m.loan.debit = toPaise(raw.RLoanAmt);
    m.loanAgainstDeposit.debit = toPaise(raw.DLoanAmt);
  } else if (type === '2') {
    m.compulsoryDeposit.debit = toPaise(raw.CDAmt);
  } else if (type === '3') {
    m.specialDeposit.debit = toPaise(raw.SSAamt);
  } else {
    const side = type === '14' ? 'debit' : 'credit';
    m.share[side] = toPaise(raw.ShareAmt);
    m.compulsoryDeposit[side] = toPaise(raw.CDAmt);
    m.specialDeposit[side] = toPaise(raw.SSAamt);
    m.loan[side] = toPaise(raw.RLoanAmt);
    m.loanAgainstDeposit[side] = toPaise(raw.DLoanAmt);
  }
  return m;
}

// One member's line of a Recovery From Member voucher (legacy EntTransData).
function recoveryLineMovement(line = {}) {
  const m = emptyMovement(MEMBER_BUCKETS);
  m.share.credit = toPaise(line.Share);
  m.specialDeposit.credit = toPaise(line.SSA);
  m.compulsoryDeposit.credit = toPaise(line.CD);
  m.loan.credit = toPaise(line.RLoan);
  m.loanAgainstDeposit.credit = toPaise(line.DLoan);
  return m;
}

// An employee's advance voucher (12 Paid, 13 Recovery, 22 Interest Receive),
// paise; interestReceived is printed in the Intrst column, not the balance.
// null for any other type.
function employeeVoucherMovement(category, raw = {}) {
  const type = String(category);
  if (!['12', '13', '22'].includes(type)) return null;
  const m = emptyMovement(EMPLOYEE_GROUPS);
  if (type === '12') {
    m.housingLoan.debit = toPaise(raw.HomeLoan);
    m.vehicleLoan.debit = toPaise(raw.VehicleLoan);
    m.grainAdvance.debit = toPaise(raw.GrainAdvance);
  } else if (type === '13') {
    m.housingLoan.credit = toPaise(raw.HomeLoan);
    m.vehicleLoan.credit = toPaise(raw.VehicleLoan);
    m.grainAdvance.credit = toPaise(raw.GrainAdvance);
  } else {
    m.grainAdvance.credit = toPaise(raw.GrainAdvance);
    m.housingLoan.interestReceived = toPaise(raw.HomeLoan);
    m.vehicleLoan.interestReceived = toPaise(raw.VehicleLoan);
  }
  return m;
}

// One EntTrans row -> [{ code, cr, dr, viaPayMode }] ledger entries (dr is
// negative), mirroring each UNION branch of legacy VwLedgerTransaction.
// viaPayMode marks the pay-mode side (cash / bank) of the voucher, which the
// legacy Cash Book leaves out of its particulars.
function legacyLedgerEntries(raw = {}, codeByAccId = new Map(), cashAccId = '') {
  const entries = [];
  const type = Number(raw.TransType);
  const isReceipt = String(raw.VoucherType).toUpperCase() === 'R';
  const isPayment = String(raw.VoucherType).toUpperCase() === 'P';
  const total = legacyNumber(raw.TotalAmt);
  const push = (code, cr, dr, viaPayMode = false) => {
    if (code && (cr || dr)) entries.push({ code, cr, dr, viaPayMode });
  };
  // "Normal" direction: receipt credits the account, payment debits it.
  const normal = (code, amount) => push(code, isReceipt ? amount : 0, isPayment ? -amount : 0);
  const codeOf = (accId) => codeByAccId.get(String(accId ?? '')) || '';

  // Cash pay mode: payment credits cash, receipt debits it.
  if (cashAccId && String(raw.PayModeAccID) === cashAccId) {
    push(codeOf(cashAccId), isPayment ? total : 0, isReceipt ? -total : 0, true);
  }
  const particular = codeOf(raw.ParticularAccID);
  if (particular && particular !== '2') normal(particular, total);
  if ([2, 20, 21, 22].includes(type)) normal(codeOf(raw.LedgerAccID), total);
  const payMode = codeOf(raw.PayModeAccID);
  if (legacyNumber(raw.PayModeAccID) > 0 && payMode && payMode !== '2') {
    push(payMode, isReceipt ? total : 0, isPayment ? -total : 0, true);
  }

  const component = (field, code, types) => {
    const amount = legacyNumber(raw[field]);
    if (amount !== 0 && types.includes(type)) normal(code, amount);
  };
  component('ShareAmt', '5', [5]);
  component('CDAmt', '6', [5]);
  component('SSAamt', '7', [5]);
  component('RLoanAmt', '8', [5]);
  component('DLoanAmt', '9', [5]);
  component('ShareAmt', '5', [14, 15]);
  component('CDAmt', '6', [14, 15]);
  component('SSAamt', '7', [14, 15, 1, 3]);
  component('RLoanAmt', '8', [14, 15, 1]);
  component('DLoanAmt', '9', [14, 15]);
  component('DLoanAmt', '9', [1]);
  component('AdmissionFee', '10', [5]);
  component('HomeLoan', '33', [12, 13]);
  component('VehicleLoan', '34', [12, 13]);
  component('GrainAdvance', '35', [12, 13]);
  return entries;
}

module.exports = {
  EMPLOYEE_GROUPS,
  MEMBER_BUCKETS,
  employeeVoucherMovement,
  legacyLedgerEntries,
  legacyNumber,
  memberVoucherMovement,
  recoveryLineMovement,
  toPaise
};

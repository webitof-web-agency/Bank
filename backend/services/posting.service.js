const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { Ledger } = require('../models/banking.models');

class PostingError extends Error {
  constructor(message, status = 'FAILURE') {
    super(message);
    this.name = 'PostingError';
    this.postingStatus = status;
    this.statusCode = 400;
  }
}

async function resolveLedgerId(role, tx) {
  const ledgers = await Ledger.find({ semanticRole: role }).tx(tx).exec();
  if (ledgers.length === 0) {
    throw new PostingError(`Missing ledger mapping for role: ${role}`, 'FAILURE');
  }
  if (ledgers.length > 1) {
    throw new PostingError(`Ambiguous ledger mapping. Multiple ledgers found for role: ${role}`, 'FAILURE');
  }
  return ledgers[0].id || ledgers[0]._id;
}

function normalizeTransactionType(voucher) {
  return voucher?.details?.key || null;
}

async function getPaymentLedger(voucher, tx) {
  return voucher?.details?.paymentLedgerId || await resolveLedgerId(ACCOUNTING_ROLES.CASH, tx);
}

// Interest Receive From Employee: the interest field, or the amount when it
// is the only figure entered; vehicle when the A/C says so, else housing.
function employeeInterestReceived(voucher = {}) {
  const interest = Number(voucher?.details?.interestAmount) || 0;
  return Number((interest > 0 ? interest : Number(voucher.amount) || 0).toFixed(2));
}

// Charged to the staff loan (mode Transfer, no payment ledger), not paid in cash.
function isEmployeeInterestCharged(voucher = {}) {
  if (voucher?.details?.paymentLedgerId) return false;
  return !/cash/i.test(String(voucher.mode || voucher?.details?.payMode || ''));
}

function isVehicleLoanInterest(voucher = {}) {
  return /vehicle/i.test(String(voucher?.details?.accountType || ''));
}

// The member heads a transfer voucher moves: every head, as legacy
// TransType 14 / 15 carry Share, CD, SSA, Loan and LAD alike. Legacy posts
// them one-sided (no cash leg); the other side is a companion voucher
// (Cheque Issue, Interest Received / Paid, or the opposite transfer), so here
// it goes to the Transfer Adjustment account, which those companions clear.
const TRANSFER_VOUCHER_ROLES = {
  share: ACCOUNTING_ROLES.SHARE,
  cd: ACCOUNTING_ROLES.COMPULSORY_DEPOSIT,
  ssa: ACCOUNTING_ROLES.SPECIAL_DEPOSIT,
  loan: ACCOUNTING_ROLES.REGULAR_LOAN,
  lad: ACCOUNTING_ROLES.LOAN_AGAINST_DEPOSIT
};

async function buildTransferVoucherLines(voucher, tx, kind) {
  const paid = kind === 'paid';
  const memberId = String(voucher.partyCode || '').trim().toUpperCase();
  if (!memberId) throw new PostingError('Select the member.', 'FAILURE');
  const lines = [];
  let totalPaise = 0;
  for (const row of Array.isArray(voucher?.details?.allocations) ? voucher.details.allocations : []) {
    const head = String(row?.head || row?.key || '').trim().toLowerCase();
    const paise = Math.round((Number(row?.amount) || 0) * 100);
    if (paise <= 0) continue;
    if (!TRANSFER_VOUCHER_ROLES[head]) throw new PostingError(`Unknown head ${row?.label || head}.`, 'FAILURE');
    const amount = paise / 100;
    lines.push({ ledgerId: await resolveLedgerId(TRANSFER_VOUCHER_ROLES[head], tx), dr: paid ? amount : 0, cr: paid ? 0 : amount, memberId });
    totalPaise += paise;
  }
  if (!totalPaise) throw new PostingError('Enter the amount for at least one head.', 'FAILURE');
  const total = totalPaise / 100;
  lines.push({ ledgerId: await resolveLedgerId(ACCOUNTING_ROLES.TRANSFER_ADJUSTMENT, tx), dr: paid ? 0 : total, cr: paid ? total : 0 });
  return lines;
}

// Transfer Voucher Payment / Receipt (legacy TransType 16 / 17): one ledger,
// debited by a Payment and credited by a Receipt, as legacy posts them; they
// pair into journals (Loan to Members Dr / Interest Received Cr at year end).
async function buildTransferLedgerLines(voucher, tx, kind) {
  const amount = Number((Number(voucher.amount) || 0).toFixed(2));
  if (!(amount > 0)) throw new PostingError('Enter the amount.', 'FAILURE');
  const code = String(voucher.partyCode || '').trim().toUpperCase();
  if (!code) throw new PostingError('Select the ledger.', 'FAILURE');
  const ledger = (await Ledger.find({ code }).tx(tx).exec())[0];
  if (!ledger) throw new PostingError(`Ledger ${code} was not found.`, 'FAILURE');
  const adjustmentId = await resolveLedgerId(ACCOUNTING_ROLES.TRANSFER_ADJUSTMENT, tx);
  const ledgerId = ledger.id || ledger._id;
  if (String(ledgerId) === String(adjustmentId)) throw new PostingError('Choose another ledger: this one is the Transfer Adjustment account itself.', 'FAILURE');
  const payment = kind === 'payment';
  return [
    { ledgerId, dr: payment ? amount : 0, cr: payment ? 0 : amount },
    { ledgerId: adjustmentId, dr: payment ? 0 : amount, cr: payment ? amount : 0 }
  ];
}

// Transfer (no cash) goes to the Transfer Adjustment account, as legacy posts
// such a voucher one-sided; Cash to the payment ledger (Cash-in-Hand).
// The same for a cheque / DD (Loan / Deposit / SSA Paid, Advance Paid,
// Recovery): legacy posted only the member's side (PayModeAccID 0) and the
// bank side as a separate Cheque Issue / Deposit in Bank, which clears it.
function isTransferMode(voucher = {}) {
  if (voucher?.details?.paymentLedgerId) return false;
  return !/cash/i.test(String(voucher.mode || voucher?.details?.payMode || ''));
}

async function getCounterLedger(voucher, tx) {
  return isTransferMode(voucher)
    ? resolveLedgerId(ACCOUNTING_ROLES.TRANSFER_ADJUSTMENT, tx)
    : getPaymentLedger(voucher, tx);
}

// Payment Voucher / Receipt Voucher (legacy TransType 18 / 19): one ledger
// (legacy's ParticularAccID), debited by a Payment and credited by a Receipt.
// Pay mode Cash-In-Hand: Cash-in-Hand takes the other side, as legacy posts it.
// Cheque: legacy posts it one-sided (PayModeAccID 0) and enters the bank side
// as a second voucher (a Cheque Issue on the Bank Saving A/c, or a Receipt
// Voucher from the bank), so here it goes to the Transfer Adjustment account.
async function buildGeneralVoucherLines(voucher, tx, kind) {
  const amount = Number((Number(voucher.amount) || 0).toFixed(2));
  if (!(amount > 0)) throw new PostingError('Enter the amount.', 'FAILURE');
  const code = String(voucher.partyCode || '').trim().toUpperCase();
  if (!code) throw new PostingError('Select the ledger.', 'FAILURE');
  const ledger = (await Ledger.find({ code }).tx(tx).exec())[0];
  if (!ledger) throw new PostingError(`Ledger ${code} was not found.`, 'FAILURE');
  const ledgerId = ledger.id || ledger._id;
  const counterId = await getCounterLedger(voucher, tx);
  if (String(ledgerId) === String(counterId)) throw new PostingError(`Choose another ledger: ${ledger.name} is the pay mode account itself.`, 'FAILURE');
  const payment = kind === 'payment';
  return [
    { ledgerId, dr: payment ? amount : 0, cr: payment ? 0 : amount },
    { ledgerId: counterId, dr: payment ? 0 : amount, cr: payment ? amount : 0 }
  ];
}

// Bank vouchers (legacy TransType 6-11, Bank Saving A/c 982 / Bank Cash
// Credit A/c 983), as legacy VwLedgerTransaction posts them: the bank ledger
// takes the voucher's direction (Receipt Cr, Payment Dr). The other side is
// Cash-in-Hand only where legacy carried a cash leg (a cash Deposit in Bank,
// a Cheque Issue for self use); everything else is one-sided in legacy, its
// other side a separate voucher (the Recovery a deposit banks, the Loan Paid /
// Payment Voucher a cheque pays, the CCA draw a deposit moves), so here the
// Transfer Adjustment account, which that voucher clears.
const BANK_ACCOUNT_ROLES = {
  // Deposit In: the form's account, old codes (L002 / L013) too.
  saving: ACCOUNTING_ROLES.BANK_SAVING,
  BANK_SAVING: ACCOUNTING_ROLES.BANK_SAVING,
  L013: ACCOUNTING_ROLES.BANK_SAVING,
  cc: ACCOUNTING_ROLES.BANK_CC,
  BANK_CC: ACCOUNTING_ROLES.BANK_CC,
  L002: ACCOUNTING_ROLES.BANK_CC
};

const BANK_VOUCHERS = {
  // 6 Loan Receive By CCA (Receipt): the society draws on its cash credit.
  'loan-recv-cash': { bank: () => ACCOUNTING_ROLES.BANK_CC, receipt: true },
  // 7 Loan Receive To SA (Payment): a loan received into the saving account.
  'loan-recv-saving': { bank: () => ACCOUNTING_ROLES.BANK_SAVING, receipt: false },
  // 8 Deposit In Bank (Payment): into Saving or Cash Credit; cash has its leg.
  'deposit-in-bank': {
    bank: (voucher) => BANK_ACCOUNT_ROLES[String(voucher?.details?.depositIn || 'BANK_SAVING').trim()] || null,
    receipt: false,
    cash: (voucher) => /cash/i.test(String(voucher?.details?.depositBy || ''))
  },
  // 9 Cheque Issue By SA (Receipt): a cheque from savings; self use = cash
  // withdrawn (legacy: Cash-In-Hand as its pay mode).
  'cheque-issue-saving': { bank: () => ACCOUNTING_ROLES.BANK_SAVING, receipt: true, cash: (voucher) => voucher?.details?.selfUse === true },
  // 10 Amount Transfer By SA (Receipt): money out of savings.
  'transfer-saving': { bank: () => ACCOUNTING_ROLES.BANK_SAVING, receipt: true },
  // 11 Amount Transfer To CCA (Payment): paid into the cash credit.
  'transfer-cashcredit': { bank: () => ACCOUNTING_ROLES.BANK_CC, receipt: false }
};

async function buildBankVoucherLines(voucher, tx) {
  const rule = BANK_VOUCHERS[voucher?.details?.key];
  const amount = Number((Number(voucher.amount) || 0).toFixed(2));
  if (!(amount > 0)) throw new PostingError('Enter the amount.', 'FAILURE');
  const role = rule.bank(voucher);
  if (!role) throw new PostingError('Choose the bank account (Saving A/c or Cash Credit A/c).', 'FAILURE');
  const bankId = await resolveLedgerId(role, tx);
  const otherId = rule.cash && rule.cash(voucher)
    ? await resolveLedgerId(ACCOUNTING_ROLES.CASH, tx)
    : await resolveLedgerId(ACCOUNTING_ROLES.TRANSFER_ADJUSTMENT, tx);
  return [
    { ledgerId: bankId, dr: rule.receipt ? 0 : amount, cr: rule.receipt ? amount : 0 },
    { ledgerId: otherId, dr: rule.receipt ? amount : 0, cr: rule.receipt ? 0 : amount }
  ];
}

// Member interest vouchers (legacy TransType 20 / 21): the A/C picks the
// head and its interest ledger, by name as the migrated ledgers carry them.
const MEMBER_INTEREST_HEADS = {
  'interest-paid-member': [
    { match: /saving|ssa|s\.s\.a/i, head: 'specialDeposit', ledger: /intre?s?t\s*paid.*s\.?\s*s\.?\s*a/i, label: 'Intrest Paid (Members S.S.A.)' },
    { match: /./, head: 'compulsoryDeposit', ledger: /intre?s?t\s*paid.*compulsory/i, label: 'Intrest Paid (Member Compulsory Deposit)' }
  ],
  'interest-recv-member': [
    { match: /deposit/i, head: 'loanAgainstDeposit', ledger: /intre?s?t\s*rec\w*.*deposit\s*loan/i, label: 'Intrest Received (Members Deposit Loan)' },
    { match: /./, head: 'loan', ledger: /intre?s?t\s*rec\w*.*members\s*loan/i, label: 'Intrest Received (Members Loan)' }
  ]
};

// Which head a member interest voucher moves ('compulsoryDeposit',
// 'specialDeposit', 'loan' or 'loanAgainstDeposit'); null for other vouchers.
function memberInterestHead(voucher = {}) {
  const heads = MEMBER_INTEREST_HEADS[voucher?.details?.key];
  if (!heads) return null;
  return heads.find((entry) => entry.match.test(String(voucher?.details?.accountType || ''))) || null;
}

async function buildMemberInterestLines(voucher, tx) {
  const head = memberInterestHead(voucher);
  const amount = employeeInterestReceived(voucher);
  if (!(amount > 0)) throw new PostingError('Enter the interest amount.', 'FAILURE');
  const memberId = String(voucher.partyCode || '').trim().toUpperCase();
  if (!memberId) throw new PostingError('Select the member.', 'FAILURE');
  const interestLedger = (await Ledger.find({}).tx(tx).exec()).find((ledger) => head.ledger.test(String(ledger.name || '')));
  if (!interestLedger) throw new PostingError(`No "${head.label}" ledger was found.`, 'FAILURE');
  const counterId = await getCounterLedger(voucher, tx);
  const paid = voucher.details.key === 'interest-paid-member';
  // Paid: the interest expense Dr. Received: the interest income Cr.
  return [
    { ledgerId: interestLedger.id || interestLedger._id, dr: paid ? amount : 0, cr: paid ? 0 : amount, memberId },
    { ledgerId: counterId, dr: paid ? 0 : amount, cr: paid ? amount : 0 }
  ];
}

const POSTING_REGISTRY = {
  // Regular Loan and Loan Against Deposit go to their own ledgers, as legacy
  // posts TransType 1 (RLoanAmt -> Loan to Members, DLoanAmt -> Loan against
  // Deposit). A voucher with no split (amount only) is all Regular Loan.
  'loan-paid-member': {
    status: 'PROVEN',
    build: async (voucher, { tx }) => {
      const components = voucher?.details?.components || {};
      const hasSplit = components.loanAmt != null || components.lad != null;
      const loanPaise = Math.round((hasSplit ? Number(components.loanAmt) || 0 : Number(voucher.amount) || 0) * 100);
      const ladPaise = Math.round((hasSplit ? Number(components.lad) || 0 : 0) * 100);
      if (hasSplit && loanPaise + ladPaise !== Math.round((Number(voucher.amount) || 0) * 100)) {
        throw new PostingError('Total Amount must equal Regular Loan Amount + Loan Against Deposit Amount.', 'FAILURE');
      }
      const paymentLedgerId = await getCounterLedger(voucher, tx);
      const lines = [];
      if (loanPaise > 0) lines.push({ ledgerId: await resolveLedgerId(ACCOUNTING_ROLES.REGULAR_LOAN, tx), dr: loanPaise / 100, cr: 0, memberId: voucher.partyCode });
      if (ladPaise > 0) lines.push({ ledgerId: await resolveLedgerId(ACCOUNTING_ROLES.LOAN_AGAINST_DEPOSIT, tx), dr: ladPaise / 100, cr: 0, memberId: voucher.partyCode });
      if (!lines.length) throw new PostingError('Enter the loan amount.', 'FAILURE');
      lines.push({ ledgerId: paymentLedgerId, dr: 0, cr: (loanPaise + ladPaise) / 100 });
      return lines;
    }
  },
  'deposit-paid-member': {
    status: 'PROVEN',
    build: async (voucher, { tx }) => {
      const amount = Number(voucher.amount) || 0;
      const paymentLedgerId = await getCounterLedger(voucher, tx);
      const depLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.COMPULSORY_DEPOSIT, tx);
      return [
        { ledgerId: depLedgerId, dr: amount, cr: 0, memberId: voucher.partyCode },
        { ledgerId: paymentLedgerId, dr: 0, cr: amount }
      ];
    }
  },
  'insurance-paid-member': {
    status: 'BLOCKED_LEGACY_UNKNOWN'
  },
  'ssa-paid-member': {
    status: 'PROVEN',
    build: async (voucher, { tx }) => {
      const amount = Number(voucher.amount) || 0;
      const paymentLedgerId = await getCounterLedger(voucher, tx);
      const ssaLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.SPECIAL_DEPOSIT, tx);
      return [
        { ledgerId: ssaLedgerId, dr: amount, cr: 0, memberId: voucher.partyCode },
        { ledgerId: paymentLedgerId, dr: 0, cr: amount }
      ];
    }
  },
  'advance-paid-emp': {
    status: 'HIGH',
    build: async (voucher, { tx }) => {
      const paymentLedgerId = await getCounterLedger(voucher, tx);
      const components = voucher?.details?.components || {};
      const house = Number(components.house) || 0;
      const vehicle = Number(components.vehicle) || 0;
      const grain = Number(components.grain) || 0;
      
      const lines = [];
      let totalDr = 0;
      
      if (house > 0) {
        const id = await resolveLedgerId(ACCOUNTING_ROLES.EMPLOYEE_HOUSING_LOAN, tx);
        lines.push({ ledgerId: id, dr: house, cr: 0, employeeId: voucher.partyCode });
        totalDr += house;
      }
      if (vehicle > 0) {
        const id = await resolveLedgerId(ACCOUNTING_ROLES.EMPLOYEE_VEHICLE_LOAN, tx);
        lines.push({ ledgerId: id, dr: vehicle, cr: 0, employeeId: voucher.partyCode });
        totalDr += vehicle;
      }
      if (grain > 0) {
        const id = await resolveLedgerId(ACCOUNTING_ROLES.EMPLOYEE_GRAIN_ADVANCE, tx);
        lines.push({ ledgerId: id, dr: grain, cr: 0, employeeId: voucher.partyCode });
        totalDr += grain;
      }
      
      lines.push({ ledgerId: paymentLedgerId, dr: 0, cr: totalDr });
      return lines;
    }
  },
  // Advance Recovery From Employee (legacy TransType 13). By Transfer (from
  // salary) legacy posts no cash leg: the Transfer Adjustment account here.
  'advance-recovery-emp': {
    status: 'HIGH',
    build: async (voucher, { tx }) => {
      const paymentLedgerId = await getCounterLedger(voucher, tx);
      const components = voucher?.details?.components || {};
      const house = Number(components.house) || 0;
      const vehicle = Number(components.vehicle) || 0;
      const grain = Number(components.grain) || 0;
      
      const lines = [];
      let totalCr = 0;
      
      if (house > 0) {
        const id = await resolveLedgerId(ACCOUNTING_ROLES.EMPLOYEE_HOUSING_LOAN, tx);
        lines.push({ ledgerId: id, dr: 0, cr: house, employeeId: voucher.partyCode });
        totalCr += house;
      }
      if (vehicle > 0) {
        const id = await resolveLedgerId(ACCOUNTING_ROLES.EMPLOYEE_VEHICLE_LOAN, tx);
        lines.push({ ledgerId: id, dr: 0, cr: vehicle, employeeId: voucher.partyCode });
        totalCr += vehicle;
      }
      if (grain > 0) {
        const id = await resolveLedgerId(ACCOUNTING_ROLES.EMPLOYEE_GRAIN_ADVANCE, tx);
        lines.push({ ledgerId: id, dr: 0, cr: grain, employeeId: voucher.partyCode });
        totalCr += grain;
      }
      
      lines.push({ ledgerId: paymentLedgerId, dr: totalCr, cr: 0 });
      return lines;
    }
  },
  'recovery-member': {
    status: 'PROVEN',
    build: async (voucher, { recoveryLines = [], tx }) => {
      if (!recoveryLines || recoveryLines.length === 0) {
        throw new PostingError('Recovery voucher requires authoritative recovery lines.', 'FAILURE');
      }

      let totalDr = 0;
      const crLines = [];
      
      const shareLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.SHARE, tx);
      const cdLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.COMPULSORY_DEPOSIT, tx);
      const ssaLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.SPECIAL_DEPOSIT, tx);
      const rloanLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.REGULAR_LOAN, tx);
      const dloanLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.LOAN_AGAINST_DEPOSIT, tx);
      const admissionLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.ADMISSION, tx);

      // Recovery lines carry the recovery_lines column names (specialDeposit,
      // depositLoan); older callers sent ssa / loanAgainstDeposit. Reading
      // only the old names left SSA and LAD uncredited while the debit took
      // the full line total, so any SSA/LAD recovery came out unbalanced.
      const ssaOf = (line) => Number(line.specialDeposit ?? line.ssa ?? 0);
      const ladOf = (line) => Number(line.depositLoan ?? line.loanAgainstDeposit ?? 0);
      for (const line of recoveryLines) {
        if (Number(line.premium) > 0) {
          throw new PostingError(`Member ${line.memberCode || ''}: Insurance Premium (PREMIUM) cannot be posted yet — no ledger rule has been confirmed by the accountant. Remove the premium amount to save.`, 'BLOCKED_ACCOUNTANT_DECISION');
        }
        if (Number(line.suspense) > 0) {
          throw new PostingError(`Member ${line.memberCode || ''}: Suspense A/C (SUSPENSE) cannot be posted yet — no ledger rule has been confirmed by the accountant. Remove the suspense amount to save.`, 'BLOCKED_ACCOUNTANT_DECISION');
        }

        if (Number(line.share) > 0) crLines.push({ ledgerId: shareLedgerId, dr: 0, cr: Number(line.share), memberId: line.memberCode });
        if (Number(line.compulsoryDeposit) > 0) crLines.push({ ledgerId: cdLedgerId, dr: 0, cr: Number(line.compulsoryDeposit), memberId: line.memberCode });
        if (ssaOf(line) > 0) crLines.push({ ledgerId: ssaLedgerId, dr: 0, cr: ssaOf(line), memberId: line.memberCode });
        if (Number(line.regularLoan) > 0) crLines.push({ ledgerId: rloanLedgerId, dr: 0, cr: Number(line.regularLoan), memberId: line.memberCode });
        if (ladOf(line) > 0) crLines.push({ ledgerId: dloanLedgerId, dr: 0, cr: ladOf(line), memberId: line.memberCode });
        if (Number(line.admission) > 0) crLines.push({ ledgerId: admissionLedgerId, dr: 0, cr: Number(line.admission), memberId: line.memberCode });
        
      }
      // The cash/bank side is what the heads above actually credit (in paise),
      // so a line whose stated total disagrees can never unbalance the voucher.
      totalDr = Number((crLines.reduce((sum, line) => sum + Math.round(line.cr * 100), 0) / 100).toFixed(2));
      if (totalDr <= 0) {
        throw new PostingError('Recovery voucher has no recovered amount.', 'FAILURE');
      }

      const paymentLedgerId = await getCounterLedger(voucher, tx);
      
      return [
        { ledgerId: paymentLedgerId, dr: totalDr, cr: 0 },
        ...crLines
      ];
    }
  },
  // Balanced multi-line voucher: any ledgers, debits must equal credits.
  // details.journalLines: [{ ledgerCode | ledgerId, debit, credit,
  // memberCode?, employeeCode? }]. Used for year-end entries (interest
  // totals, depreciation, profit appropriation) and the year-end close.
  'journal-voucher': {
    status: 'PROVEN',
    build: async (voucher, { tx }) => {
      const input = Array.isArray(voucher?.details?.journalLines) ? voucher.details.journalLines : [];
      const lines = [];
      for (const [index, line] of input.entries()) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (!debit && !credit) continue;
        const code = String(line.ledgerCode || '').trim().toUpperCase();
        let ledger = null;
        if (line.ledgerId) ledger = (await Ledger.find({ _id: String(line.ledgerId) }).tx(tx).exec())[0] || null;
        if (!ledger && code) ledger = (await Ledger.find({ code }).tx(tx).exec())[0] || null;
        if (!ledger) throw new PostingError(`Journal line ${index + 1}: ledger ${code || line.ledgerId || '(none)'} was not found.`, 'FAILURE');
        lines.push({
          ledgerId: ledger.id || ledger._id,
          dr: debit,
          cr: credit,
          memberId: line.memberCode ? String(line.memberCode).trim().toUpperCase() : undefined,
          employeeId: line.employeeCode ? String(line.employeeCode).trim().toUpperCase() : undefined
        });
      }
      if (lines.length < 2) throw new PostingError('A journal voucher needs at least two lines with an amount.', 'FAILURE');
      return lines;
    }
  },
  // Interest Receive From Employee (legacy TransType 22). Legacy posts it once
  // a year, on 31 March, per employee:
  //   - by transfer (no cash): the year's interest charged to the staff loan —
  //     legacy paired it with an Advance Paid of the same amount — so the
  //     staff loan ledger Dr (the loan grows), interest income Cr;
  //   - in cash: interest paid in, cash (or the chosen payment ledger) Dr,
  //     interest income Cr, the loan untouched.
  // The year-end close then carries only what legacy's own calculation
  // differs from this charge by.
  'interest-recv-employee': {
    status: 'PROVEN',
    build: async (voucher, { tx }) => {
      const amount = employeeInterestReceived(voucher);
      if (!(amount > 0)) throw new PostingError('Enter the interest amount.', 'FAILURE');
      const vehicle = isVehicleLoanInterest(voucher);
      const pattern = vehicle ? /intre?s?t\s*rec\w*.*vehicle\s*loan.*staff/i : /intre?s?t\s*rec\w*.*house\s*loan.*staff/i;
      const incomeLedger = (await Ledger.find({}).tx(tx).exec()).find((ledger) => pattern.test(String(ledger.name || '')));
      if (!incomeLedger) throw new PostingError(`No "Intrest Received (${vehicle ? 'Vehicle' : 'House'} Loan to Staff)" ledger was found.`, 'FAILURE');
      const employeeId = String(voucher.partyCode || '').trim().toUpperCase() || undefined;
      const debitLedgerId = isEmployeeInterestCharged(voucher)
        ? await resolveLedgerId(vehicle ? ACCOUNTING_ROLES.EMPLOYEE_VEHICLE_LOAN : ACCOUNTING_ROLES.EMPLOYEE_HOUSING_LOAN, tx)
        : await getPaymentLedger(voucher, tx);
      return [
        { ledgerId: debitLedgerId, dr: amount, cr: 0, employeeId },
        { ledgerId: incomeLedger.id || incomeLedger._id, dr: 0, cr: amount, employeeId }
      ];
    }
  },
  ...Object.fromEntries(Object.keys(BANK_VOUCHERS).map((key) => [key, {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildBankVoucherLines(voucher, tx)
  }])),
  // Interest Paid To Member (legacy TransType 20): the member's CD / SSA
  // interest, Intrest Paid (CD / SSA) Dr. Legacy always posts it by Transfer:
  // a Transfer Voucher Receipt From Member credits it into the deposit.
  'interest-paid-member': {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildMemberInterestLines(voucher, tx)
  },
  // Interest Receive From Member (legacy TransType 21): interest on the Loan /
  // LAD, Intrest Received (Members Loan / Deposit Loan) Cr. By Transfer it is
  // paid from the member's deposit (a Transfer Voucher Paid To Member); in
  // cash, Cash-in-Hand Dr.
  'interest-recv-member': {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildMemberInterestLines(voucher, tx)
  },
  // Transfer Voucher Paid To Member (legacy TransType 14): each head debited
  // for the member, the Transfer Adjustment account credited.
  'transfer-voucher-paid': {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildTransferVoucherLines(voucher, tx, 'paid')
  },
  // Transfer Voucher Receipt From Member (legacy TransType 15), the reverse.
  'transfer-voucher-recover': {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildTransferVoucherLines(voucher, tx, 'recover')
  },
  'transfer-voucher-payment': {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildTransferLedgerLines(voucher, tx, 'payment')
  },
  'transfer-voucher-receipt': {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildTransferLedgerLines(voucher, tx, 'receipt')
  },
  'payment-voucher': {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildGeneralVoucherLines(voucher, tx, 'payment')
  },
  'receipt-voucher': {
    status: 'PROVEN',
    build: (voucher, { tx }) => buildGeneralVoucherLines(voucher, tx, 'receipt')
  }
};

async function buildJournalLinesForVoucher(voucher, meta = {}) {
  const transactionType = normalizeTransactionType(voucher);
  if (!transactionType) {
    throw new PostingError('Missing canonical transaction key (details.key).', 'FAILURE');
  }

  const rule = POSTING_REGISTRY[transactionType];
  if (!rule) {
    throw new PostingError(`No posting rule defined for transaction type: ${transactionType}`, 'FAILURE');
  }

  if (rule.status !== 'PROVEN' && rule.status !== 'HIGH') {
    throw new PostingError(`Transaction type ${transactionType} is blocked. Status: ${rule.status}`, rule.status);
  }

  const lines = await rule.build(voucher, meta);

  // Validate integrity
  let sumDr = 0;
  let sumCr = 0;
  for (const line of lines) {
    const dr = Number(line.dr) || 0;
    const cr = Number(line.cr) || 0;
    
    if (dr < 0 || cr < 0) {
      throw new PostingError('Journal line cannot have negative amounts.', 'FAILURE');
    }
    if (dr > 0 && cr > 0) {
      throw new PostingError('Journal line cannot have both Debit and Credit amounts.', 'FAILURE');
    }

    sumDr += dr;
    sumCr += cr;
  }

  sumDr = Number(sumDr.toFixed(2));
  sumCr = Number(sumCr.toFixed(2));

  if (sumDr !== sumCr) {
    throw new PostingError(`Unbalanced voucher posting: Total Debit (${sumDr}) != Total Credit (${sumCr})`, 'FAILURE');
  }

  return lines.map((line, index) => ({
    voucherId: String(voucher.voucherNo || voucher.id || ''),
    ledgerId: String(line.ledgerId),
    debitAmount: line.dr,
    creditAmount: line.cr,
    memberId: line.memberId || null,
    employeeId: line.employeeId || null,
    branchId: line.branchId || voucher.branchCode || null,
    description: voucher.narration || '',
    postingOrder: index
  }));
}

module.exports = {
  employeeInterestReceived,
  memberInterestHead,
  isEmployeeInterestCharged,
  isVehicleLoanInterest,
  buildJournalLinesForVoucher,
  PostingError
};

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

const POSTING_REGISTRY = {
  'loan-paid-member': {
    status: 'PROVEN',
    build: async (voucher, { tx }) => {
      const amount = Number(voucher.amount) || 0;
      const paymentLedgerId = await getPaymentLedger(voucher, tx);
      const loanLedgerId = await resolveLedgerId(ACCOUNTING_ROLES.REGULAR_LOAN, tx);
      return [
        { ledgerId: loanLedgerId, dr: amount, cr: 0, memberId: voucher.partyCode },
        { ledgerId: paymentLedgerId, dr: 0, cr: amount }
      ];
    }
  },
  'deposit-paid-member': {
    status: 'PROVEN',
    build: async (voucher, { tx }) => {
      const amount = Number(voucher.amount) || 0;
      const paymentLedgerId = await getPaymentLedger(voucher, tx);
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
      const paymentLedgerId = await getPaymentLedger(voucher, tx);
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
      const paymentLedgerId = await getPaymentLedger(voucher, tx);
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
  'advance-recovery-emp': {
    status: 'HIGH',
    build: async (voucher, { tx }) => {
      const paymentLedgerId = await getPaymentLedger(voucher, tx);
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

      for (const line of recoveryLines) {
        if (Number(line.premium) > 0) {
          throw new PostingError('Posting blocked: PREMIUM accounting rules are BLOCKED_ACCOUNTANT_DECISION.', 'BLOCKED_ACCOUNTANT_DECISION');
        }
        if (Number(line.suspense) > 0) {
          throw new PostingError('Posting blocked: SUSPENSE accounting rules are BLOCKED_ACCOUNTANT_DECISION.', 'BLOCKED_ACCOUNTANT_DECISION');
        }

        if (Number(line.share) > 0) crLines.push({ ledgerId: shareLedgerId, dr: 0, cr: Number(line.share), memberId: line.memberCode });
        if (Number(line.compulsoryDeposit) > 0) crLines.push({ ledgerId: cdLedgerId, dr: 0, cr: Number(line.compulsoryDeposit), memberId: line.memberCode });
        if (Number(line.ssa) > 0) crLines.push({ ledgerId: ssaLedgerId, dr: 0, cr: Number(line.ssa), memberId: line.memberCode });
        if (Number(line.regularLoan) > 0) crLines.push({ ledgerId: rloanLedgerId, dr: 0, cr: Number(line.regularLoan), memberId: line.memberCode });
        if (Number(line.depositLoan) > 0) crLines.push({ ledgerId: dloanLedgerId, dr: 0, cr: Number(line.depositLoan), memberId: line.memberCode });
        if (Number(line.admission) > 0) crLines.push({ ledgerId: admissionLedgerId, dr: 0, cr: Number(line.admission), memberId: line.memberCode });
        
        totalDr += Number(line.total) || 0;
      }

      const paymentLedgerId = await getPaymentLedger(voucher, tx);
      
      return [
        { ledgerId: paymentLedgerId, dr: totalDr, cr: 0 },
        ...crLines
      ];
    }
  },
  'bank-deposit': { status: 'BLOCKED_LEGACY_UNKNOWN' },
  'interest-paid-member': { status: 'BLOCKED_LEGACY_UNKNOWN' },
  'transfer-voucher-paid': { status: 'BLOCKED_LEGACY_UNKNOWN' },
  'transfer-voucher-recover': { status: 'BLOCKED_LEGACY_UNKNOWN' },
  'transfer-voucher-payment': { status: 'BLOCKED_LEGACY_UNKNOWN' },
  'transfer-voucher-receipt': { status: 'BLOCKED_LEGACY_UNKNOWN' }
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
  buildJournalLinesForVoucher,
  PostingError
};

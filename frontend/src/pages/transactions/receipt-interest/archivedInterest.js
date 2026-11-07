// An interest voucher that came over from the old software opens in the same
// form as a new one (legacy types 20 / 21 / 22). It fills exactly one head
// (true of all 899 in the archive), and that head is its A/C.

const ACCOUNT_BY_HEAD = {
  CDAmt: 'Compulsary Deposit',
  SSAamt: 'Saving Deposit',
  RLoanAmt: 'Loan to Member',
  DLoanAmt: 'Deposit Loan to Member',
  HomeLoan: 'House Loan to Employee',
  VehicleLoan: 'Vehicle Loan to Employee',
  GrainAdvance: 'Grain Advance'
};

function filledHead(record = {}) {
  const heads = record.heads || [];
  return heads.find((head) => Number(head.value) > 0) || heads[0] || null;
}

// The form's draft. `selfBalancing` is a voucher with its own pay-mode leg,
// always Cash-In-Hand on these types; the others were posted by Transfer.
export function archivedInterestDraft(record, row, base = {}) {
  const head = filledHead(record);
  return {
    ...base,
    voucherNo: record.voucherNo,
    date: record.voucherDate,
    partyCode: row?.partyCode || '',
    narration: record.narration || '',
    mode: record.selfBalancing ? 'Cash' : 'Transfer',
    amount: record.totalAmt,
    details: {
      ...(base.details || {}),
      accountType: ACCOUNT_BY_HEAD[head?.field] || '',
      interestAmount: record.totalAmt
    }
  };
}

// What can change on it. The server moves the balances by the change. The A/C
// stays: its interest ledger is the voucher's own LedgerAccID, not the head.
export function archivedInterestPayload(record, draft) {
  return {
    voucherDate: draft.date,
    narration: draft.narration,
    amounts: { [filledHead(record)?.field]: draft.details?.interestAmount }
  };
}

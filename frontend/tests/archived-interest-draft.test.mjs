import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let utils;
let vite;

before(async () => {
  vite = await createServer({ appType: 'custom', configFile: false, server: { hmr: false, middlewareMode: true } });
  utils = await vite.ssrLoadModule('/src/pages/transactions/receipt-interest/archivedInterest.js');
});

after(async () => {
  await vite?.close();
});

const heads = (filled, fields = ['CDAmt', 'SSAamt', 'RLoanAmt', 'DLoanAmt']) => fields.map((field) => ({ field, value: field === filled ? 11064 : 0 }));
const record = (over = {}) => ({
  voucherNo: '546', voucherDate: '2026-10-31', narration: 'old note', selfBalancing: false, totalAmt: 11064, heads: heads('RLoanAmt'), ...over
});
const row = { id: 'legacy:x', partyCode: '1013', details: { key: 'interest-recv-member' } };

// An archived interest voucher opens in the page's own form: every legacy
// voucher of types 20 / 21 / 22 fills exactly one head, which is its A/C.
test('an archived interest voucher fills the form as it was entered', () => {
  const draft = utils.archivedInterestDraft(record(), row, { documents: {}, details: { key: 'interest-recv-member', other: 1 } });
  assert.equal(draft.voucherNo, '546');
  assert.equal(draft.date, '2026-10-31');
  assert.equal(draft.partyCode, '1013');
  assert.equal(draft.narration, 'old note');
  assert.equal(draft.mode, 'Transfer');
  assert.equal(draft.amount, 11064);
  assert.equal(draft.details.accountType, 'Loan to Member');
  assert.equal(draft.details.interestAmount, 11064);
  assert.equal(draft.details.other, 1, 'the rest of the draft stays');
});

test('the filled head is the A/C the form lists, on all three interest pages', () => {
  const accountOf = (filled, fields) => utils.archivedInterestDraft(record({ heads: heads(filled, fields) }), row, {}).details.accountType;
  assert.equal(accountOf('DLoanAmt'), 'Deposit Loan to Member');
  assert.equal(accountOf('CDAmt'), 'Compulsary Deposit');
  assert.equal(accountOf('SSAamt'), 'Saving Deposit');
  assert.equal(accountOf('HomeLoan', ['HomeLoan', 'VehicleLoan', 'GrainAdvance']), 'House Loan to Employee');
  assert.equal(accountOf('VehicleLoan', ['HomeLoan', 'VehicleLoan', 'GrainAdvance']), 'Vehicle Loan to Employee');
});

test('a voucher with its own cash leg shows Cash', () => {
  assert.equal(utils.archivedInterestDraft(record({ selfBalancing: true }), row, {}).mode, 'Cash');
});

// Only the filled head goes back: the A/C (and so the interest ledger) stays.
test('saving sends the date, narration and the interest on the same head', () => {
  const payload = utils.archivedInterestPayload(record(), { date: '2026-10-30', narration: 'new', details: { interestAmount: '12000' } });
  assert.deepEqual(payload, { voucherDate: '2026-10-30', narration: 'new', amounts: { RLoanAmt: '12000' } });
});

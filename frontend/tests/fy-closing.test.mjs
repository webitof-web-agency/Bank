import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let fy;
let journal;
let vite;

before(async () => {
  vite = await createServer({ appType: 'custom', configFile: false, server: { hmr: false, middlewareMode: true } });
  fy = await vite.ssrLoadModule('/src/pages/settings/fyClosing/fyClosingUtils.js');
  journal = await vite.ssrLoadModule('/src/pages/transactions/other/journal-voucher/journalUtils.js');
});

after(async () => {
  await vite?.close();
});

test('journal voucher: balanced only when debit equals credit to the paisa and every amount has a ledger', () => {
  const lines = [
    { ledgerCode: '63', debit: '1000.10', credit: '' },
    { ledgerCode: '6', debit: '', credit: '1000.1' }
  ];
  assert.deepEqual(journal.journalTotals(lines), { debit: 1000.1, credit: 1000.1, balanced: true });
  assert.equal(journal.journalTotals([{ ledgerCode: '63', debit: '10' }, { ledgerCode: '6', credit: '9.99' }]).balanced, false);
  assert.equal(journal.journalTotals([{ ledgerCode: '', debit: '10' }, { ledgerCode: '6', credit: '10' }]).balanced, false);
});

test('journal voucher payload: only lines with a ledger and an amount, as numbers', () => {
  const payload = journal.journalPayload({
    date: '2027-03-31',
    narration: 'Depreciation',
    lines: [{ ledgerCode: '88', debit: '500', credit: '' }, { ledgerCode: '20', debit: '', credit: '500' }, { ledgerCode: '', debit: '', credit: '' }]
  });
  assert.equal(payload.details.key, 'journal-voucher');
  assert.deepEqual(payload.details.journalLines, [{ ledgerCode: '88', debit: 500, credit: 0 }, { ledgerCode: '20', debit: 0, credit: 500 }]);
  const draft = journal.journalDraftFromRecord({ date: '2027-03-31', narration: 'x', details: { journalLines: payload.details.journalLines } });
  assert.equal(draft.lines.length, 2);
  assert.equal(draft.lines[0].debit, '500');
});

test('appropriation: remaining to the paisa, missing fund and duplicate fund are caught', () => {
  assert.deepEqual(fy.appropriationState([{ ledgerCode: '12', amount: '115789' }, { ledgerCode: '13', amount: '347369.33' }], 463158.33), {
    allocated: 463158.33, remaining: 0, balanced: true, missingFund: false, duplicate: false
  });
  assert.equal(fy.appropriationState([{ ledgerCode: '12', amount: '100' }], 463158.33).remaining, 463058.33);
  assert.equal(fy.appropriationState([{ ledgerCode: '', amount: '10' }], 10).missingFund, true);
  assert.equal(fy.appropriationState([{ ledgerCode: '12', amount: '5' }, { ledgerCode: '12', amount: '5' }], 10).duplicate, true);
  // A loss is appropriated as negative amounts.
  assert.equal(fy.appropriationState([{ ledgerCode: '12', amount: '-775930.32' }], -775930.32).balanced, true);
  assert.deepEqual(fy.appropriationPayload([{ ledgerCode: '12', amount: '10.005' }, { ledgerCode: '', amount: '1' }]), [{ ledgerCode: '12', amount: 10.01 }]);
});

test('profit to appropriate switches with the staff interest choice; status labels', () => {
  const preview = { profitAfterInterest: 1000, profitWithEmployeeInterest: 900 };
  assert.equal(fy.profitToAppropriate(preview, false), 1000);
  assert.equal(fy.profitToAppropriate(preview, true), 900);
  assert.equal(fy.yearStatusLabel({ source: 'legacy', status: 'CLOSED' }), 'Closed in old software');
  assert.equal(fy.yearStatusLabel({ source: 'app', status: 'OPEN' }), 'Open');
  assert.equal(fy.formatDate('2027-03-31'), '31-03-2027');
});

test('FY switcher: the list grows on 1 April; a user on the current year moves to the new one, a chosen past year stays', async () => {
  const ctx = await vite.ssrLoadModule('/src/context/FYContext.jsx');
  const fy = (y) => ({ label: `${y}-${String(y + 1).slice(-2)}`, start: `${y}-04-01`, end: `${y + 1}-03-31` });
  assert.deepEqual(ctx.generateFYList(fy(2027)).map((f) => f.label), ['2027-28', '2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22']);
  // Was on the current year (2026-27) when it was chosen: moves to 2027-28.
  assert.equal(ctx.resolveActiveFY({ ...fy(2026), currentAtSelection: '2026-27' }, fy(2027)).label, '2027-28');
  // Saved before this was tracked: a past year stays, even across later roll-overs...
  const legacyPast = ctx.resolveActiveFY(fy(2024), fy(2026));
  assert.equal(legacyPast.label, '2024-25');
  assert.equal(ctx.resolveActiveFY(legacyPast, fy(2027)).label, '2024-25');
  // ...and the then-current year follows the next roll-over.
  const legacyCurrent = ctx.resolveActiveFY(fy(2026), fy(2026));
  assert.equal(ctx.resolveActiveFY(legacyCurrent, fy(2027)).label, '2027-28');
  // Picked 2024-25 on purpose while 2026-27 was current: stays.
  assert.equal(ctx.resolveActiveFY({ ...fy(2024), currentAtSelection: '2026-27' }, fy(2027)).label, '2024-25');
  // Same year: unchanged; nothing stored: the current year.
  const same = { ...fy(2027), currentAtSelection: '2027-28' };
  assert.equal(ctx.resolveActiveFY(same, fy(2027)), same);
  assert.equal(ctx.resolveActiveFY(null, fy(2027)).label, '2027-28');
});

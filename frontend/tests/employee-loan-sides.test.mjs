import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let utils;
let vite;

before(async () => {
  vite = await createServer({ appType: 'custom', configFile: false, server: { hmr: false, middlewareMode: true } });
  utils = await vite.ssrLoadModule('/src/pages/master/employees/employeeUtils.js');
});

after(async () => {
  await vite?.close();
});

// Staff loans are stored credit-positive (owed = negative, as legacy); the
// form shows the amount unsigned with its Dr / Cr side, and saving restores
// the stored sign (user, 2026-11-04: "-44745 Dr" showed a double minus).
test('employee loans: stored -44745 shows as 44745 Dr and saves back as -44745', () => {
  const draft = utils.createEmployeeDraftFromRecord({ grainAdvance: -44745, grainSide: 'Dr', housingLoan: 0, vehicleLoan: '' });
  assert.equal(draft.grainAdvance, '44745');
  assert.equal(draft.grainSide, 'Dr');
  assert.equal(draft.housingLoan, '0');
  assert.equal(draft.vehicleLoan, '');
  const payload = utils.buildEmployeePayload(draft).payload;
  assert.equal(payload.grainAdvance, -44745);
  assert.equal(payload.grainSide, 'Dr');
  assert.equal(payload.housingLoan, 0);
  assert.equal(payload.vehicleLoan, '');
});

test('employee loans: a credit balance shows Cr and stays positive; a typed minus is ignored', () => {
  const draft = utils.createEmployeeDraftFromRecord({ housingLoan: 1200, housingSide: 'Dr' });
  assert.equal(draft.housingLoan, '1200');
  assert.equal(draft.housingSide, 'Cr');
  assert.equal(utils.buildEmployeePayload(draft).payload.housingLoan, 1200);
  const typed = utils.buildEmployeePayload({ ...draft, housingLoan: '-500', housingSide: 'Dr' }).payload;
  assert.equal(typed.housingLoan, -500);
  assert.equal(typed.housingSide, 'Dr');
});

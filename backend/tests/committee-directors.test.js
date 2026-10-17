// Managing Committee: the directors picked on the page are saved (they live in
// committee_directors, one row each, in order) and come back on the next load.
// Before, the list was put on the committees row, which has no such column,
// and was silently dropped.
const test = require('node:test');
const assert = require('node:assert/strict');
const banking = require('../services/banking.service');
const { CommitteeDirector } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const admin = { actorUser: { isSuperAdmin: true } };
const ctx = {};
const directorsNow = async () => (await banking.getSingle('committee')).directors;

test.after(async () => { if (closeDatabase) await closeDatabase(); });

test('setup: remember the committee as it was', async () => {
  await initializeDatabase();
  ctx.before = await banking.getSingle('committee');
});

test('directors picked on the page are saved, in order, and load again', async () => {
  const saved = await banking.updateResource('committee', null, {
    chairman: 'SHRI DEV KUMAR VYASH', viceChairman: 'SHRI KULESHWAR YADAW', viceChairman2: 'SMT. KIRAN BANDHE',
    directors: ['SHRI VIDHAN TIWARI', 'SHRI YUVRAJ DUBEY', 'SMT. NEETU RATHOUR']
  }, admin);
  assert.deepEqual(saved.directors, ['SHRI VIDHAN TIWARI', 'SHRI YUVRAJ DUBEY', 'SMT. NEETU RATHOUR'], 'the save answers with them');
  assert.deepEqual(await directorsNow(), ['SHRI VIDHAN TIWARI', 'SHRI YUVRAJ DUBEY', 'SMT. NEETU RATHOUR'], 'and the next load has them');
  assert.equal((await banking.getSingle('committee')).chairman, 'SHRI DEV KUMAR VYASH');
});

test('re-order, remove and add; a name twice counts once', async () => {
  await banking.updateResource('committee', null, { directors: ['SMT. NEETU RATHOUR', 'SHRI VIDHAN TIWARI', 'smt. neetu rathour', 'SMT. MADHU YADAW'] }, admin);
  assert.deepEqual(await directorsNow(), ['SMT. NEETU RATHOUR', 'SHRI VIDHAN TIWARI', 'SMT. MADHU YADAW']);
  const removed = (await CommitteeDirector.find({ committeeKey: 'default', name: 'SHRI YUVRAJ DUBEY' }).withDeleted().lean())[0];
  assert.ok(removed?.deletedAt, 'a director taken off is soft-deleted (kept on record)');
});

test('saving the other fields leaves the directors as they are', async () => {
  await banking.updateResource('committee', null, { chairman: 'SHRI DEV KUMAR VYASH' }, admin);
  assert.deepEqual(await directorsNow(), ['SMT. NEETU RATHOUR', 'SHRI VIDHAN TIWARI', 'SMT. MADHU YADAW']);
  await banking.updateResource('committee', null, { directors: [] }, admin);
  assert.deepEqual(await directorsNow(), [], 'an empty list clears them');
});

test('cleanup: the committee as it was', async () => {
  const { chairman, viceChairman, viceChairman2, directors } = ctx.before || {};
  await banking.updateResource('committee', null, { chairman, viceChairman, viceChairman2, directors: directors || [] }, admin);
  assert.deepEqual(await directorsNow(), directors || []);
});

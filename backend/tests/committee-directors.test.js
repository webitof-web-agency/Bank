// Managing Committee: the directors picked on the page are saved (they live in
// committee_directors, one row each, in order) and come back on the next load.
// Before, the list was put on the committees row, which has no such column,
// and was silently dropped. A director is kept by member code: two members
// can share a name.
const test = require('node:test');
const assert = require('node:assert/strict');
const banking = require('../services/banking.service');
const { Branch, CommitteeDirector, Member } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const RUN = `C${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const admin = { actorUser: { isSuperAdmin: true } };
const ctx = {};
const directorsNow = async () => (await banking.getSingle('committee')).directors;
const names = (list) => list.map((d) => d.name);

test.after(async () => { if (closeDatabase) await closeDatabase(); });

test('setup: remember the committee; two members with the same name', async () => {
  await initializeDatabase();
  ctx.before = await banking.getSingle('committee');
  await Branch.create({ code: `${RUN}B`, label: 'COMMITTEE TEST' });
  const make = async (n) => (await Member.create({ code: `${RUN}${n}`, name: `DILIP ${RUN} SAHU`, branchCode: `${RUN}B`, membershipDate: '2020-04-01' })).code;
  ctx.first = await make(1);
  ctx.second = await make(2);
});

test('two members with the same name are two directors, each by code', async () => {
  const saved = await banking.updateResource('committee', null, {
    chairman: 'SHRI DEV KUMAR VYASH', viceChairman: 'SHRI KULESHWAR YADAW', viceChairman2: 'SMT. KIRAN BANDHE',
    directors: [{ memberCode: ctx.first }, { memberCode: ctx.second, name: 'anything the browser sent' }]
  }, admin);
  assert.deepEqual(saved.directors, [
    { memberCode: ctx.first, name: `DILIP ${RUN} SAHU` },
    { memberCode: ctx.second, name: `DILIP ${RUN} SAHU` }
  ], 'saved, the name from the member record');
  assert.deepEqual(await directorsNow(), saved.directors, 'and the next load has them');
  const committee = await banking.getSingle('committee');
  assert.equal(committee.viceChairman2, 'SMT. KIRAN BANDHE');

  // Taking one off leaves the other.
  await banking.updateResource('committee', null, { directors: [{ memberCode: ctx.second }] }, admin);
  assert.deepEqual((await directorsNow()).map((d) => d.memberCode), [ctx.second]);
  const removed = (await CommitteeDirector.find({ committeeKey: 'default', memberCode: ctx.first }).withDeleted().lean())[0];
  assert.ok(removed?.deletedAt, 'a director taken off is soft-deleted (kept on record)');

  await assert.rejects(banking.updateResource('committee', null, { directors: [{ memberCode: `${RUN}NONE` }] }, admin), /Unknown member code/);
});

test('names without a member (typed / migrated) still work; order kept; duplicates count once', async () => {
  await banking.updateResource('committee', null, {
    directors: ['SMT. NEETU RATHOUR', { memberCode: ctx.first }, 'smt. neetu rathour', { memberCode: ctx.first }, 'SHRI VIDHAN TIWARI']
  }, admin);
  assert.deepEqual(names(await directorsNow()), ['SMT. NEETU RATHOUR', `DILIP ${RUN} SAHU`, 'SHRI VIDHAN TIWARI']);
});

test('saving the other fields leaves the directors as they are; an empty list clears them', async () => {
  await banking.updateResource('committee', null, { chairman: 'SHRI DEV KUMAR VYASH' }, admin);
  assert.equal((await directorsNow()).length, 3);
  await banking.updateResource('committee', null, { directors: [] }, admin);
  assert.deepEqual(await directorsNow(), []);
});

test('cleanup: the committee as it was', async () => {
  const { chairman, viceChairman, viceChairman2, directors } = ctx.before || {};
  await banking.updateResource('committee', null, { chairman, viceChairman, viceChairman2, directors: directors || [] }, admin);
  for (const code of [ctx.first, ctx.second]) await Member.deleteOne({ code });
  await Branch.deleteOne({ code: `${RUN}B` });
});

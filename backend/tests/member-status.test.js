// Dismembering a member makes them Inactive (flag, date and status move
// together) and stops their member-app login; the member list offers All /
// Active / Branch-wise / Dismembered.
// App tokens are signed: a test-only secret when none is configured.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'member-status-test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const banking = require('../services/banking.service');
const appPortal = require('../services/appPortal.service');
const { Branch, Member, NoInterestMember } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const RUN = `S${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const BRANCH = `${RUN}B`;
const MOBILE = `97${String(Math.floor(10000000 + Math.random() * 89999999))}`;
const admin = { actorUser: { isSuperAdmin: true } };
const ctx = {};

test.after(async () => { if (closeDatabase) await closeDatabase(); });

test('setup', async () => {
  await initializeDatabase();
  await Branch.create({ code: BRANCH, label: 'STATUS TEST' });
  ctx.member = await banking.createResource('members', { name: `Status ${RUN}`, branchCode: BRANCH, mobileNo: MOBILE, password: 'secret12', status: 'ACTIVE' }, admin);
  assert.equal(ctx.member.status, 'Active', 'stored in the form\'s spelling');
  assert.ok((await appPortal.login(MOBILE, 'secret12')).token);
});

test('dismembering needs a date, sets Inactive and stops the app login', async () => {
  await assert.rejects(banking.updateResource('members', ctx.member.id, { dismembered: true, dismemberedDate: '' }, admin), /dismembered date/);
  const updated = await banking.updateResource('members', ctx.member.id, { dismembered: true, dismemberedDate: '2026-10-10', status: 'Active' }, admin);
  assert.equal(updated.dismembered, true);
  assert.equal(updated.status, 'Inactive', 'a dismembered member is never Active');
  assert.equal(String(updated.dismemberedDate).slice(0, 10), '2026-10-10');
  await assert.rejects(appPortal.login(MOBILE, 'secret12'), /Invalid mobile number or password/);
  // A later unrelated save keeps it dismembered.
  const again = await banking.updateResource('members', ctx.member.id, { address: 'X' }, admin);
  assert.equal(again.dismembered, true);
  assert.equal(again.status, 'Inactive');
});

test('member list: All lists everyone; Active and Branch-wise only current; Dismembered only those who left', async () => {
  const other = await banking.createResource('members', { name: `Status ${RUN} B`, branchCode: BRANCH, mobileNo: '9876511111', password: 'secret12' }, admin);
  const codes = async (listType) => (await banking.buildAllMemberListReport({ branchCode: BRANCH, listType })).map((r) => r.code).sort();
  assert.deepEqual(await codes('all'), [ctx.member.code, other.code].sort());
  assert.deepEqual(await codes('active'), [other.code]);
  assert.deepEqual(await codes('branch'), [other.code]);
  assert.deepEqual(await codes('dismembered'), [ctx.member.code]);

  // By the selected FY: the member left on 2026-10-10.
  const inFy = async (listType, fromDate, uptoDate) => (await banking.buildAllMemberListReport({ branchCode: BRANCH, listType, fromDate, uptoDate })).map((r) => r.code).sort();
  assert.deepEqual(await inFy('dismembered', '2026-04-01', '2027-03-31'), [ctx.member.code], 'left in FY 2026-27');
  assert.deepEqual(await inFy('dismembered', '2025-04-01', '2026-03-31'), [], 'not in FY 2025-26');
  assert.deepEqual(await inFy('active', '2025-04-01', '2026-03-31'), [ctx.member.code, other.code].sort(), 'still a member at the end of FY 2025-26');
  assert.deepEqual(await inFy('active', '2026-04-01', '2027-03-31'), [other.code]);
});

test('member list: All for a legacy FY lists only that FY\'s legacy roster (plus app members)', async () => {
  const legacy = { sourceType: 'LEGACY_CUTOVER', sourceDatabase: 'JilaSahkariDB9091' };
  const kept = await Member.create({ code: `${RUN}K`, name: `Roster ${RUN} K`, branchCode: BRANCH, status: 'INACTIVE', payload: legacy });
  const dropped = await Member.create({ code: `${RUN}X`, name: `Roster ${RUN} X`, branchCode: BRANCH, status: 'INACTIVE', dismembered: true, dismemberedDate: '2089-05-01', payload: legacy });
  const database = await initializeDatabase();
  await database.query(
    `INSERT INTO legacy_historical_member_openings (id, "createdAt", "updatedAt", "sourceDatabase", "sourceTable", "sourceKey", "memberCode", "fyStart", payload)
     VALUES (gen_random_uuid(), now(), now(), 'JilaSahkariDB9091', 'MstAccountMaster', $1, $1, '2090-04-01', '{}')`,
    [kept.code]
  );
  try {
    const all = (await banking.buildAllMemberListReport({ branchCode: BRANCH, listType: 'all', fromDate: '2090-04-01', uptoDate: '2091-03-31' })).map((r) => r.code);
    assert.ok(all.includes(kept.code), 'on the FY roster');
    assert.ok(!all.includes(dropped.code), 'dropped at an earlier year end');
    assert.ok(all.includes(ctx.member.code), 'app-made members are always listed');
  } finally {
    await database.query(`DELETE FROM legacy_historical_member_openings WHERE "sourceDatabase" = 'JilaSahkariDB9091'`);
    await Member.deleteMany({ code: { $in: [kept.code, dropped.code] } });
  }
});

test('member list: All for a FY after legacy drops members who left earlier with nothing left', async () => {
  const left = await banking.createResource('members', { name: `Nil ${RUN} L`, branchCode: BRANCH, mobileNo: '9876522222', password: 'secret12' }, admin);
  await banking.updateResource('members', left.id, { dismembered: true, dismemberedDate: '2095-06-01' }, admin);
  const stays = await banking.createResource('members', { name: `Nil ${RUN} A`, branchCode: BRANCH, mobileNo: '9876533333', password: 'secret12' }, admin);
  const all = async (fromDate, uptoDate) => (await banking.buildAllMemberListReport({ branchCode: BRANCH, listType: 'all', fromDate, uptoDate })).map((r) => r.code);
  let entry = null;
  try {
    const leftYear = await all('2095-04-01', '2096-03-31');
    assert.ok(leftYear.includes(left.code), 'still listed in the FY they left');
    const next = await all('2096-04-01', '2097-03-31');
    assert.ok(!next.includes(left.code), 'gone the next FY: left before 1 April with a nil balance');
    assert.ok(next.includes(stays.code), 'an active member with a nil balance stays');

    // The same in the member list, the pickers and the no-interest list.
    const fy = (y) => ({ fyStart: `${y}-04-01`, fyEnd: `${y + 1}-03-31` });
    const listed = async (y) => (await banking.listResource('members', '', {}, fy(y))).map((m) => m.code);
    assert.ok((await listed(2095)).includes(left.code));
    assert.ok(!(await listed(2096)).includes(left.code));
    const lookups = await banking.getLookups({}, fy(2096));
    assert.equal(lookups.members.find((m) => m.code === left.code)?.inFy, false, 'kept for names, not offered');
    assert.equal(lookups.members.find((m) => m.code === stays.code)?.inFy, true);
    entry = await NoInterestMember.create({ code: `${RUN}NI`, memberCode: left.code, status: 'Active', fromDate: '2095-04-01' });
    const entries = async (y) => (await banking.listResource('noInterestMembers', '', {}, fy(y))).filter((e) => e.code === entry.code);
    assert.equal((await entries(2095))[0]?.memberName, left.name, 'the entry carries its member\'s name');
    assert.equal((await entries(2096)).length, 0, 'hidden with its member');
  } finally {
    if (entry) await NoInterestMember.deleteMany({ code: entry.code });
    await Member.deleteMany({ code: { $in: [left.code, stays.code] } });
  }
});

test('a test member (payload.testAccount) signs in to the app but is in no list, picker or report', async () => {
  const mobile = '9999999990';
  const member = await banking.createResource('members', { name: `Test ${RUN}`, branchCode: BRANCH, mobileNo: mobile, password: 'secret12', status: 'ACTIVE' }, admin);
  await Member.updateOne({ code: member.code }, { $set: { payload: { testAccount: true } } });
  try {
    const fy = { fyStart: '2026-04-01', fyEnd: '2027-03-31' };
    const codes = (rows) => rows.map((r) => r.code || r.memberCode);
    assert.ok(!codes(await banking.listResource('members', '', {}, fy)).includes(member.code), 'members list');
    assert.ok(!codes(await banking.listResource('members', '', {}, {})).includes(member.code), 'members list without a FY');
    assert.ok(!codes((await banking.getLookups({}, fy)).members).includes(member.code), 'lookups');
    for (const listType of ['all', 'active', 'branch']) {
      assert.ok(!codes(await banking.buildAllMemberListReport({ branchCode: BRANCH, listType, fromDate: fy.fyStart, uptoDate: fy.fyEnd })).includes(member.code), listType);
    }
    const closing = await banking.buildAccountStatementReport({ type: 'members-closing-balance', branchCode: BRANCH, dateFrom: fy.fyStart, dateTo: fy.fyEnd });
    assert.ok(!JSON.stringify(closing).includes(member.code), 'closing balance report');
    assert.ok((await appPortal.login(mobile, 'secret12')).token, 'the app login still works');
  } finally {
    await Member.deleteMany({ code: member.code });
  }
});

test('undoing the dismemberment makes the member Active again and lets them sign in', async () => {
  const updated = await banking.updateResource('members', ctx.member.id, { dismembered: false, status: 'Active' }, admin);
  assert.equal(updated.dismembered, false);
  assert.equal(updated.dismemberedDate, null);
  assert.equal(updated.status, 'Active');
  assert.ok((await appPortal.login(MOBILE, 'secret12')).token);
  assert.ok(await Member.findOne({ code: ctx.member.code }).lean());
});

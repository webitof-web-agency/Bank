// A dismembered member can join again only from the next financial year
// (1 April after the year they left), whether as a new member record with
// the same PF / name + date of birth, or by reactivating the old record.
// A PF can belong to only one current member. Rows are this file's own and
// hard-deleted at the end.
const test = require('node:test');
const assert = require('node:assert/strict');
const banking = require('../services/banking.service');
const { Member, Branch } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const RUN = `J${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const BRANCH = `${RUN}B`;
const code = (n) => `${RUN}M${n}`;
const PF = (n) => `${RUN}${n}`;
const admin = { actorUser: { isSuperAdmin: true } };
// The current FY (the rule is about the year the member left in).
const today = new Date().toISOString().slice(0, 10);
const fyStart = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
const thisFyDate = `${fyStart}-04-02`;
const nextFyDate = `${fyStart + 1}-04-01`;

test.after(async () => {
  const db = await initializeDatabase();
  await db.query('DELETE FROM members WHERE code LIKE $1', [`${RUN}%`]);
  await db.query('DELETE FROM branches WHERE code = $1', [BRANCH]);
  if (closeDatabase) await closeDatabase();
});

test('setup', async () => {
  await initializeDatabase();
  await Branch.create({ code: BRANCH, label: 'REJOIN TEST' });
  // Left this FY.
  await Member.create({ code: code(1), name: 'Left This Year', branchCode: BRANCH, status: 'INACTIVE', dismembered: true, dismemberedDate: thisFyDate, membershipDate: '2015-04-01', pfNo: PF(1), dateOfBirth: '1970-01-01' });
  // Left in an earlier FY.
  await Member.create({ code: code(2), name: 'Left Before', branchCode: BRANCH, status: 'INACTIVE', dismembered: true, dismemberedDate: `${fyStart - 2}-03-13`, membershipDate: '2011-06-16', pfNo: PF(2) });
  // Current member.
  await Member.create({ code: code(3), name: 'Still Here', branchCode: BRANCH, status: 'ACTIVE', membershipDate: '2018-04-01', pfNo: PF(3) });
  // Left this FY, no PF: matched by name + date of birth.
  await Member.create({ code: code(4), name: 'No  Pf  Person', branchCode: BRANCH, status: 'INACTIVE', dismembered: true, dismemberedDate: thisFyDate, membershipDate: '2016-04-01', dateOfBirth: '1980-05-05' });
});

test('joining again in the same FY as leaving is refused, with the date it is allowed from', async () => {
  await assert.rejects(
    banking.assertMemberRejoinAllowed({ code: code(9), name: 'Left This Year', pfNo: PF(1), membershipDate: today, status: 'Active' }),
    (error) => error.statusCode === 409 && new RegExp(`${code(1)}`).test(error.message) && new RegExp(`01-04-${fyStart + 1}`).test(error.message)
  );
  // Through the normal create: refused before anything is written.
  await assert.rejects(banking.createResource('members', { name: 'Left This Year', branchCode: BRANCH, pfNo: PF(1), membershipDate: today, mobileNo: '9876500001', password: 'secret12' }, admin), /next financial year|01-04-/);
  assert.equal((await Member.find({ pfNo: PF(1) }).lean()).length, 1);
  // Matched by name + date of birth when the PF is not given.
  await assert.rejects(banking.assertMemberRejoinAllowed({ code: code(9), name: 'no pf person', dateOfBirth: '1980-05-05', membershipDate: today, status: 'Active' }), /next financial year/);
});

test('joining again from the next FY, or after leaving in an earlier FY, is allowed', async () => {
  await banking.assertMemberRejoinAllowed({ code: code(9), name: 'Left This Year', pfNo: PF(1), membershipDate: nextFyDate, status: 'Active' });
  await banking.assertMemberRejoinAllowed({ code: code(9), name: 'Left Before', pfNo: PF(2), membershipDate: today, status: 'Active' });
  // A new member that is itself not current (entered as dismembered) is not checked.
  await banking.assertMemberRejoinAllowed({ code: code(9), name: 'Left This Year', pfNo: PF(1), membershipDate: today, dismembered: true, status: 'Inactive' });
});

test('a PF already held by a current member is refused', async () => {
  await assert.rejects(banking.assertMemberRejoinAllowed({ code: code(9), name: 'Someone Else', pfNo: PF(3), membershipDate: today, status: 'Active' }), new RegExp(`already used by member ${code(3)}`));
  // The member itself (an edit) is fine.
  await banking.assertMemberRejoinAllowed({ code: code(3), name: 'Still Here', pfNo: PF(3), membershipDate: '2018-04-01', status: 'Active' });
});

test('reactivating a member dismembered this FY is refused; one who left in an earlier FY may be reactivated', async () => {
  const left = await Member.findOne({ code: code(1) }).lean();
  await assert.rejects(banking.updateResource('members', String(left.id || left._id), { name: 'Left This Year', branchCode: BRANCH, pfNo: PF(1), mobileNo: '9876500002', dismembered: false, status: 'Active' }, admin), /next financial year/);
  assert.equal((await Member.findOne({ code: code(1) }).lean()).dismembered, true);
  await banking.assertMemberRejoinAllowed({ code: code(2), name: 'Left Before', pfNo: PF(2), membershipDate: '2011-06-16', status: 'Active', dismembered: false }, { previous: await Member.findOne({ code: code(2) }).lean() });
});

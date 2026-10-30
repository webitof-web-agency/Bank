process.env.JWT_SECRET = process.env.JWT_SECRET || 'access-escalation-test-secret';
const assert = require('node:assert/strict');
const test = require('node:test');
const { initializeDatabase, closeDatabase } = require('../config/postgres');
const Role = require('../models/role.model');
const User = require('../models/user.model');
const { Member, Society } = require('../models/banking.models');
const FileAsset = require('../models/fileAsset.model');
const auth = require('../services/auth.service');
const banking = require('../services/banking.service');

// Fresh codes every run: soft-deleted rows keep their unique values.
const RUN = String(Date.now()).slice(-7);
const ctx = {};

const mobile = (n) => `9${RUN}${String(n).padStart(2, '0')}`;
const actor = (user, permissions) => ({ id: String(user.id), isSuperAdmin: false, permissions });
const forbidden = { statusCode: 403 };

test.after(async () => { await closeDatabase(); });

test('setup', async () => {
  await initializeDatabase();
  const role = (suffix, permissions) => Role.create({ code: `esc-${suffix}-${RUN}`, name: `Esc ${suffix} ${RUN}`, permissions });
  ctx.clerkRole = await role('clerk', ['master.employees.view', 'master.employees.edit']);
  ctx.managerRole = await role('manager', ['admin.users.view', 'admin.users.edit', 'master.employees.view', 'master.employees.edit', 'admin.roles.edit']);
  ctx.powerRole = await role('power', ['admin.users.edit', 'admin.settings.edit']);
  const user = (n, roles) => auth.createUser({
    fullName: `Esc User ${n} ${RUN}`, username: `esc${n}.${RUN}`, email: `esc${n}.${RUN}@bank.local`,
    password: 'Esc@123456', mobileNo: mobile(n), roleIds: roles.map((r) => String(r._id))
  });
  ctx.clerk = await user(1, [ctx.clerkRole]);
  ctx.manager = await user(2, [ctx.managerRole]);
  ctx.power = await user(3, [ctx.powerRole]);
  ctx.plain = await user(4, []);
});

test('employees-page access edits HR details but not roles, password or login', async () => {
  const clerk = actor(ctx.clerk, ['master.employees.view', 'master.employees.edit']);
  await auth.updateUser(ctx.plain.id, { designation: 'Clerk', roleIds: [] }, { actorUser: clerk });
  // The form always sends the roles back: unchanged roles are not a change.
  await auth.updateUser(ctx.manager.id, { designation: 'Officer', roleIds: [String(ctx.managerRole._id)], email: `esc2.${RUN}@bank.local`, status: 'Active' }, { actorUser: clerk });
  await assert.rejects(auth.updateUser(ctx.clerk.id, { roleIds: [String(ctx.managerRole._id)] }, { actorUser: clerk }), forbidden);
  await assert.rejects(auth.updateUser(ctx.plain.id, { password: 'Taken@12345' }, { actorUser: clerk }), forbidden);
  await assert.rejects(auth.updateUser(ctx.plain.id, { email: `taken.${RUN}@evil.test` }, { actorUser: clerk }), forbidden);
});

test('a user manager grants only roles within their own access, never to themselves', async () => {
  const manager = actor(ctx.manager, ['admin.users.view', 'admin.users.edit', 'master.employees.view', 'master.employees.edit', 'admin.roles.edit']);
  await auth.updateUser(ctx.plain.id, { roleIds: [String(ctx.clerkRole._id)] }, { actorUser: manager });
  await assert.rejects(auth.updateUser(ctx.plain.id, { roleIds: [String(ctx.powerRole._id)] }, { actorUser: manager }), forbidden);
  await assert.rejects(auth.updateUser(ctx.manager.id, { roleIds: [String(ctx.managerRole._id), String(ctx.clerkRole._id)] }, { actorUser: manager }), forbidden);
  // An account with more access than the manager's can't be taken over.
  await assert.rejects(auth.updateUser(ctx.power.id, { password: 'Taken@12345' }, { actorUser: manager }), forbidden);
  await assert.rejects(auth.deleteUser(ctx.power.id, { actorUser: manager }), forbidden);
  // ...nor demoted.
  await assert.rejects(auth.updateUser(ctx.power.id, { roleIds: [] }, { actorUser: manager }), forbidden);
});

test('a role you hold, or one with more access than yours, cannot be deleted', async () => {
  const manager = actor(ctx.manager, ['admin.roles.delete', 'admin.users.edit']);
  await assert.rejects(auth.deleteRole(String(ctx.managerRole._id), { actorUser: manager }), forbidden);
  await assert.rejects(auth.deleteRole(String(ctx.powerRole._id), { actorUser: manager }), forbidden);
});

test('a record can only be pointed at files the editor uploaded (or already its own)', async () => {
  const other = await FileAsset.create({ originalName: `kyc-${RUN}.pdf`, mimeType: 'application/pdf', storageKey: `test/kyc-${RUN}.pdf`, createdBy: String(ctx.power.id) });
  const mine = await FileAsset.create({ originalName: `mine-${RUN}.png`, mimeType: 'image/png', storageKey: `test/mine-${RUN}.png`, createdBy: String(ctx.clerk.id) });
  const clerk = actor(ctx.clerk, ['master.employees.view', 'master.employees.edit']);
  await assert.rejects(auth.updateUser(ctx.plain.id, { avatarFileId: String(other.id) }, { actorUser: clerk }), forbidden);
  await assert.rejects(auth.updateUser(ctx.plain.id, { documents: { pan: { fileId: String(other.id) } } }, { actorUser: clerk }), forbidden);
  await auth.updateUser(ctx.plain.id, { avatarFileId: String(mine.id) }, { actorUser: clerk });
  // Saving the same record again keeps its own file.
  await auth.updateUser(ctx.plain.id, { avatarFileId: String(mine.id), designation: 'Clerk II' }, { actorUser: clerk });
  // A file id hidden in a *Url field counts as attaching that file.
  await assert.rejects(auth.updateUser(ctx.plain.id, { avatarUrl: `/api/files/${other.id}/view` }, { actorUser: clerk }), forbidden);

  // The society's logo, uploaded by someone else, doesn't block saving it.
  const society = await Society.findOne({ key: 'default' }).lean();
  if (society) {
    await Society.updateOne({ key: 'default' }, { $set: { logoFileId: String(other.id) } });
    try {
      await banking.updateResource('society', null, { ...society, logoFileId: String(other.id) }, { actorUser: clerk, actorUserId: String(ctx.clerk.id) });
    } finally {
      await Society.updateOne({ key: 'default' }, { $set: { logoFileId: society.logoFileId || null } });
    }
  }
  await FileAsset.deleteMany({ _id: { $in: [other.id, mine.id] } });
});

test('roles: no editing a role you hold, no permission you lack', async () => {
  const manager = actor(ctx.manager, ['admin.users.view', 'admin.users.edit', 'master.employees.view', 'master.employees.edit', 'admin.roles.edit']);
  await assert.rejects(auth.updateRolePermissions(String(ctx.managerRole._id), ['admin.settings.edit'], { actorUser: manager }), forbidden);
  await assert.rejects(auth.updateRolePermissions(String(ctx.clerkRole._id), ['admin.settings.edit'], { actorUser: manager }), forbidden);
  await assert.rejects(auth.createRole({ name: `Esc new ${RUN}`, permissions: ['admin.settings.edit'] }, { actorUser: manager }), forbidden);
  await auth.updateRolePermissions(String(ctx.clerkRole._id), ['master.employees.edit'], { actorUser: manager });
});

test('the audit log never returns password hashes', async () => {
  await auth.updateUser(ctx.plain.id, { password: 'Changed@12345' });
  const { rows } = await banking.listAuditLog({ tableName: 'users', recordId: ctx.plain.id, pageSize: 200 });
  assert.ok(rows.length, 'the change was logged');
  const text = JSON.stringify(rows.map((row) => row.changes));
  assert.doesNotMatch(text, /\$2[aby]\$/);
  assert.match(text, /\[redacted\]/);
});

test('a member edit can neither hide a member nor unlock its legacy opening balances', async () => {
  const admin = { actorUser: { isSuperAdmin: true } };
  const created = await banking.createResource('members', { name: `Esc Member ${RUN}`, branchCode: 'HO', mobileNo: mobile(9), password: 'secret12', payload: { testAccount: true } }, admin);
  let stored = await Member.findById(created.id).lean();
  assert.equal(stored.payload?.testAccount, undefined, 'not settable on create');

  await Member.updateOne({ _id: created.id }, { $set: { payload: { sourceType: 'LEGACY_CUTOVER', note: 'kept' } } });
  await banking.updateResource('members', created.id, { mobileNo: mobile(9), payload: { testAccount: true, note: 'edited' } }, admin);
  stored = await Member.findById(created.id).lean();
  assert.equal(stored.payload.sourceType, 'LEGACY_CUTOVER', 'cutover marker survives');
  assert.equal(stored.payload.testAccount, undefined, 'not settable on update');
  assert.equal(stored.payload.note, 'edited', 'ordinary keys still edit');
  await Member.deleteMany({ _id: created.id });
});

test('cleanup', async () => {
  for (const user of [ctx.clerk, ctx.manager, ctx.power, ctx.plain]) await User.deleteMany({ _id: user.id });
  await Role.deleteMany({ code: { $in: ['clerk', 'manager', 'power'].map((s) => `esc-${s}-${RUN}`) } });
});

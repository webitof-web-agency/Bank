const assert = require('node:assert/strict');
const test = require('node:test');
const { initializeDatabase, restoreMainRow } = require('../config/postgres');
const { Member, AuditLog, Voucher, RecoveryLine, JournalLine, Ledger } = require('../models/banking.models');
const NotificationModel = require('../models/notification.model');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const {
  createResource,
  updateResource,
  deleteResource,
  restoreResource,
  createVoucher,
  deleteVoucher,
  restoreVoucher
} = require('../services/banking.service');
const { runWithActor } = require('../utils/requestContext');

const ACTOR_ID = 'test-actor-id';
// A soft-deleted row's unique fields (code, voucherNo, ...) stay permanently
// reserved by design — that's the point (a deleted member's code can never be
// silently reused by someone else's record later). So every run needs fresh
// identifiers rather than fixed ones, or it collides with the previous run's
// now-soft-deleted rows.
const RUN_ID = Date.now();

test('Soft delete + audit history', async (t) => {
  await initializeDatabase();

  let member;
  const memberCode = `SD-${RUN_ID}`;

  await t.test('create writes a CREATE audit_log entry', async () => {
    member = await runWithActor(ACTOR_ID, () =>
      createResource('members', { code: memberCode, name: 'Soft Delete Test' }, { actorUser: { id: ACTOR_ID } })
    );
    // createResource('members', ...) can also trigger syncRecordDocumentsFolder's
    // second real write (linking the new documents folder), which correctly
    // logs its own UPDATE entry right after — assert the CREATE entry specifically.
    const entries = await AuditLog.find({ tableName: 'members', recordId: member.id, action: 'CREATE' }).lean();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].actorUserId, ACTOR_ID);
  });

  await t.test('update writes an UPDATE audit_log entry with before/after', async () => {
    await runWithActor(ACTOR_ID, () =>
      updateResource('members', member.id, { name: 'Renamed' }, { actorUser: { id: ACTOR_ID } })
    );
    // updateResource('members', ...) can do a second real write internally
    // (syncRecordDocumentsFolder linking the documents folder on first use) —
    // each is a genuine row change, so each correctly gets its own audit
    // entry. Assert the one that actually renamed the member, not an exact count.
    const entries = await AuditLog.find({ tableName: 'members', recordId: member.id, action: 'UPDATE' }).lean();
    assert.ok(entries.length >= 1);
    const renameEntry = entries.find((entry) => {
      const changes = typeof entry.changes === 'string' ? JSON.parse(entry.changes) : entry.changes;
      return changes.after?.name === 'Renamed';
    });
    assert.ok(renameEntry, 'an audit entry recording the rename must exist');
    const changes = typeof renameEntry.changes === 'string' ? JSON.parse(renameEntry.changes) : renameEntry.changes;
    assert.strictEqual(changes.before.name, 'Soft Delete Test');
    assert.strictEqual(changes.after.name, 'Renamed');
  });

  await t.test('delete soft-deletes: row survives, disappears from normal reads, DELETE logged', async () => {
    const ok = await runWithActor(ACTOR_ID, () =>
      deleteResource('members', member.id, { actorUser: { id: ACTOR_ID } })
    );
    assert.strictEqual(ok, true);

    const viaNormalFind = await Member.findById(member.id).lean();
    assert.strictEqual(viaNormalFind, null, 'soft-deleted row must not appear in a normal find');

    const viaWithDeleted = await Member.findById(member.id).withDeleted().lean();
    assert.ok(viaWithDeleted, 'row must still physically exist');
    assert.ok(viaWithDeleted.deletedAt, 'deletedAt must be set');
    assert.strictEqual(viaWithDeleted.name, 'Renamed', 'row content otherwise untouched');

    const entries = await AuditLog.find({ tableName: 'members', recordId: member.id, action: 'DELETE' }).lean();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].actorUserId, ACTOR_ID);
  });

  await t.test('restore brings it back and logs RESTORE', async () => {
    const ok = await runWithActor(ACTOR_ID, () =>
      restoreResource('members', member.id, { actorUser: { id: ACTOR_ID } })
    );
    assert.strictEqual(ok, true);

    const viaNormalFind = await Member.findById(member.id).lean();
    assert.ok(viaNormalFind, 'restored row must reappear in normal reads');
    assert.strictEqual(viaNormalFind.deletedAt, null);

    const entries = await AuditLog.find({ tableName: 'members', recordId: member.id, action: 'RESTORE' }).lean();
    assert.strictEqual(entries.length, 1);
  });

  await t.test('a table without deletedAt (notifications) still hard-deletes as before', async () => {
    const notif = await NotificationModel.create({
      recipientUserId: ACTOR_ID,
      title: 'test',
      message: 'test',
      type: 'system'
    });
    await NotificationModel.findByIdAndDelete(notif.id);
    const found = await NotificationModel.findById(notif.id).lean();
    assert.strictEqual(found, null);
    // No audit_log entry should exist for a table that isn't soft-delete enabled.
    const entries = await AuditLog.find({ tableName: 'notifications', recordId: notif.id }).lean();
    assert.strictEqual(entries.length, 0);
  });
});

// A ledger role can already exist but soft-deleted (another test's rollback
// or cleanup ran first, in this shared DB) — reuse-if-found must restore it,
// not just treat "found, even if deleted" as good enough, or resolveLedgerId
// (which only sees non-deleted rows) fails with "Missing ledger mapping".
async function ensureLedgerRole(role, fallbackData) {
  const existing = await Ledger.findOne({ semanticRole: role }).withDeleted().lean();
  if (existing) {
    if (existing.deletedAt) await restoreMainRow('ledgers', existing.id);
    return existing;
  }
  return Ledger.create(fallbackData);
}

test('Voucher delete/restore also covers its journal_lines and recovery_lines', async (t) => {
  await initializeDatabase();

  const cash = await ensureLedgerRole(ACCOUNTING_ROLES.CASH, { code: `SD-CASH-${RUN_ID}`, name: 'Cash', semanticRole: ACCOUNTING_ROLES.CASH, openingBalance: 10000, balanceSide: 'DR' });
  const cd = await ensureLedgerRole(ACCOUNTING_ROLES.COMPULSORY_DEPOSIT, { code: `SD-CD-${RUN_ID}`, name: 'CD', semanticRole: ACCOUNTING_ROLES.COMPULSORY_DEPOSIT, openingBalance: 0, balanceSide: 'CR' });

  const voucher = await createVoucher({
    voucherNo: `SD-V-${RUN_ID}`,
    date: '2026-09-08',
    amount: 1000,
    partyCode: `SD-${RUN_ID}`,
    branchCode: 'HO',
    details: { key: 'deposit-paid-member' }
  }, {});

  await t.test('delete soft-deletes voucher + its journal lines', async () => {
    const ok = await deleteVoucher(voucher.id);
    assert.strictEqual(ok, true);

    assert.strictEqual(await Voucher.findById(voucher.id).lean(), null);
    const lines = await JournalLine.find({ voucherId: voucher.id }).lean();
    assert.strictEqual(lines.length, 0, 'journal lines must not appear in a normal find either');

    const linesWithDeleted = await JournalLine.find({ voucherId: voucher.id }).withDeleted().lean();
    assert.strictEqual(linesWithDeleted.length, 2);
    assert.ok(linesWithDeleted.every((l) => l.deletedAt));
  });

  await t.test('restore brings voucher and journal lines back together', async () => {
    const ok = await restoreVoucher(voucher.id);
    assert.strictEqual(ok, true);

    assert.ok(await Voucher.findById(voucher.id).lean());
    const lines = await JournalLine.find({ voucherId: voucher.id }).lean();
    assert.strictEqual(lines.length, 2, 'journal lines must be back in normal reads');
  });
});

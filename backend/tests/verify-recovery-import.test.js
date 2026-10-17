// The old direct batch post (one voucher per Excel row, dated today, to
// cash) is retired: an imported Excel is only an input to the Recovery entry
// screen, which saves the whole batch as ONE recovery voucher.
const test = require('node:test');
const assert = require('node:assert');
const { postBatch } = require('../services/recoveryImport.service');
const { Voucher } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

test.after(async () => { if (closeDatabase) await closeDatabase(); });

test('posting an Excel batch directly is refused (410) and creates no voucher', async () => {
  await initializeDatabase();
  const before = (await Voucher.find({}).lean()).length;
  await assert.rejects(postBatch('any-batch-id'), (error) => error.statusCode === 410 && /no longer supported/.test(error.message));
  assert.strictEqual((await Voucher.find({}).lean()).length, before);
});

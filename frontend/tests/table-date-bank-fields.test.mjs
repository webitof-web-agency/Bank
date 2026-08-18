import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('table dates render without a time component in a consistent format', async () => {
  const dateUtils = await import('../src/utils/date.js').catch(() => ({}));

  assert.equal(typeof dateUtils.formatDateOnly, 'function');
  assert.equal(dateUtils.formatDateOnly('2026-07-14T00:00:00.000Z'), '14 Jul 2026');
  assert.equal(dateUtils.formatDateOnly('2026-07-02'), '02 Jul 2026');
  assert.equal(dateUtils.isDateOnlyColumn({ key: 'createdAt', label: 'Received' }), true);
  assert.equal(dateUtils.isDateOnlyColumn({ key: 'col_1', label: 'Date' }), true);
  assert.equal(dateUtils.isDateOnlyColumn({ key: 'amount', label: 'Amount' }), false);
});

test('the shared table formats date columns centrally', async () => {
  const source = await readFile('src/components/ui/Table.jsx', 'utf8');
  assert.match(source, /isDateOnlyColumn/);
  assert.match(source, /formatDateOnly\(row\[col\.key\]\)/);
});

test('bank voucher payloads strip settlement account fields', async () => {
  const source = await readFile('src/pages/transactions/bank/transactionUtils.js', 'utf8');
  assert.match(source, /delete details\.settlementAccount/);
  assert.match(source, /delete details\.fixedSettlement/);
  assert.match(source, /delete details\.fromAccount/);
  assert.match(source, /delete details\.toAccount/);
  assert.match(source, /delete details\.fixedFrom/);
  assert.match(source, /delete details\.fixedTo/);
});

test('bank subpages use cheque labels and contain no settlement account UI', async () => {
  const files = [
    'src/pages/transactions/bank/form.jsx',
    'src/pages/transactions/bank/index.jsx',
    'src/pages/transactions/bank/workspace.jsx',
    'src/pages/transactions/bank/detail.jsx',
    'src/pages/transactions/bank/workspaceDetail.jsx'
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const combined = sources.join('\n');

  assert.doesNotMatch(combined, /Settlement Account|Settlement A\/c|Fixed Settlement/);
  assert.doesNotMatch(combined, /From Account|To Account|Fixed From|Fixed To/);
  assert.doesNotMatch(combined, /Instrument No\.?|Instrument Date|Reference \/ Instrument|Instrument \/ Ref/);
  assert.match(sources[0], /Cheque No\.?/);
  assert.match(sources[0], /Cheque Date/);
});

test('Deposit In offers only Cash Credit and Saving accounts', async () => {
  const source = await readFile('src/pages/transactions/bank/form.jsx', 'utf8');
  const optionsBlock = source.match(/const BANK_DEPOSIT_IN_OPTIONS = \[([\s\S]*?)\];/)?.[1] || '';

  assert.doesNotMatch(optionsBlock, /Cash-in-hand|L001/);
  assert.match(optionsBlock, /value: 'L002', label: 'Cash Credit A\/c'/);
  assert.match(optionsBlock, /value: 'L013', label: 'Saving A\/c'/);
  assert.equal((optionsBlock.match(/value:/g) || []).length, 2);
});

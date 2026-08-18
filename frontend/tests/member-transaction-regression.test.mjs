import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let transactionUtils;
let transferVoucherUtils;
let vite;

before(async () => {
  vite = await createServer({
    appType: 'custom',
    configFile: false,
    server: { hmr: false, middlewareMode: true }
  });
  transactionUtils = await vite.ssrLoadModule('/src/pages/transactions/member/transactionUtils.js');
  transferVoucherUtils = await vite.ssrLoadModule('/src/pages/transactions/transfer-voucher/transactionUtils.js');
});

after(async () => {
  await vite?.close();
});

test('blank transaction detail values render as a dash', () => {
  assert.equal(transactionUtils.formatTransactionDisplayValue(''), '—');
  assert.equal(transactionUtils.formatTransactionDisplayValue(null), '—');
  assert.equal(transactionUtils.formatTransactionDisplayValue('Ledger 1'), 'Ledger 1');
});

test('member transaction drafts do not contain voucher status or account head', () => {
  const draft = transactionUtils.createEmptyTransactionDraft('member', [
    { key: 'deposit-paid-member', label: 'Compulsory Deposit Paid to Member' }
  ]);

  assert.equal(Object.hasOwn(draft, 'status'), false);
  assert.equal(Object.hasOwn(draft.details, 'accountHead'), false);
});

test('member voucher payload strips legacy status and account head values', () => {
  const payload = transactionUtils.buildTransactionVoucherPayload({
    date: '2026-08-12',
    voucherCategory: 'Compulsory Deposit Paid to Member',
    transactionType: 'payment',
    partyType: 'member',
    partyCode: 'M0006',
    amount: 10000,
    status: 'Draft',
    details: {
      key: 'deposit-paid-member',
      accountHead: 'Legacy deposit head'
    }
  });

  assert.equal(Object.hasOwn(payload, 'status'), false);
  assert.equal(Object.hasOwn(payload.details, 'accountHead'), false);
});

test('recovery line additions keep the selected member across repeated entries', () => {
  let draftLine = {
    member: 'M0004',
    heads: { suspense: '1', admfee: '2', share: '3', cd: '4', ssa: '5', loan: '6', lad: '7', ins: '8' }
  };

  for (let addition = 0; addition < 3; addition += 1) {
    draftLine = transactionUtils.createNextRecoveryLineDraft(draftLine);
  }

  assert.equal(draftLine.member, 'M0004');
  assert.deepEqual(draftLine.heads, {
    suspense: '',
    admfee: '',
    share: '',
    cd: '',
    ssa: '',
    loan: '',
    lad: '',
    ins: ''
  });
});

test('voucher transaction pages have no status or reversal workflow', async () => {
  const files = [];
  for (const area of ['bank', 'employee', 'member', 'receipt-interest', 'transfer-voucher']) {
    for await (const file of glob(`src/pages/transactions/${area}/**/*.{js,jsx}`)) {
      files.push(file);
    }
  }
  files.push('src/pages/transactions/supporting/transactionUtils.js');

  const forbidden = /(?:record|row|draft)\.status|StatusBadge|filterStatus|transactions\.reverse|reverseTransactionVoucher/;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, forbidden, file);
  }
});

test('account head is absent from member transaction forms and views', async () => {
  for (const file of [
    'src/pages/transactions/member/memberForm.jsx',
    'src/pages/transactions/member/detail.jsx'
  ]) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /accountHead|Account Head/, file);
  }
});

test('transfer voucher paid and recover workspaces use their full names in actions', async () => {
  const workspace = await readFile('src/pages/transactions/transfer-voucher/workspace.jsx', 'utf8');
  const detail = await readFile('src/pages/transactions/transfer-voucher/workspaceDetail.jsx', 'utf8');

  assert.match(workspace, /const transactionLabel = activeItem\?\.label \|\| 'Transfer Voucher'/);
  assert.match(workspace, /title=\{`\$\{activeRecord \? 'Edit' : 'Create'\} \$\{transactionLabel\}`\}/);
  assert.match(workspace, /title=\{`Delete \$\{transactionLabel\}`\}/);
  assert.doesNotMatch(workspace, /title=\{activeRecord \? 'Edit Transfer Voucher' : 'Create Transfer Voucher'\}/);

  assert.match(detail, /title=\{`Edit \$\{title\}`\}/);
  assert.match(detail, /title=\{`Delete \$\{title\}`\}/);
});

test('transfer voucher payment has exactly three Paid From accounts', async () => {
  const paidFrom = await import('../src/pages/transactions/transfer-voucher/paymentAccountOptions.js').catch(() => ({}));

  assert.deepEqual(paidFrom.TRANSFER_VOUCHER_PAID_FROM_OPTIONS, [
    { value: 'BA003', label: 'Cash-in-hand' },
    { value: 'BA002', label: 'Bank Saving A/c' },
    { value: 'BA001', label: 'Cash Credit A/c' }
  ]);
});

test('transfer voucher Payment filtering excludes Paid and Recover rows', () => {
  const rows = [
    { id: 'payment', voucherCategory: 'Payment', details: { key: 'transfer-voucher-payment' } },
    { id: 'paid', voucherCategory: 'Transfer Voucher Paid to Member', details: { key: 'transfer-voucher-paid' } },
    { id: 'recover', voucherCategory: 'Transfer Voucher Recover From Member', details: { key: 'transfer-voucher-recover' } }
  ];
  const paymentItems = [{ key: 'transfer-voucher-payment', label: 'Payment' }];

  assert.deepEqual(
    transferVoucherUtils.filterTransactionRows(rows, paymentItems, 'transfer-voucher').map((row) => row.id),
    ['payment']
  );
});

test('transfer voucher workspaces pass visible rows to the shared Table data prop', async () => {
  for (const file of [
    'src/pages/transactions/transfer-voucher/workspace.jsx',
    'src/pages/transactions/transfer-voucher/paymentWorkspace.jsx'
  ]) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /<Table[\s\S]*?data=\{visibleRows\}/, file);
    assert.doesNotMatch(source, /<Table[^>]*rows=\{visibleRows\}/, file);
  }
});

test('transfer voucher editor uses one scroll area with a fixed footer', async () => {
  for (const file of [
    'src/pages/transactions/transfer-voucher/workspace.jsx',
    'src/pages/transactions/transfer-voucher/workspaceDetail.jsx'
  ]) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /<Modal[\s\S]*?footer=\{/, file);
    assert.match(source, /width="min\(860px, 96vw\)"/, file);
    assert.doesNotMatch(source, /max-h-\[80vh\] overflow-y-auto/, file);
  }
});

test('transfer voucher allocations use compact amount and side rows', async () => {
  const source = await readFile('src/pages/transactions/transfer-voucher/form.jsx', 'utf8');
  const selectSource = await readFile('src/components/ui/Select.jsx', 'utf8');

  assert.match(source, /data-transfer-voucher-section="allocation"/);
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_112px\]/);
  assert.match(source, /ariaLabel=\{`Side for \$\{row\.label\}`\}/);
  assert.match(selectSource, /aria-label=\{ariaLabel\}/);
  assert.doesNotMatch(source, /key=\{row\.head\} className="grid gap-3 rounded-2xl border/);
});

test('frontend source contains no known mojibake markers', async () => {
  for await (const file of glob('src/**/*.{js,jsx,ts,tsx,css}')) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /Ã|Â|â|ð|�/, file);
  }
});

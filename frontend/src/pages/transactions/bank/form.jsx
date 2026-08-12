import { useEffect, useMemo } from 'react';
import {
  Banknote,
  Building2,
  CalendarDays,
  ChevronRight,
  FileText,
  Landmark,
  Layers3,
  Plus,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  WalletCards
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { DocumentSection } from '../../../components/master/DocumentSection';
import {
  formatTransactionAmount,
  getTransactionLedgerLabel,
  getTransactionPartyLabel
} from './transactionUtils';
import { toneClassName } from './transactionUtils';
import { getBankDocumentDefinitions } from './bankDocumentUtils';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function setPath(target, path, nextValue) {
  const parts = Array.isArray(path) ? path : String(path).split('.');
  let cursor = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[parts[parts.length - 1]] = nextValue;
}

function formatLookupLabel(item = {}) {
  return `${item.code || item.value || ''}${item.name || item.label ? ` - ${item.name || item.label}` : ''}`.trim();
}

function buildGroups(items = [], label = '') {
  const rows = (Array.isArray(items) ? items : []).filter(Boolean).map((item) => ({
    value: item.code || item.value || '',
    label: formatLookupLabel(item)
  })).filter((item) => item.value);

  return rows.length ? [{ label, items: rows }] : [];
}

function getLookupGroups(lookups = {}, partyType = '') {
  if (partyType === 'member') {
    return buildGroups(lookups.members, 'Members');
  }

  if (partyType === 'employee') {
    return buildGroups(lookups.employees, 'Employees');
  }

  if (partyType === 'bank') {
    return buildGroups(lookups.bankAccounts, 'Bank Accounts');
  }

  return [
    ...buildGroups(lookups.ledgers, 'Ledgers'),
    ...buildGroups(lookups.bankAccounts, 'Bank Accounts')
  ];
}

function getPartyTypeForKey(key = '') {
  const value = String(key || '').toLowerCase();
  if (!value) return 'ledger';
  if (value.includes('employee')) return 'employee';
  if (value.includes('member')) return 'member';
  if (value.includes('transfer-voucher') || value.includes('receipt-voucher') || value.includes('payment-voucher') || value.includes('demand-entry')) return 'ledger';
  if (value.includes('loan-recv') || value.includes('deposit-in-bank') || value.includes('cheque-issue') || value.includes('transfer-saving') || value.includes('transfer-cashcredit')) return 'ledger';
  return 'ledger';
}

function getSectionNotes(sectionKey = '', activeKey = '') {
  const key = String(activeKey || '').toLowerCase();
  if (key === 'loan-paid-member') return ['Choose member party, settlement ledger, and loan breakdown.'];
  if (key === 'recovery-member') return ['Recovery lines will be stored as structured rows.'];
  if (key === 'deposit-paid-member' || key === 'insurance-paid-member') return ['Use settlement and deposit/insurance references as needed.'];
  if (key === 'advance-paid-emp' || key === 'advance-recovery-emp') return ['Employee party selection is linked to master employee code.'];
  if (key === 'transfer-voucher-paid' || key === 'transfer-voucher-recover') return ['Transfer allocations stay in row format for backend posting.'];
  if (key === 'receipt-voucher' || key === 'interest-paid-member') return ['Receipt and interest entries use ledger/member lookup based on voucher type.'];
  if (key === 'payment-voucher') return ['General supporting payment voucher.'];
  if (sectionKey === 'bank') return ['Bank section vouchers can move between ledgers and bank accounts.'];
  return ['Maintain structured voucher details.'];
}

function OptionCard({ title, description, active = false, onClick, badge, tone = 'slate', icon: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active ? 'border-blue-300 bg-blue-50/70 shadow-sm ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${toneClassName(tone)}`}>
            {Icon ? <Icon size={18} strokeWidth={1.9} /> : <Layers3 size={18} strokeWidth={1.9} />}
          </div>
          <div>
            <div className="text-[14px] font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-[12px] leading-5 text-slate-500">{description}</div>
          </div>
        </div>
        {badge ? (
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClassName(tone)}`}>
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function SectionHeader({ title, description, icon: Icon }) {
  return (
    <div className="flex items-start gap-3">
      {Icon ? (
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
          <Icon size={20} strokeWidth={1.9} />
        </div>
      ) : null}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function FieldLabel({ children, required = false }) {
  return (
    <label className="text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

function LookupSelect({
  label,
  value,
  onChange,
  groups = [],
  placeholder = 'Select...',
  helper = '',
  required = false,
  disabled = false
}) {
  const flatOptions = useMemo(() => {
    const opts = [];
    groups.forEach((group) => {
      group.items.forEach((item) => {
        opts.push({
          label: group.label ? `${item.label} (${group.label})` : item.label,
          value: item.value
        });
      });
    });
    return opts;
  }, [groups]);

  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <CustomSelect 
        value={value || ''} 
        onChange={onChange} 
        disabled={disabled || !groups.length}
        placeholder={placeholder}
        options={flatOptions}
        searchable
      />
      {helper ? <p className="text-[12px] text-slate-500">{helper}</p> : null}
    </div>
  );
}

function ArrayRowsEditor({
  title,
  description,
  rows = [],
  onChange,
  fields = [],
  emptyRow = {},
  addLabel = 'Add Row',
  icon: Icon = FileText,
  rowTone = 'slate'
}) {
  const safeRows = Array.isArray(rows) ? rows : [];

  function updateRow(index, key, nextValue) {
    const next = safeRows.map((row, rowIndex) => (rowIndex === index ? { ...(row || {}), [key]: nextValue } : row));
    onChange(next);
  }

  function addRow() {
    onChange([...safeRows, deepClone(emptyRow)]);
  }

  function removeRow(index) {
    const next = safeRows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next);
  }

  return (
    <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      </div>

      <div className="mt-5 space-y-4">
        {safeRows.length ? safeRows.map((row, index) => (
          <div key={`${title}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${toneClassName(rowTone)}`}>
                Row {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={13} />
                Remove
              </button>
            </div>

            <div className={`grid gap-4 ${fields.length >= 4 ? 'md:grid-cols-4' : fields.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              {fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <FieldLabel>{field.label}</FieldLabel>
                  <Input
                    type={field.type || 'text'}
                    value={row?.[field.key] ?? ''}
                    onChange={(e) => updateRow(index, field.key, field.type === 'number' ? e.target.value : e.target.value)}
                    placeholder={field.placeholder || field.label}
                    step={field.step}
                    min={field.min}
                  />
                </div>
              ))}
            </div>
          </div>
        )) : null}

        {!safeRows.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-5 text-sm text-slate-500">
            No rows added yet. Use the button below to add structured entries.
          </div>
        ) : null}

        <div className="flex justify-start">
          <Button type="button" variant="outline" className="gap-2" onClick={addRow}>
            <Plus size={16} />
            {addLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function setDetailsValue(setValue, path, nextValue) {
  setValue((current) => {
    const next = deepClone(current);
    if (!next.details || typeof next.details !== 'object') {
      next.details = {};
    }
    setPath(next.details, path, nextValue);
    return next;
  });
}

function setRootValue(setValue, key, nextValue) {
  setValue((current) => ({
    ...(current || {}),
    [key]: nextValue
  }));
}

function selectTemplate(setValue, current, item) {
  const next = deepClone(current);
  next.voucherCategory = item?.label || next.voucherCategory || '';
  next.transactionType = item?.transactionType || next.transactionType || 'payment';
  next.accent = item?.accent || next.accent || 'neutral';
  next.mode = item?.mode || next.mode || '';
  next.partyType = getPartyTypeForKey(item?.key || next.details?.key || '');
  next.details = {
    ...(next.details || {}),
    key: item?.key || next.details?.key || '',
    settlementAccount: next.details?.settlementAccount || '',
    ledgerTarget: next.details?.ledgerTarget || '',
    receiptBy: next.details?.receiptBy || '',
    depositBy: next.details?.depositBy || '',
    depositIn: next.details?.depositIn || '',
    fromAccount: next.details?.fromAccount || '',
    toAccount: next.details?.toAccount || '',
    accountHead: next.details?.accountHead || '',
    components: {
      loanAmt: next.details?.components?.loanAmt ?? '',
      lad: next.details?.components?.lad ?? ''
    },
    recoveryLines: Array.isArray(next.details?.recoveryLines) ? next.details.recoveryLines : [],
    allocations: Array.isArray(next.details?.allocations) ? next.details.allocations : []
  };
  return next;
}

function getPartyGroupsForSelection(partyType, lookups) {
  return getLookupGroups(lookups, partyType);
}

const BANK_DEPOSIT_IN_OPTIONS = [
  { value: 'L001', label: 'Cash-in-hand' },
  { value: 'L002', label: 'Union Bank - CC A/c' },
  { value: 'L013', label: 'SBI - Saving A/c' }
];

const BANK_DEPOSIT_BY_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'TRANSFER', label: 'Bank Transfer' }
];

const BANK_TRANSFER_TYPE_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' }
];

function LedgerValue({ label, value }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
        {value || '-'}
      </div>
    </div>
  );
}

export function BankTransactionForm({ section, lookups = {}, value, setValue, onSubmit, onDocumentRemove }) {
  const draft = value || {};
  const editableItems = useMemo(() => (section?.items || []).filter((item) => !item.route), [section]);
  const activeKey = draft?.details?.key || editableItems[0]?.key || '';
  const activeItem = editableItems.find((item) => item.key === activeKey) || editableItems[0] || null;
  const documentDefs = getBankDocumentDefinitions(activeKey);
  const isLoanRecvCash = activeKey === 'loan-recv-cash';
  const isLoanRecvSaving = activeKey === 'loan-recv-saving';
  const isDepositInBank = activeKey === 'deposit-in-bank';
  const isChequeIssueSaving = activeKey === 'cheque-issue-saving';
  const isChequeIssueLoan = activeKey === 'cheque-issue-loan';
  const isTransferSaving = activeKey === 'transfer-saving';
  const isTransferCashCredit = activeKey === 'transfer-cashcredit';
  const bankAccountGroups = useMemo(() => buildGroups(lookups.bankAccounts, 'Bank Accounts'), [lookups.bankAccounts]);
  const ledgerGroups = useMemo(() => buildGroups(lookups.ledgers, 'Ledgers'), [lookups.ledgers]);
  const accountGroups = useMemo(() => [...ledgerGroups, ...bankAccountGroups], [ledgerGroups, bankAccountGroups]);

  useEffect(() => {
    if (!activeKey) return;
    setValue((current) => {
      const next = deepClone(current);
      if (!next.details || typeof next.details !== 'object') next.details = {};
      let changed = false;
      const setIfEmpty = (path, nextValue) => {
        const parts = Array.isArray(path) ? path : String(path).split('.');
        let cursor = next.details;
        for (let index = 0; index < parts.length - 1; index += 1) {
          const key = parts[index];
          if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
          cursor = cursor[key];
        }
        const lastKey = parts[parts.length - 1];
        if (cursor[lastKey] === '' || cursor[lastKey] == null) {
          cursor[lastKey] = nextValue;
          changed = true;
        }
      };

      if (!next.mode) {
        if (isLoanRecvCash) { next.mode = 'Cash / Credit'; changed = true; }
        else if (isLoanRecvSaving) { next.mode = 'Saving A/c'; changed = true; }
        else if (isDepositInBank) { next.mode = 'Bank Deposit'; changed = true; }
        else if (isChequeIssueSaving || isChequeIssueLoan) { next.mode = 'Cheque'; changed = true; }
        else if (isTransferSaving || isTransferCashCredit) { next.mode = 'Transfer'; changed = true; }
      }

      if (isLoanRecvCash) { setIfEmpty('fixedSettlement', 'L002'); }
      if (isLoanRecvSaving) { setIfEmpty('fixedSettlement', 'L013'); }
      if (isDepositInBank) {
        setIfEmpty('depositIn', 'L002');
        setIfEmpty('depositBy', 'CASH');
      }
      if (isChequeIssueSaving) { setIfEmpty('fixedSettlement', 'L013'); }
      if (isChequeIssueLoan) { setIfEmpty('fixedSettlement', 'L002'); }
      if (isTransferSaving) {
        setIfEmpty('fixedFrom', 'L002');
        setIfEmpty('fixedTo', 'L013');
        setIfEmpty('transferType', 'CASH');
      }
      if (isTransferCashCredit) {
        setIfEmpty('fixedFrom', 'L013');
        setIfEmpty('fixedTo', 'L002');
        setIfEmpty('transferType', 'CASH');
      }

      return changed ? next : current;
    });
  }, [activeKey, isChequeIssueLoan, isChequeIssueSaving, isDepositInBank, isLoanRecvCash, isLoanRecvSaving, isTransferCashCredit, isTransferSaving, setValue]);

  function updateDetails(path, nextValue) {
    setDetailsValue(setValue, path, nextValue);
  }

  function renderCommonHeader() {
    return (
      <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title={activeItem?.label || 'Bank Transaction'}
          description={activeItem?.description || 'Bank voucher entry'}
          icon={Landmark}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Voucher No.</FieldLabel>
            <Input value={draft.voucherNo || ''} readOnly placeholder="Auto generated on save" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input type="date" value={draft.date || ''} onChange={(event) => setRootValue(setValue, 'date', event.target.value)} />
          </div>
        </div>
      </Card>
    );
  }

  function renderCommonNarration() {
    return (
      <div className="space-y-1.5 md:col-span-2">
        <FieldLabel>Narration</FieldLabel>
        <Textarea
          rows={3}
          value={draft.narration || ''}
          onChange={(event) => setRootValue(setValue, 'narration', event.target.value)}
          placeholder="Transaction remarks"
        />
      </div>
    );
  }

  function renderAmountInput() {
    return (
      <div className="space-y-1.5">
        <FieldLabel required>Amount</FieldLabel>
        <Input type="number" min="0" step="0.01" value={draft.amount ?? ''} onChange={(event) => setRootValue(setValue, 'amount', event.target.value)} placeholder="0.00" />
      </div>
    );
  }

  function renderLoanReceivedForm(settlementCode) {
    return (
      <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <LedgerValue label="Settlement Account" value={getTransactionLedgerLabel(settlementCode, lookups)} />
          {renderAmountInput()}
          <div className="space-y-1.5">
            <FieldLabel>Instrument No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque / reference no" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Instrument Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          {renderCommonNarration()}
        </div>
      </Card>
    );
  }

  function renderDepositInBankForm() {
    return (
      <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel required>Deposit In</FieldLabel>
            <CustomSelect
              value={draft.details?.depositIn || ''}
              onChange={(next) => updateDetails('depositIn', next)}
              options={BANK_DEPOSIT_IN_OPTIONS}
              placeholder="Select account"
              searchable={false}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Deposit By</FieldLabel>
            <CustomSelect
              value={draft.details?.depositBy || ''}
              onChange={(next) => updateDetails('depositBy', next)}
              options={BANK_DEPOSIT_BY_OPTIONS}
              placeholder="Select mode"
              searchable={false}
            />
          </div>
          {renderAmountInput()}
          <div className="space-y-1.5">
            <FieldLabel>Instrument No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Deposit slip / cheque no" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Instrument Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          {renderCommonNarration()}
        </div>
      </Card>
    );
  }

  function renderChequeIssueForm() {
    const settlementCode = isChequeIssueLoan ? 'L012' : 'L013';
    return (
      <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <LedgerValue label="Settlement Account" value={getTransactionLedgerLabel(settlementCode, lookups)} />
          {renderAmountInput()}
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 md:col-span-2">
            <input type="checkbox" checked={!!draft.details?.selfUse} onChange={(event) => updateDetails('selfUse', event.target.checked)} />
            Withdrawal for self use
          </label>
          <div className="space-y-1.5">
            <FieldLabel>Instrument No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Instrument Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          {renderCommonNarration()}
        </div>
      </Card>
    );
  }

  function renderTransferForm() {
    const fromCode = draft.details?.fixedFrom || (isTransferSaving ? 'L002' : 'L013');
    const toCode = draft.details?.fixedTo || (isTransferSaving ? 'L013' : 'L002');
    return (
      <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel required>Transfer Type</FieldLabel>
            <CustomSelect
              value={draft.details?.transferType || ''}
              onChange={(next) => updateDetails('transferType', next)}
              options={BANK_TRANSFER_TYPE_OPTIONS}
              placeholder="Select type"
              searchable={false}
            />
          </div>
          {renderAmountInput()}
          <LedgerValue label="From Account" value={getTransactionLedgerLabel(fromCode, lookups)} />
          <LedgerValue label="To Account" value={getTransactionLedgerLabel(toCode, lookups)} />
          <div className="space-y-1.5">
            <FieldLabel>Instrument No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque / transfer ref" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Instrument Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          {renderCommonNarration()}
        </div>
      </Card>
    );
  }

  function renderActiveForm() {
    if (isLoanRecvCash) return renderLoanReceivedForm('L002');
    if (isLoanRecvSaving) return renderLoanReceivedForm('L013');
    if (isDepositInBank) return renderDepositInBankForm();
    if (isChequeIssueSaving) return renderChequeIssueForm();
    if (isChequeIssueLoan) return renderChequeIssueForm();
    if (isTransferSaving) return renderTransferForm();
    if (isTransferCashCredit) return renderTransferForm();

    return (
      <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          {renderAmountInput()}
          <div className="space-y-1.5">
            <FieldLabel>Instrument No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Reference no" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Instrument Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          {renderCommonNarration()}
        </div>
      </Card>
    );
  }

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full space-y-6" onSubmit={onSubmit}>
      {renderCommonHeader()}
      {renderActiveForm()}
      {documentDefs.length ? (
        <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Attachments" description="Upload voucher-specific bank documents." icon={FileText} />
          <div className="mt-5">
            <DocumentSection
              title=""
              description=""
              definitions={documentDefs}
              documents={draft.documents || {}}
              editable
              onPickFile={(key, file) => {
                setValue((current) => ({
                  ...(current || {}),
                  documents: {
                    ...(current?.documents || {}),
                    [key]: {
                      file,
                      fileName: file.name,
                      originalName: file.name,
                      mimeType: file.type,
                      sizeBytes: file.size,
                      documentType: key
                    }
                  }
                }));
              }}
              onClearFile={(key, document) => {
                onDocumentRemove?.(key, document);
                setValue((current) => ({
                  ...(current || {}),
                  documents: {
                    ...(current?.documents || {}),
                    [key]: null
                  }
                }));
              }}
            />
          </div>
        </Card>
      ) : null}
    </form>
  );
}

export default BankTransactionForm;


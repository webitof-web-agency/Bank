import { useMemo } from 'react';
import {
  Banknote,
  CalendarDays,
  ChevronRight,
  FileText,
  Layers3,
  Plus,
  Repeat2,
  Sparkles,
  Trash2,
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
import { getMemberDocumentDefinitions } from './memberDocumentUtils';

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
  const rows = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item) => ({
      value: item.code || item.value || '',
      label: formatLookupLabel(item)
    }))
    .filter((item) => item.value);

  return rows.length ? [{ label, items: rows }] : [];
}

function getMemberLookupGroups(lookups = {}) {
  return buildGroups(lookups.members, 'Members');
}

function getSettlementLookupGroups(lookups = {}) {
  return [
    ...buildGroups(lookups.ledgers, 'Ledgers'),
    ...buildGroups(lookups.bankAccounts, 'Bank Accounts')
  ];
}

function getMemberTemplateIcon(key = '') {
  const value = String(key || '').toLowerCase();
  if (value === 'loan-paid-member') return Banknote;
  if (value === 'recovery-member') return Repeat2;
  if (value === 'deposit-paid-member') return WalletCards;
  if (value === 'insurance-paid-member') return FileText;
  return Users;
}

function getMemberNotes(activeKey = '') {
  const key = String(activeKey || '').toLowerCase();
  if (key === 'loan-paid-member') return ['Choose a member, settlement account, and loan component values.'];
  if (key === 'recovery-member') return ['Recovery rows stay member-wise so balances can update cleanly.'];
  if (key === 'deposit-paid-member') return ['Use settlement account and deposit details for compulsory deposit payouts.'];
  if (key === 'insurance-paid-member') return ['Use settlement account and insurance payout details for member disbursement.'];
  return ['Keep the voucher linked to a member master code and structured details.'];
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

function SectionHeader({ title, description }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
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
                    onChange={(e) => updateRow(index, field.key, e.target.value)}
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

function selectTemplate(current, item) {
  const next = deepClone(current);
  next.voucherCategory = item?.label || next.voucherCategory || '';
  next.transactionType = item?.transactionType || next.transactionType || 'payment';
  next.accent = item?.accent || next.accent || 'neutral';
  next.mode = item?.mode || next.mode || '';
  next.partyType = 'member';
  next.details = {
    ...(next.details || {}),
    key: item?.key || next.details?.key || '',
    settlementAccount: next.details?.settlementAccount || '',
    accountHead: next.details?.accountHead || '',
    components: {
      loanAmt: next.details?.components?.loanAmt ?? '',
      lad: next.details?.components?.lad ?? ''
    },
    recoveryLines: Array.isArray(next.details?.recoveryLines) ? next.details.recoveryLines : [],
    allocations: Array.isArray(next.details?.allocations) ? next.details.allocations : [],
    recoveryLinesJson: next.details?.recoveryLinesJson || '',
    allocationsJson: next.details?.allocationsJson || ''
  };
  return next;
}

export function MemberTransactionForm({ section, lookups = {}, value, setValue, onSubmit, onDocumentRemove }) {
  const draft = value || {};
  const editableItems = useMemo(() => (section?.items || []).filter((item) => !item.route), [section]);
  const activeKey = draft?.details?.key || editableItems[0]?.key || '';
  const activeItem = editableItems.find((item) => item.key === activeKey) || editableItems[0] || null;
  const partyGroups = useMemo(() => getMemberLookupGroups(lookups), [lookups]);
  const settlementGroups = useMemo(() => getSettlementLookupGroups(lookups), [lookups]);
  const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
  const members = Array.isArray(lookups.members) ? lookups.members : [];
  const ledgers = Array.isArray(lookups.ledgers) ? lookups.ledgers : [];
  const bankAccounts = Array.isArray(lookups.bankAccounts) ? lookups.bankAccounts : [];
  const documentDefs = getMemberDocumentDefinitions(activeKey);
  const showLoanComponents = activeKey === 'loan-paid-member';
  const showRecoveryLines = activeKey === 'recovery-member';
  const showMemberPayoutPanel = activeKey === 'deposit-paid-member' || activeKey === 'insurance-paid-member';

  function updateDetails(path, nextValue) {
    setDetailsValue(setValue, path, nextValue);
  }

  function updateComponents(path, nextValue) {
    setDetailsValue(setValue, ['components', path], nextValue);
  }

  function updateRows(path, nextValue) {
    setDetailsValue(setValue, path, nextValue);
  }

  const notes = getMemberNotes(activeKey);

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full space-y-6" onSubmit={onSubmit}>
      <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <LookupSelect
              label="Select Member"
              value={draft.partyCode || ''}
              onChange={(next) => setRootValue(setValue, 'partyCode', next.toUpperCase())}
              placeholder="Search or select member"
              groups={partyGroups}
              required
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input
              type="date"
              value={draft.date || ''}
              onChange={(e) => setRootValue(setValue, 'date', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel required>{showLoanComponents ? 'Loan Amount' : 'Total Amount'}</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={showLoanComponents ? (draft.details?.components?.loanAmt ?? '') : (draft.amount ?? '')}
              onChange={(e) => {
                if (showLoanComponents) {
                  updateComponents('loanAmt', e.target.value);
                  setRootValue(setValue, 'amount', e.target.value);
                } else {
                  setRootValue(setValue, 'amount', e.target.value);
                }
              }}
              placeholder="0.00"
            />
          </div>

          {showMemberPayoutPanel || showLoanComponents ? (
            <div className="space-y-1.5">
              <FieldLabel required>Settlement Account</FieldLabel>
              <LookupSelect
                label=""
                value={draft.details?.settlementAccount || ''}
                onChange={(next) => updateDetails('settlementAccount', next)}
                placeholder="Select bank / cash ledger"
                groups={settlementGroups}
              />
            </div>
          ) : null}

          {showLoanComponents ? (
            <div className="space-y-1.5">
              <FieldLabel>LAD (Loan Against Deposit)</FieldLabel>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.details?.components?.lad ?? ''}
                onChange={(e) => updateComponents('lad', e.target.value)}
                placeholder="0.00"
              />
            </div>
          ) : null}

          {showMemberPayoutPanel ? (
            <div className="space-y-1.5">
              <FieldLabel>Account Head (Optional)</FieldLabel>
              <Input
                value={draft.details?.accountHead || ''}
                onChange={(e) => updateDetails('accountHead', e.target.value)}
                placeholder="Specific payout head"
              />
            </div>
          ) : null}

          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel>Narration</FieldLabel>
            <Textarea
              rows={2}
              value={draft.narration || ''}
              onChange={(e) => setRootValue(setValue, 'narration', e.target.value)}
              placeholder="Brief narration for this transaction"
            />
          </div>
        </div>
      </Card>

      {showRecoveryLines ? (
        <ArrayRowsEditor
          title="Recovery Breakdown"
          description="Add member-wise recovery lines for the voucher."
          rows={draft.details?.recoveryLines || []}
          onChange={(next) => {
            updateRows('recoveryLines', next);
            const total = next.reduce((sum, row) => sum + Number(row.amount || 0), 0);
            if (total > 0) {
              setRootValue(setValue, 'amount', total);
            }
          }}
          emptyRow={{ memberCode: '', head: '', amount: '', memo: '' }}
          addLabel="Add Recovery Line"
          icon={Repeat2}
          rowTone="emerald"
          fields={[
            { key: 'memberCode', label: 'Member Code', placeholder: 'M0001' },
            { key: 'head', label: 'Head', placeholder: 'Recovery Head' },
            { key: 'amount', label: 'Amount', type: 'number', step: '0.01', placeholder: '0.00' },
            { key: 'memo', label: 'Memo', placeholder: 'Optional memo' }
          ]}
        />
      ) : null}

          <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Attachments"
          description={showLoanComponents
            ? 'Loan agreements, promissory notes, and disbursement proof.'
            : showRecoveryLines
              ? 'Deposit slips, receipt copies, and bank proof for recovery.'
              : 'Member payout supporting files and proof.'}
        />
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

      <div className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-5">
          <h3 className="text-lg font-semibold text-slate-900">Advanced Details</h3>
        </div>
        <div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel>Voucher No</FieldLabel>
              <Input
                value={draft.voucherNo || ''}
                onChange={(e) => setRootValue(setValue, 'voucherNo', String(e.target.value || '').toUpperCase())}
                placeholder="Auto generated on save"
                className="font-mono uppercase tracking-wider"
              />
            </div>
            
            <LookupSelect
              label="Branch"
              value={draft.branchCode || ''}
              onChange={(next) => setRootValue(setValue, 'branchCode', next)}
              placeholder="Select branch"
              groups={buildGroups(branches, 'Branches')}
            />

            <div className="space-y-1.5">
              <FieldLabel>Financial Year</FieldLabel>
              <Input
                value={draft.fyCode || ''}
                onChange={(e) => setRootValue(setValue, 'fyCode', String(e.target.value || '').toUpperCase())}
                placeholder="FY25-26"
                className="uppercase tracking-wider"
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Status</FieldLabel>
              <CustomSelect
                value={draft.status || 'Draft'}
                onChange={(next) => setRootValue(setValue, 'status', next)}
                options={[
                  { label: 'Draft', value: 'Draft' },
                  { label: 'Posted', value: 'Posted' },
                  { label: 'Reversed', value: 'Reversed' }
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Reference No</FieldLabel>
              <Input
                value={draft.referenceNo || ''}
                onChange={(e) => setRootValue(setValue, 'referenceNo', e.target.value)}
                placeholder="Reference / slip no"
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Mode</FieldLabel>
              <Input
                value={draft.mode || ''}
                onChange={(e) => setRootValue(setValue, 'mode', e.target.value)}
                placeholder={activeItem?.mode || 'Cash / Cheque'}
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Instrument No</FieldLabel>
              <Input
                value={draft.instrumentNo || ''}
                onChange={(e) => setRootValue(setValue, 'instrumentNo', e.target.value)}
                placeholder="Cheque / DD no"
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Instrument Date</FieldLabel>
              <Input
                type="date"
                value={draft.instrumentDate || ''}
                onChange={(e) => setRootValue(setValue, 'instrumentDate', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

export default MemberTransactionForm;

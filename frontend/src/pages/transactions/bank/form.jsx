import { useMemo } from 'react';
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
import { DocumentSection } from '../../../components/master/DocumentSection';
import { TRANSACTION_DOCUMENT_DEFS } from '../transactionDocumentUtils';
import {
  formatTransactionAmount,
  getTransactionLedgerLabel,
  getTransactionPartyLabel
} from './transactionUtils';
import { toneClassName } from './transactionUtils';

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
      <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
        <Icon size={20} strokeWidth={1.9} />
      </div>
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
  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <Select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled || !groups.length}>
        <option value="">{placeholder}</option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <option key={`${group.label}:${item.value}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
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
    onChange(next.length ? next : [deepClone(emptyRow)]);
  }

  return (
    <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeader title={title} description={description} icon={Icon} />

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

export function BankTransactionForm({ section, lookups = {}, value, setValue, onSubmit, onDocumentRemove }) {
  const editableItems = useMemo(() => (section?.items || []).filter((item) => !item.route), [section]);
  const activeKey = value?.details?.key || editableItems[0]?.key || '';
  const activeItem = editableItems.find((item) => item.key === activeKey) || editableItems[0] || null;
  const derivedPartyType = getPartyTypeForKey(activeKey);
  const partyType = value?.partyType || derivedPartyType;
  const partyGroups = useMemo(() => getPartyGroupsForSelection(partyType, lookups), [lookups, partyType]);
  const accountGroups = useMemo(() => getPartyGroupsForSelection('ledger', lookups), [lookups]);
  const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
  const members = Array.isArray(lookups.members) ? lookups.members : [];
  const employees = Array.isArray(lookups.employees) ? lookups.employees : [];
  const bankAccounts = Array.isArray(lookups.bankAccounts) ? lookups.bankAccounts : [];
  const ledgers = Array.isArray(lookups.ledgers) ? lookups.ledgers : [];
  const showLoanComponents = activeKey === 'loan-paid-member';
  const showRecoveryLines = activeKey === 'recovery-member';
  const showAllocations = activeKey === 'transfer-voucher-paid' || activeKey === 'transfer-voucher-recover';
  const showEmployeePanel = activeKey === 'advance-paid-emp' || activeKey === 'advance-recovery-emp';
  const showInterestPanel = activeKey === 'interest-paid-member' || activeKey === 'receipt-voucher';
  const showBankPanel = section?.key === 'bank';
  const showSupportingPanel = section?.key === 'supporting' || activeKey === 'payment-voucher';

  function updateDetails(path, nextValue) {
    setDetailsValue(setValue, path, nextValue);
  }

  function updateComponents(path, nextValue) {
    setDetailsValue(setValue, ['components', path], nextValue);
  }

  function updateRows(path, nextValue) {
    setDetailsValue(setValue, path, nextValue);
  }

  const notes = getSectionNotes(section?.key || '', activeKey);

  return (
    <form id="transaction-voucher-form" className="space-y-5" onSubmit={onSubmit}>
      <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative bg-gradient-to-r from-[#0f172a] via-[#2563eb] to-[#3b82f6] px-6 py-7 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur">
                <Sparkles size={13} />
                Clean voucher form
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {activeItem?.label || section?.label || 'Transaction Voucher'}
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-blue-50 md:text-[15px]">
                  Structured fields, row-based breakdowns, and backend-friendly payloads without raw JSON editing.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:min-w-[320px]">
              {[
                { label: 'Type', value: activeItem?.transactionType || 'payment' },
                { label: 'Party', value: partyType || 'ledger' },
                { label: 'Section', value: section?.label || 'Transactions' }
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-5">
          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Transaction Type"
              description="Pick the voucher template for this section."
              icon={Layers3}
            />

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {editableItems.map((item) => (
                <OptionCard
                  key={item.key}
                  title={item.label}
                  description={item.description}
                  active={activeKey === item.key}
                  badge={item.transactionType}
                  tone={item.accent || 'slate'}
                  icon={item.key.includes('member') ? Users : item.key.includes('employee') ? UserRound : item.key.includes('bank') ? Landmark : WalletCards}
                  onClick={() => setValue((current) => selectTemplate(setValue, current, item))}
                />
              ))}
            </div>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Voucher Basics"
              description="Core fields required for posting and search."
              icon={FileText}
            />

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Voucher No</FieldLabel>
                <Input
                  value={value.voucherNo || ''}
                  onChange={(e) => setRootValue(setValue, 'voucherNo', String(e.target.value || '').toUpperCase())}
                  placeholder="Auto generated on save"
                  className="font-mono uppercase tracking-wider"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel required>Date</FieldLabel>
                <Input
                  type="date"
                  value={value.date || ''}
                  onChange={(e) => setRootValue(setValue, 'date', e.target.value)}
                />
              </div>

              <LookupSelect
                label="Branch"
                value={value.branchCode || ''}
                onChange={(next) => setRootValue(setValue, 'branchCode', next)}
                placeholder="Select branch"
                groups={buildGroups(branches, 'Branches')}
                helper="Branch code is stored with voucher for filtering and reporting."
              />

              <div className="space-y-1.5">
                <FieldLabel>Financial Year</FieldLabel>
                <Input
                  value={value.fyCode || ''}
                  onChange={(e) => setRootValue(setValue, 'fyCode', String(e.target.value || '').toUpperCase())}
                  placeholder="FY25-26"
                  className="uppercase tracking-wider"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel required>Amount</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value.amount ?? ''}
                  onChange={(e) => setRootValue(setValue, 'amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Status</FieldLabel>
                <Select value={value.status || 'Draft'} onChange={(e) => setRootValue(setValue, 'status', e.target.value)}>
                  <option value="Draft">Draft</option>
                  <option value="Posted">Posted</option>
                  <option value="Reversed">Reversed</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Mode</FieldLabel>
                <Input
                  value={value.mode || ''}
                  onChange={(e) => setRootValue(setValue, 'mode', e.target.value)}
                  placeholder={activeItem?.mode || 'Cash / Cheque'}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <FieldLabel>Narration</FieldLabel>
                <Textarea
                  rows={3}
                  value={value.narration || ''}
                  onChange={(e) => setRootValue(setValue, 'narration', e.target.value)}
                  placeholder="Brief narration for voucher"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Reference No</FieldLabel>
                <Input
                  value={value.referenceNo || ''}
                  onChange={(e) => setRootValue(setValue, 'referenceNo', e.target.value)}
                  placeholder="Reference / slip no"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Instrument No</FieldLabel>
                <Input
                  value={value.instrumentNo || ''}
                  onChange={(e) => setRootValue(setValue, 'instrumentNo', e.target.value)}
                  placeholder="Cheque / DD no"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Instrument Date</FieldLabel>
                <Input
                  type="date"
                  value={value.instrumentDate || ''}
                  onChange={(e) => setRootValue(setValue, 'instrumentDate', e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Approved By</FieldLabel>
                <Input
                  value={value.approvedBy || ''}
                  onChange={(e) => setRootValue(setValue, 'approvedBy', e.target.value)}
                  placeholder="Approver name"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Created By</FieldLabel>
                <Input
                  value={value.createdBy || ''}
                  onChange={(e) => setRootValue(setValue, 'createdBy', e.target.value)}
                  placeholder="Prepared by"
                />
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Party Details"
              description="Lookup-based party selection. The party type follows voucher template."
              icon={Users}
            />

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <LookupSelect
                label="Party"
                value={value.partyCode || ''}
                onChange={(next) => setRootValue(setValue, 'partyCode', next.toUpperCase())}
                placeholder="Select party"
                groups={partyGroups}
                helper={partyType === 'member' ? 'Member codes from master members.' : partyType === 'employee' ? 'Employee codes from master employees.' : 'Ledger or bank account codes.'}
              />

              <div className="space-y-1.5">
                <FieldLabel>Party Type</FieldLabel>
                <div className="flex h-12 items-center rounded-[0.75rem] border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">
                  {value.partyType || derivedPartyType || 'ledger'}
                </div>
              </div>
            </div>
          </Card>

          {showLoanComponents ? (
            <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Loan Components"
                description="Loan paid transactions need component level values."
                icon={Banknote}
              />

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Settlement Account</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.settlementAccount || ''}
                    onChange={(next) => updateDetails('settlementAccount', next)}
                    placeholder="Select settlement account"
                    groups={accountGroups}
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Loan Amount</FieldLabel>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value.details?.components?.loanAmt ?? ''}
                    onChange={(e) => updateComponents('loanAmt', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>LAD</FieldLabel>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value.details?.components?.lad ?? ''}
                    onChange={(e) => updateComponents('lad', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </Card>
          ) : null}

          {showRecoveryLines ? (
            <ArrayRowsEditor
              title="Recovery Breakdown"
              description="Add member-wise recovery lines for the voucher."
              rows={value.details?.recoveryLines || []}
              onChange={(next) => updateRows('recoveryLines', next)}
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

          {showAllocations ? (
            <ArrayRowsEditor
              title="Transfer Allocations"
              description="Allocate transfer voucher amount across members or demand heads."
              rows={value.details?.allocations || []}
              onChange={(next) => updateRows('allocations', next)}
              emptyRow={{ memberCode: '', head: '', amount: '' }}
              addLabel="Add Allocation"
              icon={FileText}
              rowTone="amber"
              fields={[
                { key: 'memberCode', label: 'Member Code', placeholder: 'M0001' },
                { key: 'head', label: 'Head', placeholder: 'Transfer Head' },
                { key: 'amount', label: 'Amount', type: 'number', step: '0.01', placeholder: '0.00' }
              ]}
            />
          ) : null}

          {showEmployeePanel ? (
            <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Employee Link"
                description="Employee advance vouchers use employee master codes."
                icon={UserRound}
              />

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <LookupSelect
                  label="Employee"
                  value={value.partyCode || ''}
                  onChange={(next) => setRootValue(setValue, 'partyCode', next.toUpperCase())}
                  placeholder="Select employee"
                  groups={buildGroups(employees, 'Employees')}
                  helper="Employee code from master employees."
                />
                <div className="space-y-1.5">
                  <FieldLabel>Settlement Account</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.settlementAccount || ''}
                    onChange={(next) => updateDetails('settlementAccount', next)}
                    placeholder="Select ledger / bank account"
                    groups={accountGroups}
                  />
                </div>
              </div>
            </Card>
          ) : null}

          {showBankPanel ? (
            <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Bank Posting"
                description="Bank section vouchers often need debit / credit account targets."
                icon={Landmark}
              />

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Ledger Target</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.ledgerTarget || ''}
                    onChange={(next) => updateDetails('ledgerTarget', next)}
                    placeholder="Select ledger"
                    groups={buildGroups(ledgers, 'Ledgers')}
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Deposit In</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.depositIn || ''}
                    onChange={(next) => updateDetails('depositIn', next)}
                    placeholder="Select bank account / ledger"
                    groups={accountGroups}
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>From Account</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.fromAccount || ''}
                    onChange={(next) => updateDetails('fromAccount', next)}
                    placeholder="Select from account"
                    groups={accountGroups}
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>To Account</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.toAccount || ''}
                    onChange={(next) => updateDetails('toAccount', next)}
                    placeholder="Select to account"
                    groups={accountGroups}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <FieldLabel>Account Head</FieldLabel>
                  <Input
                    value={value.details?.accountHead || ''}
                    onChange={(e) => updateDetails('accountHead', e.target.value)}
                    placeholder="Optional account head"
                  />
                </div>
              </div>
            </Card>
          ) : null}

          {showInterestPanel ? (
            <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Receipt / Interest Details"
                description="Interest and receipt vouchers use ledger-linked account references."
                icon={WalletCards}
              />

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Receipt By</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.receiptBy || ''}
                    onChange={(next) => updateDetails('receiptBy', next)}
                    placeholder="Select receiving ledger"
                    groups={accountGroups}
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Settlement Account</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.settlementAccount || ''}
                    onChange={(next) => updateDetails('settlementAccount', next)}
                    placeholder="Select settlement account"
                    groups={accountGroups}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <FieldLabel>Account Head</FieldLabel>
                  <Input
                    value={value.details?.accountHead || ''}
                    onChange={(e) => updateDetails('accountHead', e.target.value)}
                    placeholder="Optional interest head"
                  />
                </div>
              </div>
            </Card>
          ) : null}

          {showSupportingPanel ? (
            <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Supporting Voucher"
                description="Keep payment vouchers structured but simple."
                icon={ShieldCheck}
              />

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Ledger Target</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.details?.ledgerTarget || ''}
                    onChange={(next) => updateDetails('ledgerTarget', next)}
                    placeholder="Select ledger"
                    groups={accountGroups}
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Account Head</FieldLabel>
                  <Input
                    value={value.details?.accountHead || ''}
                    onChange={(e) => updateDetails('accountHead', e.target.value)}
                    placeholder="Optional supporting head"
                  />
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Attachments"
              description="Upload files to the file manager under the transactions module."
              icon={FileText}
            />
            <div className="mt-5">
              <DocumentSection
                title=""
                description=""
                definitions={TRANSACTION_DOCUMENT_DEFS}
                documents={value.documents || {}}
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

          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Summary"
              description="Quick summary before saving the voucher."
              icon={CalendarDays}
            />

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                { label: 'Amount', value: formatTransactionAmount(value.amount || 0) },
                { label: 'Party', value: getTransactionPartyLabel(value.partyCode, lookups, value.partyType || derivedPartyType) },
                { label: 'Settlement', value: getTransactionLedgerLabel(value.details?.settlementAccount || value.details?.ledgerTarget || value.details?.depositIn || value.details?.fromAccount || '', lookups) }
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-1 text-[14px] font-semibold text-slate-900">{item.value || '—'}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Context"
              description="Quick reminders for this voucher template."
              icon={ChevronRight}
            />
            <div className="mt-5 space-y-3">
              {notes.map((note) => (
                <div key={note} className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <ChevronRight size={14} className="mt-0.5 shrink-0 text-blue-500" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Current Selection"
              description="Voucher template mapped from the transaction catalog."
              icon={Layers3}
            />

            <div className="mt-5 space-y-3">
              <div className={`rounded-2xl border px-4 py-3 ${toneClassName(activeItem?.accent || section?.tone || 'slate')}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Selected Type</p>
                <p className="mt-1 text-[15px] font-semibold">{activeItem?.label || 'Select a voucher template'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Party Type</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-900">{value.partyType || derivedPartyType || 'ledger'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Lookup Count</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-900">
                  {members.length} members, {employees.length} employees, {bankAccounts.length} bank accounts, {ledgers.length} ledgers
                </p>
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Structured Payload"
              description="Auto-generated arrays are kept in row format, not raw JSON."
              icon={FileText}
            />
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-sm text-slate-500">
              Recovery lines and transfer allocations are stored as arrays, so the backend can post them directly without extra parsing.
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}

export default BankTransactionForm;

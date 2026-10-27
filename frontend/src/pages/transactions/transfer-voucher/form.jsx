import { useEffect, useMemo } from 'react';
import { FileText, Plus } from 'lucide-react';
import { useInDialog } from '../../../components/ui/dialogContext';
import { Card } from '../../../components/ui/Card';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { getTransferVoucherDocumentDefinitions } from './transferVoucherDocumentUtils';
import { FormSectionTitle, FormSubheading, HideInDialog, OnlyInDialog } from '../../../components/ui/FormSectionTitle';
import { SmsCheckbox } from '../../../components/ui/CheckboxLine';
import {  getTransferVoucherAllocationRows,
  getTransferVoucherAllocationTotal,  toneClassName, transferVoucherFixedSide
} from './transactionUtils';
import { membersInFy } from '../../../lib/fyMembers';

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
  const code = item.code || item.value || '';
  const label = item.name || item.fullName || item.label || '';
  return `${code}${label ? ` - ${label}` : ''}`.trim();
}

function buildGroups(items = [], label = '') {
  const rows = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item) => ({ value: item.code || item.value || '', label: formatLookupLabel(item) }))
    .filter((item) => item.value);

  return rows.length ? [{ label, items: rows }] : [];
}

function FieldLabel({ children, required = false }) {
  return (
    <label className="text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

function LookupSelect({ label, value, onChange, groups = [], placeholder = 'Select...', helper = '', required = false, disabled = false }) {
  const flatOptions = useMemo(() => {
    const options = [];
    groups.forEach((group) => {
      group.items.forEach((item) => {
        options.push({ label: group.label ? `${item.label} (${group.label})` : item.label, value: item.value });
      });
    });
    return options;
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

function readMemberDetails(lookups = {}, code = '') {
  const member = (lookups.members || []).find((row) => String(row.code || '').toUpperCase() === String(code || '').toUpperCase());
  if (!member) {
    return { name: '—' };
  }

  return {
    name: member.name || '—'
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function TransferVoucherTransactionForm({ section, itemKey, lookups = {}, value, setValue, onSubmit, onDocumentRemove }) {
  // Inside a dialog its title already names the voucher type.
  const inDialog = useInDialog();
  const items = useMemo(() => (section?.items || []).filter((item) => !itemKey || item.key === itemKey), [section, itemKey]);
  const activeKey = itemKey || value?.details?.key || items[0]?.key || '';
  const activeItem = items.find((item) => item.key === activeKey) || items[0] || null;
  const memberGroups = useMemo(() => buildGroups(membersInFy(lookups.members), 'Members'), [lookups]);
  const memberCode = value?.partyCode || '';
  const memberDetails = readMemberDetails(lookups, memberCode);
  const documentDefs = getTransferVoucherDocumentDefinitions(activeKey);
  const allocationRows = useMemo(() => getTransferVoucherAllocationRows(value?.details?.allocations || [], activeKey), [value, activeKey]);
  const allocationTotal = useMemo(() => getTransferVoucherAllocationTotal(allocationRows, activeKey), [allocationRows, activeKey]);
  const defaultSide = activeKey === 'transfer-voucher-recover' ? 'CR' : 'DR';
  const isPaid = activeKey === 'transfer-voucher-paid';
  const fixedSide = transferVoucherFixedSide(activeKey);

  function updateValue(updater) {
    setValue((current) => {
      const next = deepClone(current);
      updater(next);
      return next;
    });
  }

  function updateDetails(path, nextValue) {
    updateValue((next) => {
      if (!next.details || typeof next.details !== 'object') {
        next.details = {};
      }
      setPath(next.details, path, nextValue);
    });
  }

  function updateRoot(key, nextValue) {
    setValue((current) => ({ ...(current || {}), [key]: nextValue }));
  }

  function updateAllocation(head, field, nextValue) {
    updateValue((next) => {
      if (!next.details || typeof next.details !== 'object') {
        next.details = {};
      }

      const rows = getTransferVoucherAllocationRows(next.details.allocations || [], activeKey);
      next.details.allocations = rows.map((row) => (row.head === head ? { ...row, [field]: nextValue } : row));
      next.amount = getTransferVoucherAllocationTotal(next.details.allocations, activeKey);
    });
  }

  useEffect(() => {
    if (!activeKey) return;
    const currentAmount = toNumber(value?.amount);
    if (allocationTotal > 0 || !currentAmount) {
      if (String(value?.amount ?? '') !== String(allocationTotal)) {
        updateRoot('amount', allocationTotal);
      }
    }
  }, [allocationTotal, activeKey]);

  useEffect(() => {
    if (!value?.mode) {
      updateRoot('mode', 'Transfer');
    }
  }, [activeKey]);

  const ledgerGroups = buildGroups(lookups.ledgers, 'Ledger Accounts');

  if (activeKey === 'transfer-voucher-payment' || activeKey === 'transfer-voucher-receipt') {
    return (
      <form id="transaction-voucher-form" className="mx-auto w-full max-w-4xl space-y-4" onSubmit={onSubmit}>
        {!inDialog && (
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{activeItem?.label || 'Transfer Voucher'}</h3>
            </div>
            <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${toneClassName(activeItem?.accent || 'violet')}`}>
              {activeKey === 'transfer-voucher-payment' ? 'Payment' : 'Receipt'}
            </div>
          </div>
        )}
        {inDialog && <div className="mb-3"><FormSectionTitle>Voucher</FormSectionTitle></div>}
        
        <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel>Voucher No</FieldLabel>
                <Input
                  value={value.voucherNo || ''}
                  onChange={(e) => updateRoot('voucherNo', String(e.target.value || '').toUpperCase())}
                  placeholder="Auto generated on save"
                  className="font-mono uppercase tracking-wider bg-slate-50"
                  readOnly
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel required>Date</FieldLabel>
                <Input
                  type="date"
                  value={value.date || ''}
                  onChange={(e) => updateRoot('date', e.target.value)}
                />
              </div>

              {activeKey === 'transfer-voucher-payment' ? (
                <div className="space-y-1.5">
                  <FieldLabel required>Payment By</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.partyCode || ''}
                    onChange={(next) => updateRoot('partyCode', String(next || '').toUpperCase())}
                    placeholder="Search or select ledger"
                    groups={ledgerGroups}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <FieldLabel required>Receipt To</FieldLabel>
                  <LookupSelect
                    label=""
                    value={value.partyCode || ''}
                    onChange={(next) => updateRoot('partyCode', String(next || '').toUpperCase())}
                    placeholder="Search or select ledger"
                    groups={ledgerGroups}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <FieldLabel required>Amount</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value.amount ?? ''}
                  onChange={(e) => updateRoot('amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel>Total Amount</FieldLabel>
                <Input
                  type="number"
                  value={value.amount ?? ''}
                  readOnly
                  className="bg-slate-50 text-slate-500"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Narration</FieldLabel>
                <Textarea
                  value={value.narration || ''}
                  onChange={(e) => updateRoot('narration', e.target.value)}
                  placeholder="Enter narration or particulars..."
                  className="min-h-[140px] resize-y"
                />
              </div>
            </div>
          </div>
        </Card>
      </form>
    );
  }

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full space-y-3" onSubmit={onSubmit}>
      {inDialog && <div className="mb-3"><FormSectionTitle>Voucher</FormSectionTitle></div>}
      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel>Voucher No</FieldLabel>
            <Input
              value={value.voucherNo || ''}
              onChange={(event) => updateRoot('voucherNo', String(event.target.value || '').toUpperCase())}
              placeholder="Auto generated on save"
              className="font-mono uppercase tracking-wider"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input type="date" value={value.date || ''} onChange={(event) => updateRoot('date', event.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {!inDialog && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">Member Transactions</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{activeItem?.label || 'Transfer Voucher'}</h3>
            </div>
            <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${toneClassName(activeItem?.accent || 'violet')}`}>
              Transfer Voucher
            </div>
          </div>
        )}
        {inDialog && <div className="mb-3"><FormSectionTitle>Member</FormSectionTitle></div>}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <LookupSelect
              label="Member Code"
              required
              value={value.partyCode || ''}
              onChange={(next) => updateRoot('partyCode', String(next || '').toUpperCase())}
              placeholder="Search member by code or name"
              groups={memberGroups}
              helper="Member code is linked from member master."
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Member Name</FieldLabel>
            <Input value={memberDetails.name} readOnly placeholder="—" />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={allocationTotal || 0} readOnly />
          </div>

          {/* Paid: the cheque given to the member, recorded for reference. */}
          {isPaid ? (
            <>
              <div className="space-y-1.5">
                <FieldLabel>Cheque No.</FieldLabel>
                <Input value={value.instrumentNo || ''} onChange={(event) => updateRoot('instrumentNo', event.target.value)} placeholder="Cheque number" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Cheque Date</FieldLabel>
                <Input type="date" value={value.instrumentDate || ''} onChange={(event) => updateRoot('instrumentDate', event.target.value)} />
              </div>
            </>
          ) : null}
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <FormSubheading label="Allocation" icon={Plus} />

        {/* One compact row per head: label, then amount and DR/CR side. */}
        <div data-transfer-voucher-section="allocation" className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {allocationRows.map((row) => (
            <div key={row.head} className="grid items-center gap-x-3 gap-y-1.5 px-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,180px)_112px]">
              <div className="text-[13px] font-medium text-slate-700">{row.label}</div>
              <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2 md:contents">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label={`Amount for ${row.label}`}
                  value={row.amount ?? ''}
                  onChange={(event) => updateAllocation(row.head, 'amount', event.target.value)}
                  placeholder="0.00"
                />
                {/* Paid to Member is always DR, Recover From Member CR. */}
                {fixedSide ? (
                  <Input value={fixedSide} readOnly aria-label={`Side for ${row.label}`} className="bg-slate-50" />
                ) : (
                  <CustomSelect
                    ariaLabel={`Side for ${row.label}`}
                    value={row.side || defaultSide}
                    onChange={(next) => updateAllocation(row.head, 'side', next)}
                    options={[
                      { value: 'DR', label: 'DR' },
                      { value: 'CR', label: 'CR' }
                    ]}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <FieldLabel>Narration</FieldLabel>
            <Textarea
              value={value.narration || ''}
              onChange={(event) => updateRoot('narration', event.target.value)}
              rows={4}
              placeholder="Purpose or remarks"
            />
          </div>

          <SmsCheckbox checked={value.details?.sendSmsToMember} onChange={(checked) => updateDetails('sendSmsToMember', checked)} />
        </div>
      </Card>

      {documentDefs.length ? (
        <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <HideInDialog>
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileText size={16} />
              Attachments
            </div>
          </HideInDialog>
          <DocumentSection
            title=""
            description=""
            definitions={documentDefs}
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
        </Card>
      ) : null}
    </form>
  );
}

export default TransferVoucherTransactionForm;




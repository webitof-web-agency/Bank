import { useEffect, useMemo } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { getTransferVoucherDocumentDefinitions } from './transferVoucherDocumentUtils';
import {  getTransferVoucherAllocationRows,
  getTransferVoucherAllocationTotal,  toneClassName
} from './transactionUtils';

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
  const items = useMemo(() => (section?.items || []).filter((item) => !itemKey || item.key === itemKey), [section, itemKey]);
  const activeKey = itemKey || value?.details?.key || items[0]?.key || '';
  const activeItem = items.find((item) => item.key === activeKey) || items[0] || null;
  const memberGroups = useMemo(() => buildGroups(lookups.members, 'Members'), [lookups]);
  const memberCode = value?.partyCode || '';
  const memberDetails = readMemberDetails(lookups, memberCode);
  const documentDefs = getTransferVoucherDocumentDefinitions(activeKey);
  const allocationRows = useMemo(() => getTransferVoucherAllocationRows(value?.details?.allocations || [], activeKey), [value, activeKey]);
  const allocationTotal = useMemo(() => getTransferVoucherAllocationTotal(allocationRows, activeKey), [allocationRows, activeKey]);
  const defaultSide = activeKey === 'transfer-voucher-recover' ? 'CR' : 'DR';

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

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full space-y-4" onSubmit={onSubmit}>
      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
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
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">Member Transactions</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{activeItem?.label || 'Transfer Voucher'}</h3>
          </div>
          <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${toneClassName(activeItem?.accent || 'violet')}`}>
            Transfer Voucher
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
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
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Plus size={16} />
          Allocation
        </div>

        <div className="hidden gap-3 border-b border-slate-200 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 md:grid md:grid-cols-[1.2fr_1fr_120px]">
          <div>Head</div>
          <div>Amount</div>
          <div>Side</div>
        </div>

        <div className="mt-3 space-y-3">
          {allocationRows.map((row) => (
            <div key={row.head} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[1.2fr_1fr_120px] md:items-end">
              <div className="space-y-1.5">
                <FieldLabel>{row.label}</FieldLabel>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Amount</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount ?? ''}
                  onChange={(event) => updateAllocation(row.head, 'amount', event.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Side</FieldLabel>
                <CustomSelect
                  value={row.side || defaultSide}
                  onChange={(next) => updateAllocation(row.head, 'side', next)}
                  options={[
                    { value: 'DR', label: 'DR' },
                    { value: 'CR', label: 'CR' }
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-start">
          <div className="space-y-1.5">
            <FieldLabel>Narration</FieldLabel>
            <Textarea
              value={value.narration || ''}
              onChange={(event) => updateRoot('narration', event.target.value)}
              rows={4}
              placeholder="Purpose or remarks"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(value.details?.sendSmsToMember)}
                onChange={(event) => updateDetails('sendSmsToMember', event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
              />
              <span>
                <span className="block font-semibold text-slate-900">Send SMS to member</span>
                <span className="mt-1 block text-[12px] text-slate-500">Optional notification for transfer voucher posting.</span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      {documentDefs.length ? (
        <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText size={16} />
            Attachments
          </div>
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




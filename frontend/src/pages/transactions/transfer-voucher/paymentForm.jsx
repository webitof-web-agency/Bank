import { useEffect, useMemo } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { getTransferVoucherDocumentDefinitions } from './transferVoucherDocumentUtils';
import { getTransactionLedgerLabel, toneClassName } from './transactionUtils';

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
  const label = item.name || item.fullName || item.bankName || item.label || '';
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
  const options = useMemo(() => {
    const flat = [];
    groups.forEach((group) => {
      group.items.forEach((item) => {
        flat.push({ label: group.label ? `${item.label} (${group.label})` : item.label, value: item.value });
      });
    });
    return flat;
  }, [groups]);

  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <CustomSelect
        value={value || ''}
        onChange={onChange}
        disabled={disabled || !groups.length}
        placeholder={placeholder}
        options={options}
        searchable
      />
      {helper ? <p className="text-[12px] text-slate-500">{helper}</p> : null}
    </div>
  );
}

function readLedgerDetails(lookups = {}, code = '') {
  const ledger = (lookups.ledgers || []).find((row) => String(row.code || '').toUpperCase() === String(code || '').toUpperCase());
  const bank = (lookups.bankAccounts || []).find((row) => String(row.code || '').toUpperCase() === String(code || '').toUpperCase());
  if (ledger) return ledger.name || ledger.code || '—';
  if (bank) return bank.bankName || bank.code || '—';
  return '—';
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function TransferVoucherPaymentForm({ section, itemKey, lookups = {}, value, setValue, onSubmit, onDocumentRemove }) {
  const items = useMemo(() => (section?.items || []).filter((item) => !itemKey || item.key === itemKey), [section, itemKey]);
  const activeKey = itemKey || value?.details?.key || items[0]?.key || '';
  const activeItem = items.find((item) => item.key === activeKey) || items[0] || null;
  const ledgerGroups = useMemo(() => buildGroups(lookups.ledgers, 'Ledgers'), [lookups]);
  const accountGroups = useMemo(() => [
    ...buildGroups(lookups.bankAccounts, 'Bank Accounts'),
    ...buildGroups(lookups.ledgers, 'Ledgers')
  ], [lookups]);
  const documentDefs = getTransferVoucherDocumentDefinitions(activeKey);
  const payToLabel = getTransactionLedgerLabel(value?.partyCode || '', lookups);
  const paidFromLabel = readLedgerDetails(lookups, value?.details?.settlementAccount || '');

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

  useEffect(() => {
    if (!value?.mode) {
      updateRoot('mode', 'Cash');
    }
  }, [activeKey]);

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full space-y-3" onSubmit={onSubmit}>
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
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-500">Transfer Voucher</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{activeItem?.label || 'Payment'}</h3>
          </div>
          <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${toneClassName('pink')}`}>
            Payment
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <LookupSelect
              label="Pay To (Ledger)"
              required
              value={value.partyCode || ''}
              onChange={(next) => updateRoot('partyCode', String(next || '').toUpperCase())}
              placeholder="Select ledger"
              groups={ledgerGroups}
              helper={`Selected ledger: ${payToLabel}`}
            />
          </div>

          <div className="md:col-span-2">
            <LookupSelect
              label="Paid From"
              required
              value={value.details?.settlementAccount || ''}
              onChange={(next) => updateDetails('settlementAccount', String(next || '').toUpperCase())}
              placeholder="Select cash/bank account"
              groups={accountGroups}
              helper={`Source account: ${paidFromLabel}`}
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel required>Amount</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={value.amount ?? ''}
              onChange={(event) => updateRoot('amount', event.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel required>Payment</FieldLabel>
            <CustomSelect
              value={value.mode || 'Cash'}
              onChange={(next) => updateRoot('mode', next)}
              options={[
                { value: 'Cash', label: 'Cash' },
                { value: 'Cheque', label: 'Cheque' },
                { value: 'Transfer', label: 'Transfer' }
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Instrument No</FieldLabel>
            <Input
              value={value.instrumentNo || ''}
              onChange={(event) => updateRoot('instrumentNo', event.target.value)}
              placeholder="Cheque / slip no"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Instrument Date</FieldLabel>
            <Input
              type="date"
              value={value.instrumentDate || ''}
              onChange={(event) => updateRoot('instrumentDate', event.target.value)}
            />
          </div>

          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea
              rows={3}
              value={value.narration || ''}
              onChange={(event) => updateRoot('narration', event.target.value)}
              placeholder="Purpose or remarks"
            />
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

export default TransferVoucherPaymentForm;

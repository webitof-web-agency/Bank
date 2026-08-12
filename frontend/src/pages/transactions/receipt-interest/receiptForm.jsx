import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { getReceiptInterestDocumentDefinitions } from './receiptInterestDocumentUtils';
import { formatTransactionAmount, getTransactionLedgerLabel, toneClassName } from './transactionUtils';

function FieldLabel({ children, required = false }) {
  return (
    <label className="text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

function buildOptions(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item) => ({ value: item.code || item.value || '', label: `${item.code || item.value || ''}${item.name || item.bankName ? ` - ${item.name || item.bankName}` : ''}`.trim() }))
    .filter((item) => item.value);
}

function LookupSelect({ label, value, onChange, options = [], placeholder = 'Select...', required = false, helper = '' }) {
  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <CustomSelect value={value || ''} onChange={onChange} options={options} placeholder={placeholder} />
      {helper ? <p className="text-[12px] text-slate-500">{helper}</p> : null}
    </div>
  );
}

export function ReceiptVoucherForm({ section, lookups = {}, value, setValue, onSubmit, onDocumentRemove }) {
  const activeItem = useMemo(() => (section?.items || []).find((item) => item.key === value?.details?.key) || section?.items?.[0] || null, [section, value]);
  const ledgerOptions = useMemo(() => buildOptions(lookups.ledgers || []), [lookups]);
  const bankOptions = useMemo(() => buildOptions(lookups.bankAccounts || []), [lookups]);
  const receiptToLabel = getTransactionLedgerLabel(value.partyCode || '', lookups);
  const receiptByLabel = getTransactionLedgerLabel(value.details?.settlementAccount || '', lookups);

  function setRoot(key, nextValue) {
    setValue((current) => ({ ...(current || {}), [key]: nextValue }));
  }

  function setDetail(key, nextValue) {
    setValue((current) => ({ ...(current || {}), details: { ...(current?.details || {}), [key]: nextValue } }));
  }

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full space-y-6" onSubmit={onSubmit}>
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-500">Receipt Voucher</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{activeItem?.label || 'Receipt'}</h3>
          <p className="mt-1 text-sm text-slate-500">Voucher entry for receipt by, receipt to, amount, and narration.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Voucher No</FieldLabel>
            <Input
              value={value.voucherNo || ''}
              onChange={(e) => setRoot('voucherNo', String(e.target.value || '').toUpperCase())}
              placeholder="Auto generated on save"
              className="font-mono uppercase tracking-wider"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input type="date" value={value.date || ''} onChange={(e) => setRoot('date', e.target.value)} />
          </div>

          <LookupSelect
            label="Receipt By"
            value={value.details?.settlementAccount || ''}
            onChange={(next) => setDetail('settlementAccount', next)}
            placeholder="Select receipt by"
            options={[...ledgerOptions, ...bankOptions]}
            helper="Cash-in-hand, bank, or settlement account."
          />

          <LookupSelect
            label="Receipt To"
            value={value.partyCode || ''}
            onChange={(next) => {
              setRoot('partyCode', String(next || '').toUpperCase());
              setRoot('partyType', 'ledger');
            }}
            placeholder="Select ledger"
            options={ledgerOptions}
            required
            helper="Ledger receiving the receipt amount."
          />

          <div className="space-y-1.5">
            <FieldLabel required>Amount</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={value.amount ?? ''}
              onChange={(e) => setRoot('amount', e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={formatTransactionAmount(value.amount ?? 0)} readOnly />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel>Narration</FieldLabel>
            <Textarea
              rows={4}
              value={value.narration || ''}
              onChange={(e) => setRoot('narration', e.target.value)}
              placeholder="Enter narration"
            />
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${toneClassName('emerald')}`}>
            <FileText size={18} strokeWidth={1.9} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Attachments</h3>
            <p className="text-sm text-slate-500">Receipt voucher copy, cash receipt, and bank receipt.</p>
          </div>
        </div>
        <DocumentSection
          title=""
          description=""
          definitions={getReceiptInterestDocumentDefinitions('receipt-voucher')}
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

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>Receipt By:</span>
        <span className="font-medium text-slate-900">{receiptByLabel || '—'}</span>
        <span className="text-slate-300">•</span>
        <span>Receipt To:</span>
        <span className="font-medium text-slate-900">{receiptToLabel || '—'}</span>
      </div>
    </form>
  );
}

export default ReceiptVoucherForm;

import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { getReceiptInterestDocumentDefinitions } from './receiptInterestDocumentUtils';
import { formatTransactionAmount, toneClassName } from './transactionUtils';

function FieldLabel({ children, required = false }) {
  return (
    <label className="text-[13px] font-semibold text-slate-700">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </label>
  );
}

function buildOptions(items = [], mapper = (item) => ({ value: item.code || item.value || '', label: `${item.code || item.value || ''}${item.name || item.fullName ? ` - ${item.name || item.fullName}` : ''}`.trim() })) {
  return (Array.isArray(items) ? items : []).filter(Boolean).map(mapper).filter((item) => item.value);
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

export function InterestVoucherForm({ section, lookups = {}, value, setValue, onSubmit, onDocumentRemove }) {
  const activeItem = useMemo(() => (section?.items || []).find((item) => item.key === value?.details?.key) || section?.items?.[0] || null, [section, value]);
  const memberOptions = useMemo(() => buildOptions(lookups.members || [], (item) => ({ value: item.code || '', label: `${item.code || ''}${item.name ? ` - ${item.name}` : ''}`.trim() })), [lookups]);
  const ledgerOptions = useMemo(() => buildOptions(lookups.ledgers || [], (item) => ({ value: item.code || '', label: `${item.code || ''}${item.name ? ` - ${item.name}` : ''}`.trim() })), [lookups]);
  const selectedMember = useMemo(() => (lookups.members || []).find((member) => String(member.code || '').trim().toUpperCase() === String(value.partyCode || '').trim().toUpperCase()) || null, [lookups, value]);

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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-500">Interest Payment</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{activeItem?.label || 'Interest Paid to Member'}</h3>
          <p className="mt-1 text-sm text-slate-500">Member interest posting with account head, amount, and narration.</p>
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
            label="Member Code"
            value={value.partyCode || ''}
            onChange={(next) => {
              setRoot('partyCode', String(next || '').toUpperCase());
              setRoot('partyType', 'member');
            }}
            options={memberOptions}
            placeholder="Search member by code"
            required
            helper="Member code from the master members table."
          />

          <div className="space-y-1.5">
            <FieldLabel>Member Name</FieldLabel>
            <Input value={selectedMember?.name || '—'} readOnly />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Branch</FieldLabel>
            <Input value={selectedMember?.branchCode || selectedMember?.branch || '—'} readOnly />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Designation</FieldLabel>
            <Input value={selectedMember?.designation || '—'} readOnly />
          </div>

          <LookupSelect
            label="Account Head"
            value={value.details?.accountHead || ''}
            onChange={(next) => setDetail('accountHead', next)}
            options={ledgerOptions}
            placeholder="Select account head"
            helper="Ledger head used for interest posting."
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
            <FieldLabel>Interest</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={value.details?.interestAmount ?? ''}
              onChange={(e) => setDetail('interestAmount', e.target.value)}
              placeholder="0.00"
            />
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
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${toneClassName('pink')}`}>
            <FileText size={18} strokeWidth={1.9} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Attachments</h3>
            <p className="text-sm text-slate-500">Interest worksheet, sanction note, bank advice, and receipt copy.</p>
          </div>
        </div>
        <DocumentSection
          title=""
          description=""
          definitions={getReceiptInterestDocumentDefinitions('interest-paid-member')}
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
        <span>Member:</span>
        <span className="font-medium text-slate-900">{selectedMember?.code ? `${selectedMember.code} - ${selectedMember.name || ''}`.trim() : '—'}</span>
        <span className="text-slate-300">•</span>
        <span>Interest:</span>
        <span className="font-medium text-slate-900">{formatTransactionAmount(value.details?.interestAmount ?? 0)}</span>
      </div>
    </form>
  );
}

export default InterestVoucherForm;

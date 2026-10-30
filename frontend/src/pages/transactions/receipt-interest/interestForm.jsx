import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { getReceiptInterestDocumentDefinitions } from './receiptInterestDocumentUtils';
import { formatTransactionAmount, toneClassName } from './transactionUtils';
import { useInDialog } from '../../../components/ui/dialogContext';
import { FormSectionTitle, HideInDialog, OnlyInDialog } from '../../../components/ui/FormSectionTitle';
import { membersInFy } from '../../../lib/fyMembers';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';

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

export function InterestVoucherForm({ section, lookups = {}, value, setValue, onSubmit, onDocumentRemove, isEditing = false }) {
  // Inside a dialog its title already names the voucher type.
  const inDialog = useInDialog();
  const activeItem = useMemo(() => (section?.items || []).find((item) => item.key === value?.details?.key) || section?.items?.[0] || null, [section, value]);
  const isEmployee = activeItem?.key === 'interest-recv-employee';

  const memberOptions = useMemo(() => buildOptions(membersInFy(lookups.members), (item) => ({ value: item.code || '', label: `${item.code || ''}${item.name ? ` - ${item.name}` : ''}`.trim() })), [lookups]);
  const employeeOptions = useMemo(() => buildOptions(lookups.employees || [], (item) => ({ value: item.code || '', label: `${item.code || ''}${item.name || item.fullName ? ` - ${item.name || item.fullName}` : ''}`.trim() })), [lookups]);
  
  const selectedMember = useMemo(() => (lookups.members || []).find((member) => String(member.code || '').trim().toUpperCase() === String(value.partyCode || '').trim().toUpperCase()) || null, [lookups, value]);
  const selectedEmployee = useMemo(() => (lookups.employees || []).find((employee) => String(employee.code || '').trim().toUpperCase() === String(value.partyCode || '').trim().toUpperCase()) || null, [lookups, value]);

  const accountTypeOptions = useMemo(() => {
    switch (activeItem?.key) {
      case 'interest-paid-member':
        return [
          { value: 'Compulsary Deposit', label: 'Compulsary Deposit' },
          { value: 'Saving Deposit', label: 'Saving Deposit' }
        ];
      case 'interest-recv-employee':
        return [
          { value: 'House Loan to Employee', label: 'House Loan to Employee' },
          { value: 'Vehicle Loan to Employee', label: 'Vehicle Loan to Employee' }
        ];
      case 'interest-recv-member':
      default:
        return [
          { value: 'Loan to Member', label: 'Loan to Member' },
          { value: 'Deposit Loan to Member', label: 'Deposit Loan to Member' }
        ];
    }
  }, [activeItem?.key]);

  function setRoot(key, nextValue) {
    setValue((current) => ({ ...(current || {}), [key]: nextValue }));
  }

  function setDetail(key, nextValue) {
    setValue((current) => ({ ...(current || {}), details: { ...(current?.details || {}), [key]: nextValue } }));
  }

  const { token } = useAuth();
  const isPaidMember = activeItem?.key === 'interest-paid-member';
  const [dueState, setDueState] = useState('');

  // The A/C picks the head and its interest ledger: never left blank.
  useEffect(() => {
    if (!value.details?.accountType && accountTypeOptions[0]) setDetail('accountType', accountTypeOptions[0].value);
  }, [accountTypeOptions]);

  // The interest is the voucher's amount (legacy TotalAmt); there is no
  // separate Amount to enter.
  useEffect(() => {
    const interest = value.details?.interestAmount ?? '';
    // An older voucher saved with the amount only: that amount is its interest.
    if (interest === '' && Number(value.amount) > 0) {
      setDetail('interestAmount', value.amount);
      return;
    }
    if (String(value.amount ?? '') !== String(interest)) setRoot('amount', interest);
  }, [value.details?.interestAmount]);

  // Interest Paid To Member, as legacy: the CD / SSA interest accrued up to
  // the voucher date, filled in for a new voucher (it can still be changed).
  const memberCode = value.partyCode || '';
  const accountType = value.details?.accountType || '';
  const voucherDate = value.date || '';
  useEffect(() => {
    // Only once the date is a whole one (the field reports each typed year).
    if (!isPaidMember || isEditing || !token || !memberCode || !accountType || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(voucherDate)) return undefined;
    let cancelled = false;
    setDueState('loading');
    api.banking.getMemberInterestDue(token, { memberCode, accountType, date: voucherDate })
      .then((response) => {
        if (cancelled) return;
        const due = response?.data ?? response;
        setDetail('interestAmount', Number(due?.interest || 0));
        setDueState('done');
      })
      .catch(() => { if (!cancelled) setDueState('failed'); });
    return () => { cancelled = true; };
  }, [isPaidMember, isEditing, token, memberCode, accountType, voucherDate]);

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full space-y-3" onSubmit={onSubmit}>
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {!inDialog && (
          <div className="mb-5 border-b border-slate-100 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-500">Interest Payment</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-900">{activeItem?.label || 'Interest Paid to Member'}</h3>
            <p className="mt-1 text-sm text-slate-500">Interest posting with account head, interest and narration.</p>
          </div>
        )}
        {inDialog && <div className="mb-3"><FormSectionTitle>Voucher</FormSectionTitle></div>}

        <div className="grid gap-3 md:grid-cols-4">
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
            label={isEmployee ? "Employee Code" : "Member Code"}
            value={value.partyCode || ''}
            onChange={(next) => {
              setRoot('partyCode', String(next || '').toUpperCase());
              setRoot('partyType', isEmployee ? 'employee' : 'member');
            }}
            options={isEmployee ? employeeOptions : memberOptions}
            placeholder={`Search ${isEmployee ? 'employee' : 'member'} by code`}
            required
            helper={`${isEmployee ? 'Employee' : 'Member'} code from the master table.`}
          />

          <div className="space-y-1.5">
            <FieldLabel>{isEmployee ? "Employee Name" : "Member Name"}</FieldLabel>
            <Input value={isEmployee ? (selectedEmployee?.name || selectedEmployee?.fullName || '—') : (selectedMember?.name || '—')} readOnly />
          </div>

          {!isEmployee && (
            <div className="space-y-1.5">
              <FieldLabel>Branch</FieldLabel>
              <Input value={selectedMember?.branchCode || selectedMember?.branch || '—'} readOnly />
            </div>
          )}

          <div className="space-y-1.5">
            <FieldLabel>{isEmployee ? "Employee Post" : "Designation"}</FieldLabel>
            <Input value={isEmployee ? (selectedEmployee?.designation || '—') : (selectedMember?.designation || '—')} readOnly />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>A/C</FieldLabel>
            <CustomSelect
              value={value.details?.accountType || ''}
              onChange={(next) => setDetail('accountType', next)}
              className="w-full"
              placeholder="Select A/C Type"
              options={accountTypeOptions}
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Payment Mode</FieldLabel>
            <CustomSelect
              value={value.mode || ''}
              onChange={(next) => setRoot('mode', next)}
              className="w-full"
              placeholder="Select Mode"
              options={[
                { value: 'Cash', label: 'Cash' },
                { value: 'Transfer', label: 'Transfer' }
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel required>Interest</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={value.details?.interestAmount ?? ''}
              onChange={(e) => setDetail('interestAmount', e.target.value)}
              placeholder="0.00"
            />
            {isPaidMember && !isEditing ? (
              <p className="text-[12px] text-slate-500">
                {dueState === 'loading' ? 'Working out the interest…'
                  : dueState === 'failed' ? 'Could not work out the interest; enter it.'
                    : 'Interest accrued from 1 April to the voucher date; you can change it.'}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input
              type="number"
              value={value.details?.interestAmount ?? ''}
              readOnly
              className="bg-slate-50 text-slate-500"
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5 md:col-span-3">
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
        <HideInDialog>
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${toneClassName('pink')}`}>
              <FileText size={18} strokeWidth={1.9} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Attachments</h3>
              <p className="text-sm text-slate-500">Interest worksheet, sanction note, bank advice, and receipt copy.</p>
            </div>
          </div>
        </HideInDialog>
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
        <span>{isEmployee ? "Employee:" : "Member:"}</span>
        <span className="font-medium text-slate-900">
          {isEmployee
            ? selectedEmployee?.code ? `${selectedEmployee.code} - ${selectedEmployee.name || selectedEmployee.fullName || ''}`.trim() : '—'
            : selectedMember?.code ? `${selectedMember.code} - ${selectedMember.name || ''}`.trim() : '—'}
        </span>
        <span className="text-slate-300">•</span>
        <span>Interest:</span>
        <span className="font-medium text-slate-900">{formatTransactionAmount(value.details?.interestAmount ?? 0)}</span>
      </div>
    </form>
  );
}

export default InterestVoucherForm;

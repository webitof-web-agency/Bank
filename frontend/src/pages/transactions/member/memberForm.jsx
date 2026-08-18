import { useMemo, useRef, useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../api/api';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { getMemberDocumentDefinitions } from './memberDocumentUtils';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function setPath(target, path, nextValue) {
  const parts = Array.isArray(path) ? path : String(path).split('.');
  let cursor = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }

  cursor[parts[parts.length - 1]] = nextValue;
}

function setDetailsValue(setValue, path, nextValue) {
  setValue((current) => {
    const next = deepClone(current);
    if (!next.details || typeof next.details !== 'object') next.details = {};
    setPath(next.details, path, nextValue);
    return next;
  });
}

function setRootValue(setValue, key, nextValue) {
  setValue((current) => ({ ...(current || {}), [key]: nextValue }));
}

function formatLookupLabel(item = {}) {
  const code = item.code || item.value || '';
  const name = item.name || item.label || '';
  return `${code}${name ? ` - ${name}` : ''}`.trim();
}

function buildGroups(items = [], label = '') {
  const rows = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item) => ({ value: item.code || item.value || '', label: formatLookupLabel(item) }))
    .filter((item) => item.value);
  return rows.length ? [{ label, items: rows }] : [];
}

function getMemberLookupGroups(lookups = {}) {
  return buildGroups(lookups.members, 'Members');
}

function getBranchLabel(lookups = {}, code = '') {
  const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
  const branch = branches.find((item) => String(item.value || item.code || '').toUpperCase() === String(code || '').toUpperCase());
  return branch?.label || branch?.name || code || '-';
}

function getMemberRecord(lookups = {}, code = '') {
  const members = Array.isArray(lookups.members) ? lookups.members : [];
  return members.find((item) => String(item.code || item.value || '').toUpperCase() === String(code || '').toUpperCase()) || null;
}

function getDesignationLabel(member = {}) {
  return member?.designation || '-';
}

function getPaymentOptions(activeKey = '') {
  if (activeKey === 'recovery-member') {
    return [
      { label: 'Cash', value: 'CASH' },
      { label: 'DD', value: 'DD' },
      { label: 'Cheque', value: 'CHEQUE' }
    ];
  }

  if (activeKey === 'ssa-paid-member') {
    return [
      { label: 'Cash-in-Hand', value: 'CASH-IN-HAND' },
      { label: 'Cheque', value: 'CHEQUE' },
      { label: 'Transfer', value: 'TRANSFER' }
    ];
  }

  return [
    { label: 'Cash', value: 'CASH' },
    { label: 'Cheque', value: 'CHEQUE' },
    { label: 'Transfer', value: 'TRANSFER' }
  ];
}

function FieldLabel({ children, required = false }) {
  return <label className="text-[13px] font-semibold text-slate-700">{children}{required ? <span className="text-rose-500"> *</span> : null}</label>;
}

function SectionTitle({ children, subtitle = '' }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{children}</div>
      {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function LookupSelect({ label, value, onChange, groups = [], placeholder = 'Select...', required = false, disabled = false }) {
  const flatOptions = useMemo(() => {
    const opts = [];
    groups.forEach((group) => {
      group.items.forEach((item) => {
        opts.push({ label: group.label ? `${item.label} (${group.label})` : item.label, value: item.value });
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
    </div>
  );
}

const RECOVERY_HEADS = [
  ['share', 'Share'],
  ['cd', 'Cmp. Dep.'],
  ['ssa', 'SSA'],
  ['loan', 'Loan'],
  ['lad', 'LAD'],
  ['ins', 'Ins.'],
  ['other', 'Other']
];

function getRowHeads(row = {}) {
  const heads = row?.heads || {};
  return {
    share: heads.share ?? '',
    cd: heads.cd ?? heads.compulsoryDeposit ?? '',
    ssa: heads.ssa ?? '',
    loan: heads.loan ?? '',
    lad: heads.lad ?? '',
    ins: heads.ins ?? heads.insurance ?? '',
    other: heads.other ?? (Number(heads.suspense || 0) + Number(heads.admfee || 0) || '')
  };
}

function getRecoveryRowTotal(row = {}) {
  const heads = getRowHeads(row);
  return RECOVERY_HEADS.reduce((sum, [key]) => sum + Number(heads[key] || 0), 0);
}

function normalizeRecoveryRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...(row || {}),
    heads: getRowHeads(row)
  }));
}

function RecoveryLinesEditor({ rows = [], onChange, memberGroups = [], demandRows = [] }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const [draftLine, setDraftLine] = useState({
    member: '',
    heads: { suspense: '', admfee: '', share: '', cd: '', ssa: '', loan: '', lad: '', ins: '' }
  });

  function updateDraftHead(key, value) {
    setDraftLine((curr) => ({ ...curr, heads: { ...curr.heads, [key]: value } }));
  }

  function addRow() {
    if (!draftLine.member) {
      alert("Please select a member");
      return;
    }
    onChange([...safeRows, { member: draftLine.member, heads: { ...draftLine.heads } }]);
    setDraftLine({ member: '', heads: { suspense: '', admfee: '', share: '', cd: '', ssa: '', loan: '', lad: '', ins: '' } });
  }

  function addFromDemandList() {
    const demand = Array.isArray(demandRows) ? demandRows.find((item) => String(item?.memberCode || '').trim()) || demandRows[0] : null;
    if (demand) {
      onChange([...safeRows, {
        member: demand.memberCode || '',
        heads: { other: demand.pending ?? '' }
      }]);
    }
  }

  function removeRow(index) {
    onChange(safeRows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <SectionTitle>Add Recovery Line</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <LookupSelect
              label="Member Code *"
              value={draftLine.member}
              onChange={(val) => setDraftLine((curr) => ({ ...curr, member: val }))}
              placeholder="Search member..."
              groups={memberGroups}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Suspense A/C</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draftLine.heads.suspense} onChange={(e) => updateDraftHead('suspense', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Admission Fee</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draftLine.heads.admfee} onChange={(e) => updateDraftHead('admfee', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Share</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draftLine.heads.share} onChange={(e) => updateDraftHead('share', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Compulsory Deposit</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draftLine.heads.cd} onChange={(e) => updateDraftHead('cd', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Special Saving A/C</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draftLine.heads.ssa} onChange={(e) => updateDraftHead('ssa', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Regular Loan</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draftLine.heads.loan} onChange={(e) => updateDraftHead('loan', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Loan Against Deposit</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draftLine.heads.lad} onChange={(e) => updateDraftHead('lad', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Insurance Premium</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draftLine.heads.ins} onChange={(e) => updateDraftHead('ins', e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={addFromDemandList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Add From Demand List
          </button>
          <button type="button" onClick={addRow} className="rounded-lg bg-[var(--primary,#2563eb)] px-4 py-2 text-sm font-medium text-white hover:bg-[color-mix(in_srgb,var(--primary)_85%,black)]">
            + Add Line
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>Recovery Lines</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Member</th>
                {RECOVERY_HEADS.map(([_, label]) => <th key={label} className="px-3 py-3">{label}</th>)}
                <th className="px-3 py-3">Total</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {safeRows.length ? safeRows.map((row, index) => {
                const heads = getRowHeads(row);
                return (
                  <tr key={`recovery-row-${index}`}>
                    <td className="px-3 py-3 align-top font-medium text-slate-700">{row.member}</td>
                    {RECOVERY_HEADS.map(([key]) => (
                      <td key={`${index}-${key}`} className="px-3 py-3 align-top text-slate-600">
                        {heads[key] || '-'}
                      </td>
                    ))}
                    <td className="px-3 py-3 align-top font-semibold text-slate-700">{getRecoveryRowTotal(row) || 0}</td>
                    <td className="px-3 py-3 align-top text-right">
                      <button type="button" onClick={() => removeRow(index)} className="text-rose-500 hover:text-rose-700 font-medium">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={RECOVERY_HEADS.length + 3} className="px-3 py-6 text-center text-slate-500">
                    No lines added yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SimpleDocumentList({ definitions = [], documents = {}, onPickFile, onClearFile }) {
  const inputRefs = useRef({});

  function triggerPicker(key) {
    inputRefs.current[key]?.click();
  }

  function handlePick(key, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onPickFile) return;
    onPickFile(key, file);
  }

  return (
    <div className="space-y-3">
      {definitions.map((definition) => {
        const document = documents?.[definition.key] || null;
        const fileName = document?.fileName || document?.originalName || '';
        return (
          <div key={definition.key} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{definition.label}</p>
                {definition.description ? <p className="text-xs text-slate-500">{definition.description}</p> : null}
                <p className="mt-1 text-xs text-slate-700">{fileName || 'No file selected'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={(node) => {
                    inputRefs.current[definition.key] = node;
                  }}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(event) => handlePick(definition.key, event)}
                />
                <button type="button" onClick={() => triggerPicker(definition.key)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {document ? 'Replace file' : 'Select file'}
                </button>
                {document ? (
                  <button type="button" onClick={() => onClearFile?.(definition.key, document)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MemberTransactionForm({ section, lookups = {}, value, setValue, onSubmit, onDocumentRemove, activeKey: forcedActiveKey = '' }) {
  const { token } = useAuth();
  const draft = value || {};

  useEffect(() => {
    let mounted = true;
    if (!draft.voucherNo && !draft.id) {
      api.banking.getNextVoucherNo(token, draft.branchCode)
        .then((res) => {
          if (!mounted) return;
          if (res?.success && res?.data?.voucherNo) {
            setValue((prev) => ({ ...prev, voucherNo: res.data.voucherNo }));
          } else {
            setValue((prev) => ({ ...prev, voucherNo: 'Err: ' + JSON.stringify(res) }));
          }
        })
        .catch((err) => {
          if (mounted) setValue((prev) => ({ ...prev, voucherNo: 'Error: ' + err.message }));
        });
    }
    return () => {
      mounted = false;
    };
  }, [draft.id, draft.voucherNo, draft.branchCode, setValue, token]);

  const editableItems = useMemo(() => (section?.items || []).filter((item) => !item.route), [section]);
  const activeKey = draft?.details?.key || forcedActiveKey || editableItems[0]?.key || '';
  const activeItem = editableItems.find((item) => item.key === activeKey) || editableItems[0] || null;
  const memberGroups = useMemo(() => getMemberLookupGroups(lookups), [lookups]);
  const paymentOptions = useMemo(() => getPaymentOptions(activeKey), [activeKey]);
  const documentDefs = useMemo(() => getMemberDocumentDefinitions(activeKey), [activeKey]);
  const memberRecord = getMemberRecord(lookups, draft.partyCode);
  const demandRows = Array.isArray(lookups.demands) ? lookups.demands : [];
  const isLoan = activeKey === 'loan-paid-member';
  const isDeposit = activeKey === 'deposit-paid-member';
  const isInsurance = activeKey === 'insurance-paid-member';
  const isSsa = activeKey === 'ssa-paid-member';
  const isRecovery = activeKey === 'recovery-member';
  const recoveryRows = normalizeRecoveryRows(Array.isArray(draft.details?.recoveryLines) ? draft.details.recoveryLines : []);
  const loanAmount = Number(draft.details?.components?.loanAmt || 0);
  const ladAmount = Number(draft.details?.components?.lad || 0);
  const recoveryTotal = recoveryRows.reduce((sum, row) => sum + getRecoveryRowTotal(row), 0);
  const amountValue = isLoan ? loanAmount + ladAmount : isRecovery ? recoveryTotal : Number(draft.amount || 0);

  function updateDetails(path, nextValue) {
    setDetailsValue(setValue, path, nextValue);
  }

  function updateComponents(path, nextValue) {
    setDetailsValue(setValue, ['components', path], nextValue);
  }

  function updateRecoveryRows(nextRows) {
    setDetailsValue(setValue, 'recoveryLines', nextRows);
    const nextTotal = nextRows.reduce((sum, row) => sum + getRecoveryRowTotal(row), 0);
    setRootValue(setValue, 'amount', nextTotal > 0 ? nextTotal : '');
  }

  function setAmount(nextValue) {
    setRootValue(setValue, 'amount', nextValue);
  }

  function setPartyCode(nextValue) {
    const code = String(nextValue || '').toUpperCase();
    const mem = getMemberRecord(lookups, code);
    const branch = mem?.branchName || mem?.branch || mem?.branchCode || '';
    setValue((current) => ({
      ...(current || {}),
      partyCode: code,
      branchCode: branch
    }));
  }

  function updateDocumentMap(key, file) {
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
  }

  function clearDocument(key, document) {
    onDocumentRemove?.(key, document);
    setValue((current) => ({
      ...(current || {}),
      documents: {
        ...(current?.documents || {}),
        [key]: null
      }
    }));
  }

  function renderCommonHeader() {
    return (
      <section className="space-y-3">
        <SectionTitle>
          Voucher and Member
        </SectionTitle>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel>Voucher No.</FieldLabel>
            <Input value={draft.voucherNo || ''} readOnly placeholder="Generating..." />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input type="date" value={draft.date || ''} onChange={(event) => setRootValue(setValue, 'date', event.target.value)} />
          </div>

          <LookupSelect
            label="Member Code"
            value={draft.partyCode || ''}
            onChange={setPartyCode}
            placeholder="Search member by code or name"
            groups={memberGroups}
            required
          />
          <div className="space-y-1.5">
            <FieldLabel>Member Name</FieldLabel>
            <Input value={memberRecord?.name || '-'} readOnly />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Branch</FieldLabel>
            <Input value={getBranchLabel(lookups, memberRecord?.branchName || memberRecord?.branch || memberRecord?.branchCode)} readOnly />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Designation</FieldLabel>
            <Input value={getDesignationLabel(memberRecord)} readOnly />
          </div>
        </div>
      </section>
    );
  }

  function renderLoanForm() {
    return (
      <section className="space-y-3">
        <SectionTitle>Loan Disbursement</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Settlement Account</FieldLabel>
            <Input value={draft.details?.settlementAccount || ''} onChange={(event) => updateDetails('settlementAccount', event.target.value)} placeholder="Settlement account or ledger" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Loan Amount</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.details?.components?.loanAmt ?? ''}
              onChange={(event) => {
                updateComponents('loanAmt', event.target.value);
                setAmount(Number(event.target.value || 0) + Number(draft.details?.components?.lad || 0));
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>LAD (Loan Against Deposit)</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.details?.components?.lad ?? ''}
              onChange={(event) => {
                updateComponents('lad', event.target.value);
                setAmount(Number(draft.details?.components?.loanAmt || 0) + Number(event.target.value || 0));
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Payment Mode</FieldLabel>
            <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={amountValue || ''} readOnly />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
            Send SMS to member
          </label>
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Loan disbursement remarks" />
          </div>
        </div>
      </section>
    );
  }

  function renderDepositForm() {
    return (
      <section className="space-y-3">
        <SectionTitle>Compulsory Deposit</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Settlement Account</FieldLabel>
            <Input value={draft.details?.settlementAccount || ''} onChange={(event) => updateDetails('settlementAccount', event.target.value)} placeholder="Settlement account or ledger" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Amount</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draft.amount ?? ''} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Account Head</FieldLabel>
            <Input value={draft.details?.accountHead || ''} onChange={(event) => updateDetails('accountHead', event.target.value)} placeholder="Deposit account head" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Paymode</FieldLabel>
            <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={amountValue || ''} readOnly />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
            Send SMS to member
          </label>
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Deposit payout remarks" />
          </div>
        </div>
      </section>
    );
  }

  function renderInsuranceForm() {
    return (
      <section className="space-y-3">
        <SectionTitle>Insurance Premium</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Settlement Account</FieldLabel>
            <Input value={draft.details?.settlementAccount || ''} onChange={(event) => updateDetails('settlementAccount', event.target.value)} placeholder="Settlement account or ledger" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Amount</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draft.amount ?? ''} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Policy No.</FieldLabel>
            <Input value={draft.details?.policyNo || ''} onChange={(event) => updateDetails('policyNo', event.target.value)} placeholder="Insurance policy number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Claim Ref.</FieldLabel>
            <Input value={draft.details?.claimRef || ''} onChange={(event) => updateDetails('claimRef', event.target.value)} placeholder="Claim or reference number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Payment</FieldLabel>
            <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={amountValue || ''} readOnly />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
            Send SMS to member
          </label>
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Insurance payout remarks" />
          </div>
        </div>
      </section>
    );
  }

  function renderSsaForm() {
    return (
      <section className="space-y-3">
        <SectionTitle>SSA Payment</SectionTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel required>Amount</FieldLabel>
            <Input type="number" min="0" step="0.01" value={draft.amount ?? ''} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Paymode</FieldLabel>
            <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select paymode" searchable={false} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque No.</FieldLabel>
            <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Cheque Date</FieldLabel>
            <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={amountValue || ''} readOnly />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
            Send SMS to member
          </label>
          <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
            <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="SSA payment remarks" />
          </div>
        </div>
      </section>
    );
  }

  function renderRecoveryForm() {
    return (
      <section className="space-y-3">
        <div className="space-y-3">
          <SectionTitle>Voucher</SectionTitle>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <FieldLabel>Voucher No.</FieldLabel>
              <Input value={draft.voucherNo || ''} readOnly placeholder="Generating..." />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Date</FieldLabel>
              <Input type="date" value={draft.date || ''} onChange={(event) => setRootValue(setValue, 'date', event.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
              <FieldLabel required>Mode</FieldLabel>
              <CustomSelect value={draft.mode || ''} onChange={(next) => setRootValue(setValue, 'mode', next)} options={paymentOptions} placeholder="Select mode" searchable={false} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>DD / Cheque No.</FieldLabel>
              <Input value={draft.instrumentNo || ''} onChange={(event) => setRootValue(setValue, 'instrumentNo', event.target.value)} placeholder="DD / cheque number" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Instrument Date</FieldLabel>
              <Input type="date" value={draft.instrumentDate || ''} onChange={(event) => setRootValue(setValue, 'instrumentDate', event.target.value)} />
            </div>
          </div>
        </div>

        <RecoveryLinesEditor rows={recoveryRows} onChange={updateRecoveryRows} memberGroups={memberGroups} demandRows={demandRows} />

        <div className="space-y-3">
          <SectionTitle>Total and Narration</SectionTitle>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <FieldLabel>Total Recovery Amount</FieldLabel>
              <Input value={amountValue || ''} readOnly />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
            <input type="checkbox" checked={!!draft.details?.sms} onChange={(event) => updateDetails('sms', event.target.checked)} />
              Send SMS to member
            </label>
            <div className="space-y-1.5 md:col-span-3">
            <FieldLabel>Narration</FieldLabel>
              <Textarea rows={3} value={draft.narration || ''} onChange={(event) => setRootValue(setValue, 'narration', event.target.value)} placeholder="Recovery remarks" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form id="transaction-voucher-form" className="mx-auto w-full max-w-5xl space-y-3" onSubmit={onSubmit}>
      {!isRecovery && renderCommonHeader()}
      {isLoan ? renderLoanForm() : null}
      {isDeposit ? renderDepositForm() : null}
      {isInsurance ? renderInsuranceForm() : null}
      {isSsa ? renderSsaForm() : null}
      {isRecovery ? renderRecoveryForm() : null}
      {documentDefs.length ? (
        <section className="space-y-3">
          <SectionTitle>Attachments</SectionTitle>
          <SimpleDocumentList definitions={documentDefs} documents={draft.documents || {}} onPickFile={updateDocumentMap} onClearFile={clearDocument} />
        </section>
      ) : null}
    </form>
  );
}

export default MemberTransactionForm;

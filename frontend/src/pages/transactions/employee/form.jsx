import { useEffect, useMemo } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { Select as CustomSelect } from '../../../components/ui/Select';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { getEmployeeDocumentDefinitions } from './employeeDocumentUtils';
import { getEmployeeComponentTotal } from './transactionUtils';

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
  const label = item.fullName || item.name || item.label || '';
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

function LookupSelect({ label, value, onChange, groups = [], placeholder = 'Select...', helper = '', required = false }) {
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
        placeholder={placeholder}
        options={flatOptions}
        searchable
      />
      {helper ? <p className="text-[12px] text-slate-500">{helper}</p> : null}
    </div>
  );
}

function readEmployeeDetails(lookups = {}, code = '') {
  const employee = (lookups.employees || []).find((row) => String(row.code || '').toUpperCase() === String(code || '').toUpperCase());
  if (!employee) {
    return { name: '—', branch: '—', designation: '—' };
  }

  const branch = (lookups.branches || []).find((row) => String(row.code || row.value || '').toUpperCase() === String(employee.branch || '').toUpperCase());
  return {
    name: employee.fullName || employee.name || '—',
    branch: branch?.label || branch?.name || branch?.code || employee.branch || '—',
    designation: employee.designation || '—'
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildModeOptions(activeKey = '') {
  if (activeKey === 'advance-recovery-emp') {
    return [
      { value: 'Cash', label: 'Cash' },
      { value: 'Transfer', label: 'Transfer' }
    ];
  }

  return [
    { value: 'Cash', label: 'Cash' },
    { value: 'Cheque', label: 'Cheque' }
  ];
}

function getModeLabel(activeKey = '') {
  return activeKey === 'advance-recovery-emp' ? 'Paymode' : 'Payment';
}

export function EmployeeTransactionForm({ section, itemKey, lookups = {}, value, setValue, onSubmit, onDocumentRemove }) {
  const items = useMemo(() => (section?.items || []).filter((item) => !itemKey || item.key === itemKey), [section, itemKey]);
  const activeKey = itemKey || value?.details?.key || items[0]?.key || '';
  const activeItem = items.find((item) => item.key === activeKey) || items[0] || null;
  const employeeGroups = useMemo(() => buildGroups(lookups.employees, 'Employees'), [lookups]);
  const employeeCode = value?.partyCode || '';
  const employeeDetails = readEmployeeDetails(lookups, employeeCode);
  const documentDefs = getEmployeeDocumentDefinitions(activeKey);
  const modeOptions = buildModeOptions(activeKey);
  const totalAmount = useMemo(() => getEmployeeComponentTotal(value), [value]);
  const instrumentVisible = activeKey === 'advance-paid-emp';

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

  function updateComponent(key, nextValue) {
    updateValue((next) => {
      if (!next.details || typeof next.details !== 'object') {
        next.details = {};
      }
      if (!next.details.components || typeof next.details.components !== 'object') {
        next.details.components = { house: '', vehicle: '', grain: '' };
      }
      next.details.components[key] = nextValue;
      const amount = toNumber(next.details.components.house) + toNumber(next.details.components.vehicle) + toNumber(next.details.components.grain);
      next.amount = amount;
    });
  }

  function updateRoot(key, nextValue) {
    setValue((current) => ({ ...(current || {}), [key]: nextValue }));
  }

  useEffect(() => {
    if (String(value?.amount ?? '') !== String(totalAmount)) {
      updateRoot('amount', totalAmount);
    }
  }, [totalAmount]);

  useEffect(() => {
    if (!value?.mode) {
      updateRoot('mode', modeOptions[0]?.value || 'Cash');
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
              onChange={(e) => updateRoot('voucherNo', String(e.target.value || '').toUpperCase())}
              placeholder="Auto generated on save"
              className="font-mono uppercase tracking-wider"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Date</FieldLabel>
            <Input type="date" value={value.date || ''} onChange={(e) => updateRoot('date', e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-500">Employee Transactions</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{activeItem?.label || 'Employee Transaction'}</h3>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Employee
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <LookupSelect
              label="Employee Code"
              required
              value={value.partyCode || ''}
              onChange={(next) => updateRoot('partyCode', String(next || '').toUpperCase())}
              placeholder="Search employee by code or name"
              groups={employeeGroups}
              helper="Employee code is linked from employee master."
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Employee Name</FieldLabel>
            <Input value={employeeDetails.name} readOnly placeholder="—" />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Branch</FieldLabel>
            <Input value={employeeDetails.branch} readOnly placeholder="—" />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Designation</FieldLabel>
            <Input value={employeeDetails.designation} readOnly placeholder="—" />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Total Amount</FieldLabel>
            <Input value={totalAmount || 0} readOnly />
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Plus size={16} />
          Advance Heads
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel>House Loan</FieldLabel>
            <Input type="number" min="0" step="0.01" value={value.details?.components?.house ?? ''} onChange={(e) => updateComponent('house', e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Vehicle Loan</FieldLabel>
            <Input type="number" min="0" step="0.01" value={value.details?.components?.vehicle ?? ''} onChange={(e) => updateComponent('vehicle', e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Grain Advance</FieldLabel>
            <Input type="number" min="0" step="0.01" value={value.details?.components?.grain ?? ''} onChange={(e) => updateComponent('grain', e.target.value)} placeholder="0.00" />
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 text-sm font-semibold text-slate-900">{getModeLabel(activeKey)}</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <FieldLabel required>{getModeLabel(activeKey)}</FieldLabel>
            <CustomSelect
              value={value.mode || modeOptions[0]?.value || 'Cash'}
              onChange={(next) => updateRoot('mode', next)}
              options={modeOptions}
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Amount</FieldLabel>
            <Input value={totalAmount || 0} readOnly />
          </div>

          {instrumentVisible ? (
            <>
              <div className="space-y-1.5">
                <FieldLabel>Instrument No.</FieldLabel>
                <Input value={value.instrumentNo || ''} onChange={(e) => updateRoot('instrumentNo', e.target.value)} placeholder="Cheque No." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Instrument Date</FieldLabel>
                <Input type="date" value={value.instrumentDate || ''} onChange={(e) => updateRoot('instrumentDate', e.target.value)} />
              </div>
            </>
          ) : null}
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-1.5">
          <FieldLabel>Narration</FieldLabel>
          <Textarea
            rows={3}
            value={value.narration || ''}
            onChange={(e) => updateRoot('narration', e.target.value)}
            placeholder="Short narration for employee voucher"
          />
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Attachments</h3>
          <p className="text-sm text-slate-500">Upload supporting employee documents.</p>
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
    </form>
  );
}

export default EmployeeTransactionForm;

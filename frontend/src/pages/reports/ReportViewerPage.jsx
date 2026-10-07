import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, Printer, BarChart3, TrendingUp, Wallet, PieChart, DollarSign, Calculator, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { useAuth } from '../../context/AuthContext';
import { useFY } from '../../context/FYContext';
import { getReportConfig, getReportDefaultFilters, fyCalendarYearForMonth, DIVIDEND_MODES, DIVIDEND_SORT_OPTIONS } from './reportDefinitions';
import { REPORT_LINK_MAP, REPORT_NAV_LINKS, ACCOUNT_STATEMENT_REPORT_LINKS, ACCOUNT_STATEMENT_REPORT_KEYS } from './reportLinks';
import { MemberLedgerPrintTemplate } from './MemberLedgerPrintTemplate';
import { EmployeeLedgerPrint } from './print/EmployeeLedgerPrint';
import { BalanceSheetPrint } from './print/BalanceSheetPrint';
import { TrialBalancePrint } from './print/TrialBalancePrint';
import { CashBookPrint } from './print/CashBookPrint';
import { DayBookPrint } from './print/DayBookPrint';
import { VoucherSummaryPrint } from './print/VoucherSummaryPrint';
import { DemandListPrint } from './print/DemandListPrint';
import { ProfitLossPrint } from './print/ProfitLossPrint';
import { AllMemberListPrint } from './print/AllMemberListPrint';
import { PaymentReceiptStatementPrint } from './print/PaymentReceiptStatementPrint';
import { BranchListPrint } from './print/BranchListPrint';
import { DividendReportPrint } from './print/DividendReportPrint';
import { StatementOfLedgersPrint } from './print/StatementOfLedgersPrint';
import { StatementOfAccountPrint } from './print/StatementOfAccountPrint';
import { MembersOpeningBalancePrint } from './print/MembersOpeningBalancePrint';
import { MembersClosingBalancePrint } from './print/MembersClosingBalancePrint';
import { StatementOfMemberLedgerPrint } from './print/StatementOfMemberLedgerPrint';

const NO_FILTER_PANEL_REPORTS = new Set([
  'balance-sheet',
  'trial-balance',
  'profit-loss',
  'payment-receipt-statement',
  'branch-list-report'
]);

const PRINT_TEMPLATES = {
  'member-ledger': ({ payload, filters, lookups, headerActions }) => (
    <MemberLedgerPrintTemplate payload={payload?.raw} headerActions={headerActions} />
  ),
  'member-ac-status': ({ payload, filters, lookups, headerActions }) => (
    <MemberLedgerPrintTemplate payload={payload?.raw} headerActions={headerActions} />
  ),
  'employee-ledger': ({ payload, filters, headerActions }) => (
    <EmployeeLedgerPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'balance-sheet': ({ payload, filters, headerActions }) => (
    <BalanceSheetPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'trial-balance': ({ payload, filters, headerActions }) => (
    <TrialBalancePrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'cash-book': ({ payload, filters, headerActions }) => (
    <CashBookPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'day-book': ({ payload, filters, headerActions }) => (
    <DayBookPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'voucher-summary': ({ payload, filters, headerActions }) => (
    <VoucherSummaryPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'demand-list-report': ({ payload, filters, lookups, headerActions }) => (
    <DemandListPrint data={payload?.raw} filters={filters} branches={lookups?.branches || []} headerActions={headerActions} />
  ),
  'profit-loss': ({ payload, filters, headerActions }) => (
    <ProfitLossPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'all-member-list': ({ payload, headerActions }) => (
    <AllMemberListPrint data={payload?.raw} headerActions={headerActions} />
  ),
  'payment-receipt-statement': ({ payload, filters, headerActions }) => (
    <PaymentReceiptStatementPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'branch-list-report': ({ payload, headerActions }) => (
    <BranchListPrint data={payload?.raw} headerActions={headerActions} />
  ),
  'dividend-report': ({ payload, filters, lookups, headerActions }) => (
    <DividendReportPrint data={payload?.raw} headerActions={headerActions} />
  ),
  'statement-of-ledgers': ({ payload, filters, headerActions }) => (
    <StatementOfLedgersPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'statement-of-account': ({ payload, filters, headerActions }) => (
    <StatementOfAccountPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'members-opening-balance': ({ payload, filters, headerActions }) => (
    <MembersOpeningBalancePrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'members-closing-balance': ({ payload, filters, headerActions }) => (
    <MembersClosingBalancePrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  ),
  'statement-of-member-ledger': ({ payload, filters, headerActions }) => (
    <StatementOfMemberLedgerPrint data={payload?.raw} filters={filters} headerActions={headerActions} />
  )
};

const MONTH_NAME_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
].map((label, index) => ({ label, value: String(index + 1).padStart(2, '0') }));

const SUMMARY_PALETTES = [
  { color: 'text-blue-600', bg: 'bg-blue-50', Icon: BarChart3 },
  { color: 'text-emerald-600', bg: 'bg-emerald-50', Icon: TrendingUp },
  { color: 'text-rose-600', bg: 'bg-rose-50', Icon: Wallet },
  { color: 'text-purple-600', bg: 'bg-purple-50', Icon: PieChart },
  { color: 'text-amber-600', bg: 'bg-amber-50', Icon: DollarSign },
  { color: 'text-cyan-600', bg: 'bg-cyan-50', Icon: Calculator },
];



function formatCell(cell) {
  if (cell == null || cell === '') return '-';
  if (typeof cell === 'number') {
    return new Intl.NumberFormat('en-IN').format(cell);
  }
  return cell;
}

// Shown in place of every report (table and print templates alike) while it
// loads, so a stale or empty template never flashes in the meantime.
function ReportLoading() {
  return (
    <div role="status" aria-live="polite" className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
      <Loader2 size={32} className="animate-spin text-blue-600" />
      <span>Loading report...</span>
    </div>
  );
}

function SummaryCard({ label, value, subLabel, index = 0 }) {
  const palette = SUMMARY_PALETTES[index % SUMMARY_PALETTES.length];
  const Icon = palette.Icon;

  return (
    <Card className="border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4 rounded-2xl">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${palette.bg} ${palette.color}`}>
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <p className="text-xl font-bold text-slate-900 truncate">{value}</p>
        </div>
        {subLabel && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subLabel}</p>}
      </div>
    </Card>
  );
}

function ReportTableSection({ section, headerActions }) {
  const [search, setSearch] = useState('');

  const columns = useMemo(() => {
    const columnAlign = section.columnAlign || {};
    return (section.headers || []).map((header, index) => ({
      key: `col_${index}`,
      label: header,
      align: columnAlign[index],
      // Right-aligned columns are amounts: keep them on one line, digits
      // aligned, and flag negatives (Dr balances) in red.
      render: columnAlign[index] === 'right'
        ? (row) => {
            const value = row[`col_${index}`];
            const negative = typeof value === 'string' && value.startsWith('-');
            return <span className={`whitespace-nowrap tabular-nums ${negative ? 'text-rose-600' : ''}`}>{value}</span>;
          }
        : undefined,
      sortable: true,
      sortValue: (row) => {
        const val = row[`col_${index}`];
        if (typeof val === 'string' && /^-?[\d,]+(\.\d+)?$/.test(val)) {
          const num = Number(val.replace(/,/g, ''));
          if (!isNaN(num)) return num;
        }
        return val;
      }
    }));
  }, [section.headers, section.columnAlign]);

  const data = useMemo(() => {
    return (section.rows || []).map((row) => {
      const rowData = {};
      row.forEach((cell, index) => {
        rowData[`col_${index}`] = formatCell(cell);
      });
      return rowData;
    });
  }, [section.rows]);

  const filteredData = useMemo(() => {
    if (!search) return data;
    const lowerSearch = search.toLowerCase();
    return data.filter((row) => {
      return Object.values(row).some((val) => 
        String(val).toLowerCase().includes(lowerSearch)
      );
    });
  }, [data, search]);

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <Table 
        columns={columns} 
        data={filteredData} 
        emptyMessage={section.emptyMessage || 'No records found.'}
        defaultRowsPerPage={10}
        headerActions={headerActions}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search in table..."
      />
    </Card>
  );
}

function buildCsv(sections = []) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) lines.push('');
    lines.push(escape(section.title));
    if (section.description) lines.push(escape(section.description));
    lines.push(section.headers.map(escape).join(','));
    section.rows.forEach((row) => {
      lines.push(row.map((cell) => escape(cell)).join(','));
    });
  });
  return lines.join('\n');
}

function downloadCsv(sections, filename) {
  if (!sections?.length) return;
  const csv = buildCsv(sections);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportViewerPage() {
  const { reportKey } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, hasPermission } = useAuth();
  const { activeFY } = useFY();
  const config = useMemo(() => getReportConfig(reportKey), [reportKey]);
  const reportPermission = REPORT_LINK_MAP[reportKey]?.permission || '';
  const exportPermission = reportPermission ? reportPermission.replace(/\\.view$/, '.export') : '';
  const printPermission = reportPermission ? reportPermission.replace(/\\.view$/, '.print') : '';
  const isAccountStatementFamily = ACCOUNT_STATEMENT_REPORT_KEYS.includes(reportKey);
  const visibleReports = useMemo(
    () => (isAccountStatementFamily ? ACCOUNT_STATEMENT_REPORT_LINKS : REPORT_NAV_LINKS).filter((item) => hasPermission(item.permission)),
    [hasPermission, isAccountStatementFamily]
  );
  const [lookups, setLookups] = useState({});
  const [filters, setFilters] = useState(() => getReportDefaultFilters(reportKey, {}, {}, activeFY));
  const [generatedFilters, setGeneratedFilters] = useState(() => getReportDefaultFilters(reportKey, {}, {}, activeFY));
  const fyStart = activeFY?.start || '';
  const fyEnd = activeFY?.end || '';
  // Spread onto date inputs so the picker stays inside the selected FY.
  const fyDateBounds = { min: fyStart || undefined, max: fyEnd || undefined };
  const fyMonthBounds = { min: fyStart ? fyStart.slice(0, 7) : undefined, max: fyEnd ? fyEnd.slice(0, 7) : undefined };
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.banking.getLookups(token)
      .then((response) => {
        if (!mounted) return;
        setLookups(response.data || {});
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load report lookups');
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  // Re-runs on FY switch so every date/month filter snaps to the new year.
  useEffect(() => {
    const nextDefaults = getReportDefaultFilters(reportKey, lookups, {}, activeFY);
    if (reportKey === 'member-ledger') {
      const memberCode = searchParams.get('memberCode');
      if (memberCode) nextDefaults.memberCode = memberCode;
    }
    if (reportKey === 'employee-ledger') {
      const employeeCode = searchParams.get('employeeCode');
      if (employeeCode) nextDefaults.employeeCode = employeeCode;
    }
    setFilters(nextDefaults);
    setGeneratedFilters(nextDefaults);
  }, [lookups, reportKey, searchParams, activeFY]);

  // No activeFY dep here: an FY switch resets generatedFilters (effect above),
  // which already triggers this reload with the new FY's dates.
  useEffect(() => {
    let mounted = true;
    if (!config) return undefined;

    setLoading(true);
    config.load(api, token, generatedFilters, lookups)
      .then((response) => {
        if (!mounted) return;
        setPayload(response || null);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load report');
        setPayload(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [config, generatedFilters, lookups, token]);

  // Built once per loaded report: a long print template (thousands of rows)
  // must not re-render on every unrelated state change of this page, such as
  // typing in the filter panel before pressing Show Report.
  const printTemplate = useMemo(
    () => (PRINT_TEMPLATES[reportKey] && payload
      ? PRINT_TEMPLATES[reportKey]({ payload, filters: generatedFilters, lookups, headerActions: null })
      : null),
    [reportKey, payload, generatedFilters, lookups]
  );

  if (!config) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Report not found.
      </div>
    );
  }

  function showReport() {
    setGeneratedFilters(filters);
  }

  function resetFilters() {
    const nextDefaults = getReportDefaultFilters(reportKey, lookups, {}, activeFY);
    setFilters(nextDefaults);
    setGeneratedFilters(nextDefaults);
  }

  function renderFilters() {
    if (config.filterMode === 'none') {
      return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">This report uses the current financial context.</div>;
    }

    if (config.filterMode === 'all-members-snapshot') {
      return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">Every member is included — there is no per-member filter for this report.</div>;
    }

    if (config.filterMode === 'statement-of-ledgers') {
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Group</label>
            <Select
              value={filters.group || ''}
              onChange={(value) => setFilters((current) => ({ ...current, group: value }))}
              options={[
                { label: 'All', value: '' },
                { label: 'Asset', value: 'ASSET' },
                { label: 'Liability', value: 'LIABILITY' },
                { label: 'Income', value: 'INCOME' },
                { label: 'Expense', value: 'EXPENSE' },
                { label: 'Primary', value: 'PRIMARY' }
              ]}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">From</label>
              <Input type="date" {...fyDateBounds}value={filters.dateFrom || ''} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">To Date</label>
              <Input type="date" {...fyDateBounds}value={filters.dateTo || ''} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
        </div>
      );
    }

    if (config.filterMode === 'statement-of-account') {
      const ledgers = Array.isArray(lookups.ledgers) ? lookups.ledgers : [];
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Account</label>
            <Select
              searchable
              value={filters.ledgerCode || ''}
              onChange={(value) => setFilters((current) => ({ ...current, ledgerCode: value }))}
              options={[
                { label: 'All Accounts', value: '' },
                ...ledgers.map((ledger) => ({ label: `${ledger.code} - ${ledger.name}`, value: ledger.code }))
              ]}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">From</label>
              <Input type="date" {...fyDateBounds}value={filters.dateFrom || ''} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">To Date</label>
              <Input type="date" {...fyDateBounds}value={filters.dateTo || ''} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
        </div>
      );
    }

    if (config.filterMode === 'member-ledger') {
      const members = Array.isArray(lookups.members) ? lookups.members : [];
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Member</label>
            <Select 
              searchable
              value={filters.memberCode || ''} 
              onChange={(value) => setFilters((current) => ({ ...current, memberCode: value }))}
              options={[
                { label: 'Select member', value: '' },
                ...members.map((member) => ({ label: `${member.code} - ${member.name}`, value: member.code }))
              ]}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">From</label>
              <Input type="date" {...fyDateBounds}value={filters.dateFrom || ''} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">To</label>
              <Input type="date" {...fyDateBounds}value={filters.dateTo || ''} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
        </div>
      );
    }

    if (config.filterMode === 'employee-ledger') {
      const employees = Array.isArray(lookups.employees) ? lookups.employees : [];
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Employee</label>
            <Select
              searchable
              value={filters.employeeCode || ''}
              onChange={(value) => setFilters((current) => ({ ...current, employeeCode: value }))}
              options={[
                { label: 'Select employee', value: '' },
                ...employees.map((employee) => ({ label: `${employee.code} - ${employee.name}`, value: employee.code }))
              ]}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">From</label>
              <Input type="date" {...fyDateBounds}value={filters.dateFrom || ''} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">To</label>
              <Input type="date" {...fyDateBounds}value={filters.dateTo || ''} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
        </div>
      );
    }

    if (config.filterMode === 'branchwise') {
      const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
      return (
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-slate-700">Branch</label>
          <Select
            value={filters.branchCode || ''}
            onChange={(value) => setFilters((current) => ({ ...current, branchCode: value }))}
            options={[
              { label: 'All branches', value: '' },
              ...branches.map((branch) => ({ label: `${branch.code} - ${branch.label || branch.place || ''}`, value: branch.code }))
            ]}
          />
        </div>
      );
    }

    if (config.filterMode === 'dividend') {
      const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
      return (
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Report Type</label>
            <Select
              value={filters.mode || 'branchwise-opening'}
              onChange={(value) => setFilters((current) => ({ ...current, mode: value || 'branchwise-opening' }))}
              options={DIVIDEND_MODES}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Branch</label>
            <Select
              value={filters.branchCode || ''}
              onChange={(value) => setFilters((current) => ({ ...current, branchCode: value }))}
              options={[
                { label: 'All branches', value: '' },
                ...branches.map((branch) => ({ label: `${branch.code} - ${branch.label || branch.place || ''}`, value: branch.code }))
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Sort By</label>
            <Select
              value={filters.sortBy || 'branchName'}
              onChange={(value) => setFilters((current) => ({ ...current, sortBy: value || 'branchName' }))}
              options={DIVIDEND_SORT_OPTIONS}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Dividend Rate (%)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="From rate master"
              value={filters.rate ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, rate: event.target.value }))}
            />
          </div>
        </div>
      );
    }

    if (config.filterMode === 'account-statement') {
      const ledgers = Array.isArray(lookups.ledgers) ? lookups.ledgers : [];
      const acType = filters.type || 'ledger';
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">A/c Type</label>
            <Select
              value={acType}
              onChange={(value) => setFilters((current) => ({ ...current, type: value, search: '', nature: '' }))}
              options={[
                { label: 'Ledger', value: 'ledger' },
                { label: 'Member', value: 'member' },
                { label: 'Employee', value: 'employee' }
              ]}
            />
          </div>

          {acType === 'ledger' ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-slate-700">Select Ledger</label>
                <Select
                  searchable
                  value={filters.search || ''}
                  onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
                  options={[
                    { label: 'All Ledgers', value: '' },
                    ...ledgers.map((ledger) => ({ label: `${ledger.code} - ${ledger.name}`, value: ledger.code }))
                  ]}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-slate-700">Nature</label>
                  <Select
                    value={filters.nature || ''}
                    onChange={(value) => setFilters((current) => ({ ...current, nature: value }))}
                    options={[
                      { label: 'All', value: '' },
                      { label: 'Asset', value: 'ASSET' },
                      { label: 'Liability', value: 'LIABILITY' },
                      { label: 'Income', value: 'INCOME' },
                      { label: 'Expense', value: 'EXPENSE' },
                      { label: 'Primary', value: 'PRIMARY' }
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-slate-700">Upto Date</label>
                  <Input type="date" {...fyDateBounds}value={filters.uptoDate || ''} onChange={(event) => setFilters((current) => ({ ...current, uptoDate: event.target.value }))} />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Search</label>
              <Input
                placeholder={acType === 'member' ? 'Search by member code or name' : 'Search by employee code or name'}
                value={filters.search || ''}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              />
            </div>
          )}
        </div>
      );
    }

    if (config.filterMode === 'monthly') {
      const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
      return (
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Branch</label>
            <Select 
              value={filters.branchCode || ''} 
              onChange={(value) => setFilters((current) => ({ ...current, branchCode: value }))}
              options={[
                { label: 'All branches', value: '' },
                ...branches.map((branch) => ({ label: `${branch.code} - ${branch.label || branch.place || ''}`, value: branch.code }))
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Month</label>
            <Input type="month" {...fyMonthBounds}value={filters.month || ''} onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))} />
          </div>
        </div>
      );
    }

    if (config.filterMode === 'demand-list') {
      const branches = Array.isArray(lookups.branches) ? lookups.branches : [];
      return (
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Date</label>
            <Input
              type="date"
              {...fyDateBounds}
              value={filters.date || ''}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((current) => ({
                  ...current,
                  date: value,
                  month: value ? value.slice(5, 7) : current.month,
                  year: value ? value.slice(0, 4) : current.year
                }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Branch</label>
            <Select
              value={filters.branchCode || ''}
              onChange={(value) => setFilters((current) => ({ ...current, branchCode: value }))}
              options={[
                { label: 'All branches', value: '' },
                ...branches.map((branch) => ({ label: `${branch.code} - ${branch.label || branch.place || ''}`, value: branch.code }))
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Month</label>
            <Select
              value={filters.month || ''}
              onChange={(value) => setFilters((current) => ({ ...current, month: value, year: value ? fyCalendarYearForMonth(value, activeFY) : current.year }))}
              options={MONTH_NAME_OPTIONS}
            />
          </div>
        </div>
      );
    }

    if (config.filterMode === 'month-only') {
      return (
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-slate-700">Month</label>
          <Input type="month" {...fyMonthBounds}value={filters.month || ''} onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))} />
        </div>
      );
    }

    if (config.filterMode === 'rate') {
      return (
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-slate-700">Dividend Rate (%)</label>
          <Input type="number" min="0" step="0.01" value={filters.rate ?? 8} onChange={(event) => setFilters((current) => ({ ...current, rate: event.target.value }))} />
        </div>
      );
    }

    return (
      <div className="grid gap-4">
        {config.filterMode === 'date-range' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">From</label>
              <Input type="date" {...fyDateBounds}value={filters.dateFrom || ''} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">To</label>
              <Input type="date" {...fyDateBounds}value={filters.dateTo || ''} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Report Date</label>
            <Input type="date" {...fyDateBounds}value={filters.date || ''} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} />
          </div>
        )}
      </div>
    );
  }

  function handleExport() {
    if (!payload?.sections?.length) {
      toast.message('Nothing to export');
      return;
    }
    downloadCsv(payload.sections, `${reportKey}.csv`);
  }

  const usesPrintTemplate = Boolean(PRINT_TEMPLATES[reportKey]);
  const canExport = hasPermission(exportPermission) && Boolean(payload?.sections?.length);
  const showFilterPanel = !NO_FILTER_PANEL_REPORTS.has(reportKey);

  const filterPanel = (
    <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden lg:sticky lg:top-24 lg:z-10">
      <div className="mb-4 space-y-1.5">
        <label className="text-[13px] font-semibold text-slate-700">Report</label>
        <Select
          value={reportKey}
          onChange={(value) => value && navigate(`/app/reports/${value}`)}
          options={visibleReports
            .filter((item) => !NO_FILTER_PANEL_REPORTS.has(item.key))
            .map((item) => ({ label: item.label, value: item.key }))}
        />
      </div>
      {renderFilters()}
      <div className="mt-6 flex flex-col gap-2">
        <Button type="button" className="w-full bg-[var(--primary)] text-white hover:opacity-90" onClick={showReport}>
          Show Report
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={resetFilters}>
          Reset
        </Button>
        {canExport ? (
          <Button type="button" variant="outline" className="w-full gap-2" onClick={handleExport}>
            <Download size={14} />
            Export Excel
          </Button>
        ) : null}
        {!usesPrintTemplate && hasPermission(printPermission) ? (
          <Button type="button" variant="outline" className="w-full gap-2" onClick={() => window.print()}>
            <Printer size={14} />
            Print
          </Button>
        ) : null}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{isAccountStatementFamily ? 'Report' : config.label}</h1>
      </div>

      <div className={`grid grid-cols-1 items-start gap-4 ${showFilterPanel ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]' : ''}`}>
        {showFilterPanel ? filterPanel : null}

        <div className="report-canvas-wrap w-full min-w-0">
          {loading ? (
            <ReportLoading />
          ) : usesPrintTemplate ? (
            printTemplate || PRINT_TEMPLATES[reportKey]({ payload, filters: generatedFilters, lookups, headerActions: null })
          ) : (
            <div className="report-canvas">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(payload?.summary || []).map((item, index) => (
                  <SummaryCard key={item.label} label={item.label} value={item.value} subLabel={item.subLabel} index={index} />
                ))}
              </div>

              <div className="mt-5 space-y-5">
                {payload?.sections?.length ? (
                  payload.sections.map((section) => <ReportTableSection key={section.title} section={section} />)
                ) : (
                  <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mt-4">
                      <Table columns={[]} data={[]} emptyMessage="No records found for the selected parameters." />
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReportViewerPage;

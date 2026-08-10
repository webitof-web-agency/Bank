import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, Filter, Printer, FileText, Activity, BarChart3, TrendingUp, Wallet, PieChart, DollarSign, Calculator, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { useAuth } from '../../context/AuthContext';
import { useFY } from '../../context/FYContext';
import { getReportConfig, getReportDefaultFilters } from './reportDefinitions';
import { REPORT_LINK_MAP, REPORT_NAV_LINKS } from './reportLinks';

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
    return (section.headers || []).map((header, index) => ({
      key: `col_${index}`,
      label: header,
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
  }, [section.headers]);

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
  const { token, hasPermission } = useAuth();
  const { activeFY } = useFY();
  const config = useMemo(() => getReportConfig(reportKey), [reportKey]);
  const reportPermission = REPORT_LINK_MAP[reportKey]?.permission || '';
  const exportPermission = reportPermission ? reportPermission.replace(/\\.view$/, '.export') : '';
  const printPermission = reportPermission ? reportPermission.replace(/\\.view$/, '.print') : '';
  const visibleReports = useMemo(
    () => REPORT_NAV_LINKS.filter((item) => hasPermission(item.permission)),
    [hasPermission]
  );
  const [lookups, setLookups] = useState({});
  const [filters, setFilters] = useState(() => getReportDefaultFilters(reportKey, {}));
  const [generatedFilters, setGeneratedFilters] = useState(() => getReportDefaultFilters(reportKey, {}));
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

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

  useEffect(() => {
    const nextDefaults = getReportDefaultFilters(reportKey, lookups);
    setFilters(nextDefaults);
    setGeneratedFilters(nextDefaults);
  }, [lookups, reportKey]);

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
  }, [config, generatedFilters, lookups, token, activeFY]);

  if (!config) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Report not found.
      </div>
    );
  }

  function showReport() {
    setGeneratedFilters(filters);
    setFilterDropdownOpen(false);
  }

  function resetFilters() {
    const nextDefaults = getReportDefaultFilters(reportKey, lookups);
    setFilters(nextDefaults);
    setGeneratedFilters(nextDefaults);
    setFilterDropdownOpen(false);
  }

  function renderFilters() {
    if (config.filterMode === 'none') {
      return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">This report uses the current financial context.</div>;
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
              <Input type="date" value={filters.dateFrom || ''} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">To</label>
              <Input type="date" value={filters.dateTo || ''} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
        </div>
      );
    }

    if (config.filterMode === 'account-statement') {
      const ledgers = Array.isArray(lookups.ledgers) ? lookups.ledgers : [];
      return (
        <div className="space-y-4">
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
                  { label: 'General', value: 'GENERAL' }
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Upto Date</label>
              <Input type="date" value={filters.uptoDate || ''} onChange={(event) => setFilters((current) => ({ ...current, uptoDate: event.target.value }))} />
            </div>
          </div>
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
            <Input type="month" value={filters.month || ''} onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))} />
          </div>
        </div>
      );
    }

    if (config.filterMode === 'month-only') {
      return (
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-slate-700">Month</label>
          <Input type="month" value={filters.month || ''} onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))} />
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
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-slate-700">Report Date</label>
          <Input type="date" value={filters.date || ''} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} />
        </div>
        {config.filterMode === 'date-range' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">From</label>
              <Input type="date" value={filters.dateFrom || ''} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">To</label>
              <Input type="date" value={filters.dateTo || ''} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </div>
          </div>
        ) : null}
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

  const filterPopover = (
    <div className="flex items-center gap-2">
      {hasPermission(printPermission) ? (
        <Button type="button" variant="outline" className="gap-2 h-9 px-3 text-[13px] border-slate-200 bg-white hover:bg-slate-50" onClick={() => window.print()}>
          <Printer size={14} />
          Print
        </Button>
      ) : null}
      {hasPermission(exportPermission) ? (
        <Button type="button" variant="outline" className="gap-2 h-9 px-3 text-[13px] border-slate-200 bg-white hover:bg-slate-50" onClick={handleExport}>
          <Download size={14} />
          Export
        </Button>
      ) : null}
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="gap-2 h-9 px-3 text-[13px] border-slate-200 bg-white hover:bg-slate-50"
          onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
        >
          <Filter size={14} />
          Filter
        </Button>
      {filterDropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-[320px] sm:w-[400px] z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-slate-900 text-sm">Filters</h4>
            <button type="button" onClick={() => setFilterDropdownOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div>
            {renderFilters()}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              type="button"
              className="flex-1 bg-[var(--primary)] text-white hover:opacity-90"
              onClick={showReport}
            >
              Show Report
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={resetFilters}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{config.label}</h1>
      </div>

      <div className="report-shell">
        <div className="report-canvas-wrap w-full">
          <div className="report-canvas">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(payload?.summary || []).map((item, index) => (
                <SummaryCard key={item.label} label={item.label} value={item.value} subLabel={item.subLabel} index={index} />
              ))}
            </div>

            <div className="mt-5 space-y-5">
              {loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading report...</div>
              ) : payload?.sections?.length ? (
                payload.sections.map((section, index) => <ReportTableSection key={section.title} section={section} headerActions={index === 0 ? filterPopover : null} />)
              ) : (
                <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mt-4">
                    <Table columns={[]} data={[]} emptyMessage="No records found for the selected parameters." headerActions={filterPopover} />
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportViewerPage;

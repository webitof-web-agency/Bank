import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Filter, Printer, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { getReportConfig, getReportDefaultFilters } from './reportDefinitions';
import { REPORT_LINK_MAP, REPORT_NAV_LINKS } from './reportLinks';

function SectionTitle({ title, description }) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

function formatCell(cell) {
  if (cell == null || cell === '') return '-';
  if (typeof cell === 'number') {
    return new Intl.NumberFormat('en-IN').format(cell);
  }
  return cell;
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ReportTableSection({ section }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <SectionTitle title={section.title} description={section.description} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
            <tr>
              {section.headers.map((header) => (
                <th key={header} className="px-4 py-3.5">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {section.rows?.length ? section.rows.map((row, index) => (
              <tr key={`${section.title}-${index}`} className="hover:bg-slate-50/50">
                {row.map((cell, cellIndex) => (
                  <td key={`${section.title}-${index}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={section.headers.length} className="px-4 py-8 text-center text-slate-500">
                  {section.emptyMessage || 'No records found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
  const config = useMemo(() => getReportConfig(reportKey), [reportKey]);
  const visibleReports = useMemo(
    () => REPORT_NAV_LINKS.filter((item) => hasPermission(item.permission)),
    [hasPermission]
  );
  const [lookups, setLookups] = useState({});
  const [filters, setFilters] = useState(() => getReportDefaultFilters(reportKey, {}));
  const [generatedFilters, setGeneratedFilters] = useState(() => getReportDefaultFilters(reportKey, {}));
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(100);

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
    setZoom(100);
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
  }, [config, generatedFilters, lookups, token]);

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
    const nextDefaults = getReportDefaultFilters(reportKey, lookups);
    setFilters(nextDefaults);
    setGeneratedFilters(nextDefaults);
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
            <Select value={filters.memberCode || ''} onChange={(event) => setFilters((current) => ({ ...current, memberCode: event.target.value }))}>
              <option value="">Select member</option>
              {members.map((member) => (
                <option key={member.code} value={member.code}>{member.code} - {member.name}</option>
              ))}
            </Select>
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
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-slate-700">Search Ledger</label>
            <Input value={filters.search || ''} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Ledger code / name" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Nature</label>
              <Select value={filters.nature || ''} onChange={(event) => setFilters((current) => ({ ...current, nature: event.target.value }))}>
                <option value="">All</option>
                <option value="ASSET">Asset</option>
                <option value="LIABILITY">Liability</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
                <option value="GENERAL">General</option>
              </Select>
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
            <Select value={filters.branchCode || ''} onChange={(event) => setFilters((current) => ({ ...current, branchCode: event.target.value }))}>
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>{branch.code} - {branch.label || branch.place || ''}</option>
              ))}
            </Select>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <button type="button" onClick={() => navigate('/app/reports')} className="inline-flex items-center gap-1.5 hover:text-slate-900">
          <ArrowLeft size={14} />
          Back to Reports
        </button>
        <span>/</span>
        <span>{REPORT_LINK_MAP[reportKey]?.label || config.label}</span>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative bg-gradient-to-r from-[#0f172a] via-[#2563eb] to-[#3b82f6] px-6 py-8 text-white md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur">
                <Sparkles size={13} />
                Reports Module
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{config.label}</h1>
                <p className="mt-2 max-w-2xl text-sm text-blue-50 md:text-[15px]">{config.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="gap-2 bg-white/10 text-white hover:bg-white/15" onClick={() => navigate('/app/reports')}>
                <ArrowLeft size={14} />
                Reports Hub
              </Button>
              <Button type="button" variant="outline" className="gap-2 bg-white/10 text-white hover:bg-white/15" onClick={() => setZoom((value) => Math.max(80, value - 10))}>
                <ZoomOut size={14} />
                Zoom Out
              </Button>
              <Button type="button" variant="outline" className="gap-2 bg-white/10 text-white hover:bg-white/15" onClick={() => setZoom((value) => Math.min(130, value + 10))}>
                <ZoomIn size={14} />
                Zoom In
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="report-shell">
        <aside className="report-params">
          <div className="field mt0">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Report Type</label>
            <Select
              className="mt-2 bg-white"
              value={reportKey || ''}
              onChange={(event) => {
                const next = visibleReports.find((item) => item.key === event.target.value);
                if (next) navigate(next.path);
              }}
            >
              {visibleReports.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionTitle title="Parameters" description="Choose the filter values and generate the report." />
              <div className="mt-4 space-y-4">
                {renderFilters()}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" className="gap-2" onClick={showReport}>
                <Filter size={14} />
                Show Report
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </aside>

        <div className="report-canvas-wrap">
          <div className="report-toolbar">
            <button type="button" className="icon-btn" onClick={() => window.print()} title="Print">
              <Printer size={14} />
            </button>
            {hasPermission('reports.export') ? (
              <button type="button" className="icon-btn" onClick={handleExport} title="Export CSV">
                <Download size={14} />
              </button>
            ) : null}
            <div className="spacer" />
            <span className="text-[11.5px] text-slate-500">{payload?.subtitle || 'Ready'}</span>
          </div>

          <div className={`report-canvas ${zoom === 100 ? '' : `zoom-${zoom}`}`}>
            <div className="report-title-block">
              <div className="rt1">{payload?.title || config.label}</div>
              <div className="rt2">{payload?.subtitle || config.description}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {(payload?.summary || []).map((item) => (
                <SummaryCard key={item.label} label={item.label} value={item.value} />
              ))}
            </div>

            <div className="mt-5 space-y-5">
              {loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading report...</div>
              ) : payload?.sections?.length ? (
                payload.sections.map((section) => <ReportTableSection key={section.title} section={section} />)
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
                  No records found for the selected parameters.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportViewerPage;

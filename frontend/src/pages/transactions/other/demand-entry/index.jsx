import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronDown, Filter, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../api/api';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { useAuth } from '../../../../context/AuthContext';
import { DemandForm } from '../../../master/demands/form';
import { buildDemandPayload, createDemandDraftFromRecord, createEmptyDemandDraft, formatMoney, getBranchLabel, getMemberLabel } from '../../../master/demands/demandUtils';

function normalizeMonth(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const compact = text.toUpperCase().replace(/^MONTH\s*[:\-]?\s*/i, '');
  const match = compact.match(/^M?(\d{1,2})$/i);
  if (match) {
    return String(Number(match[1])).padStart(2, '0');
  }
  return compact;
}

function formatDate(value = '') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function getDateKey(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getYearFromRow(row = {}) {
  const payloadYear = String(row?.payload?.year || row?.year || '').trim();
  if (payloadYear) return payloadYear;
  const candidate = row?.dueDate || row?.payload?.demandListDate || row?.updatedAt || row?.createdAt;
  const date = candidate ? new Date(candidate) : null;
  if (date && !Number.isNaN(date.getTime())) {
    return String(date.getFullYear());
  }
  return String(new Date().getFullYear());
}

function getRowDate(row = {}) {
  return row?.dueDate || row?.payload?.demandListDate || row?.updatedAt || row?.createdAt || '';
}

function getCompulsoryDeposit(member = {}) {
  return Number(member?.depositBalance ?? member?.balances?.compulsoryDeposit ?? 0);
}

function getSsaAmount(member = {}) {
  return Number(member?.balances?.specialSaving ?? member?.balances?.insurancePremium ?? 0);
}

function getStatusBadge(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'recovered' || value === 'fully recovered') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (value === 'partially recovered') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function DemandStatusPill({ status = '' }) {
  const value = String(status || '').trim();
  const className = getStatusBadge(value);
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold ${className}`}>
      {value || 'Pending'}
    </span>
  );
}

export function DemandEntryPage({ sectionKey, detailPathBase = '/app/transactions/other/demand-entry' }) {
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft] = useState(createEmptyDemandDraft());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = hasPermission('demands.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLookupsLoading(true);

    Promise.all([
      api.resources.list('/banking/masters/demand-lists', token, search),
      api.resources.list('/banking/masters/branches', token),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([demandsRes, branchesRes, membersRes]) => {
        if (!mounted) return;
        setRows(Array.isArray(demandsRes.data) ? demandsRes.data : []);
        setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : []);
        setMembers(Array.isArray(membersRes.data) ? membersRes.data : []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load demand list');
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
          setLookupsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [search, token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterDateFrom, filterDateTo, filterBranch, filterMonth, filterYear, rowsPerPage]);

  const branchLookup = useMemo(() => new Map(branches.map((branch) => [String(branch.code || '').trim().toUpperCase(), branch])), [branches]);
  const memberLookup = useMemo(() => new Map(members.map((member) => [String(member.code || '').trim().toUpperCase(), member])), [members]);

  const branchOptions = useMemo(() => ([
    { value: '', label: 'Branch Name' },
    ...branches.map((branch) => ({ value: String(branch.code || ''), label: getBranchLabel(branch) || branch.code || '—' }))
  ]), [branches]);

  const monthOptions = useMemo(() => {
    const values = rows
      .map((row) => normalizeMonth(row.month || getDateKey(getRowDate(row)).slice(5, 7)))
      .filter(Boolean);
    return [
      { value: '', label: 'Month' },
      ...Array.from(new Set(values)).sort().map((value) => ({ value, label: value }))
    ];
  }, [rows]);

  const yearOptions = useMemo(() => {
    const values = rows.map((row) => getYearFromRow(row)).filter(Boolean);
    const sorted = Array.from(new Set(values)).sort((a, b) => Number(b) - Number(a));
    return [
      { value: '', label: 'Year' },
      ...sorted.map((value) => ({ value, label: value }))
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const searchValue = String(search || '').trim().toLowerCase();

    return rows.filter((row) => {
      const branchCode = String(row.branchCode || '').trim().toUpperCase();
      const memberCode = String(row.memberCode || '').trim().toUpperCase();
      const member = memberLookup.get(memberCode);
      const branch = branchLookup.get(branchCode);
      const rowMonth = normalizeMonth(row.month || getDateKey(getRowDate(row)).slice(5, 7));
      const rowYear = getYearFromRow(row);
      const rowDateKey = getDateKey(getRowDate(row));
      const memberName = getMemberLabel(member) || row.memberName || '';
      const branchName = getBranchLabel(branch) || row.branchName || '';
      const matchesSearch = !searchValue || [
        row.demandNo,
        row.id,
        memberName,
        branchName,
        row.memberCode,
        row.status,
        row.remarks,
        row.total,
        row.recovered
      ].some((value) => String(value || '').toLowerCase().includes(searchValue));
      const matchesDateFrom = !filterDateFrom || (rowDateKey && rowDateKey >= filterDateFrom);
      const matchesDateTo = !filterDateTo || (rowDateKey && rowDateKey <= filterDateTo);
      const matchesBranch = !filterBranch || branchCode === String(filterBranch || '').trim().toUpperCase();
      const matchesMonth = !filterMonth || rowMonth === String(filterMonth || '').trim();
      const matchesYear = !filterYear || rowYear === String(filterYear || '').trim();
      return matchesSearch && matchesDateFrom && matchesDateTo && matchesBranch && matchesMonth && matchesYear;
    });
  }, [rows, search, filterDateFrom, filterDateTo, filterBranch, filterMonth, filterYear, branchLookup, memberLookup]);

  const stats = useMemo(() => ({
    total: filteredRows.length,
    pending: filteredRows.filter((row) => String(row.status || '').toLowerCase() === 'pending').length,
    partial: filteredRows.filter((row) => String(row.status || '').toLowerCase() === 'partially recovered').length,
    recovered: filteredRows.filter((row) => String(row.status || '').toLowerCase() === 'recovered' || String(row.status || '').toLowerCase() === 'fully recovered').length
  }), [filteredRows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const safePage = Math.min(Math.max(currentPage, 1), pageCount);
  const pageRows = useMemo(() => {
    const startIndex = (safePage - 1) * rowsPerPage;
    return filteredRows.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredRows, rowsPerPage, safePage]);

  function openCreate() {
    setActiveRecord(null);
    setDraft(createEmptyDemandDraft(rows));
    setEditorOpen(true);
  }

  function openEdit(demand) {
    setActiveRecord(demand);
    setDraft(createDemandDraftFromRecord(demand));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setActiveRecord(null);
    setDraft(createEmptyDemandDraft(rows));
  }

  async function saveDemand(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildDemandPayload(draft);
      const response = activeRecord
        ? await api.resources.update('/banking/masters/demand-lists', activeRecord.id, payload, token)
        : await api.resources.create('/banking/masters/demand-lists', payload, token);
      const nextRecord = response.data || response;
      setRows((current) => {
        const next = activeRecord
          ? current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
          : [nextRecord, ...current];
        return next;
      });
      toast.success(activeRecord ? 'Demand updated' : 'Demand created');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save demand');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.resources.remove('/banking/masters/demand-lists', deleteTarget.id, token);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Demand deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete demand');
    } finally {
      setDeleteTarget(null);
    }
  }

  const columns = [
    { key: 'entryNo', label: 'ENTRY NO.' },
    { key: 'dlistNo', label: 'DLIST NO.' },
    { key: 'dlistDate', label: 'DLIST DATE' },
    { key: 'memberName', label: 'MEMBER NAME' },
    { key: 'branchName', label: 'BRANCH NAME' },
    { key: 'dmonth', label: 'DMONTH' },
    { key: 'dyear', label: 'DYEAR' },
    { key: 'memberCode', label: 'MEMBER CODE' },
    { key: 'compDepo', label: 'COMP. DEPO.', align: 'right' },
    { key: 'ssa', label: 'SSA', align: 'right' },
    { key: 'total', label: 'TOTAL', align: 'right' },
    { key: 'status', label: 'STATUS' }
  ];

  function renderHeaderCell(column) {
    return (
      <th key={column.key} className={`px-4 py-3.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 ${column.align === 'right' ? 'text-right' : ''}`}>
        {column.label}
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-blue-600">Supporting</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Demand List</h1>
          <p className="mt-1 text-sm text-slate-500">Transactions → Supporting → Demand List</p>
        </div>
        <Button type="button" onClick={openCreate} className="gap-2 bg-amber-500 text-white hover:bg-amber-600">
          <Plus size={16} />
          New Entry
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[260px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search.."
                className="h-10 w-full rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-[color-mix(in_srgb,white_92%,#f8f4ea)] px-3 pl-10 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary,#1661F6)] focus:outline-none focus:ring-1 focus:ring-[var(--primary,#1661F6)]"
              />
            </div>

            <div className="flex items-center gap-2 text-slate-500">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
              <span className="text-[13px] font-semibold text-slate-600">Date From :</span>
            </div>

            <input
              type="date"
              value={filterDateFrom}
              onChange={(event) => setFilterDateFrom(event.target.value)}
              className="h-10 rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white px-3 text-[13px] text-slate-700 focus:border-[var(--primary,#1661F6)] focus:outline-none focus:ring-1 focus:ring-[var(--primary,#1661F6)]"
            />

            <span className="text-[13px] font-semibold text-slate-600">To</span>

            <input
              type="date"
              value={filterDateTo}
              onChange={(event) => setFilterDateTo(event.target.value)}
              className="h-10 rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white px-3 text-[13px] text-slate-700 focus:border-[var(--primary,#1661F6)] focus:outline-none focus:ring-1 focus:ring-[var(--primary,#1661F6)]"
            />

            <div className="w-full max-w-[170px]">
              <Select value={filterBranch} onChange={setFilterBranch} options={branchOptions} size="sm" searchable />
            </div>

            <div className="w-full max-w-[130px]">
              <Select value={filterMonth} onChange={setFilterMonth} options={monthOptions} size="sm" />
            </div>

            <div className="w-full max-w-[130px]">
              <Select value={filterYear} onChange={setFilterYear} options={yearOptions} size="sm" />
            </div>
          </div>

          <div className="text-sm text-slate-400 lg:max-w-[360px] lg:text-right">
            Select a demand line to view details or filter by date & branch.
          </div>
        </div>

        <div className="flex items-center justify-end px-4 pt-4">
          <Select value={rowsPerPage} onChange={(val) => setRowsPerPage(Number(val))} options={[10, 25, 50, 100].map((num) => ({ value: num, label: `${num} rows` }))} size="sm" className="w-28" />
        </div>

        <div className="overflow-x-auto px-4 pb-4 pt-3">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-500">
              <tr>
                <th className="w-16 px-4 py-3.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Action</th>
                {columns.map(renderHeaderCell)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-500">Loading demand list...</td>
                </tr>
              ) : pageRows.length ? (
                pageRows.map((row, index) => {
                  const rowMemberCode = String(row.memberCode || '').trim().toUpperCase();
                  const rowBranchCode = String(row.branchCode || '').trim().toUpperCase();
                  const member = memberLookup.get(rowMemberCode);
                  const branch = branchLookup.get(rowBranchCode);
                  const memberName = getMemberLabel(member) || row.memberName || '-';
                  const branchName = getBranchLabel(branch) || row.branchName || '-';
                  const rowMonth = normalizeMonth(row.month || getDateKey(getRowDate(row)).slice(5, 7)) || '-';
                  const rowYear = getYearFromRow(row);
                  const compDepo = getCompulsoryDeposit(member);
                  const ssa = getSsaAmount(member);
                  const total = Number(row.total || 0);
                  const dlistDate = formatDate(getRowDate(row));
                  const dlistNo = String(row.payload?.demandListNo || row.dlistNo || row.id || row.demandNo || '').trim();

                  return (
                    <tr key={row.id || row.demandNo || index} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`${detailPathBase}/${row.id}`)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                          title="View"
                        >
                          <ArrowRight size={15} />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.demandNo || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{dlistNo || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{dlistDate}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{memberName}</td>
                      <td className="px-4 py-3 text-slate-700">{branchName}</td>
                      <td className="px-4 py-3 text-slate-700">{rowMonth}</td>
                      <td className="px-4 py-3 text-slate-700">{rowYear}</td>
                      <td className="px-4 py-3 text-slate-700">{row.memberCode || '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(compDepo)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(ssa)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(total)}</td>
                      <td className="px-4 py-3">
                        <DemandStatusPill status={row.status} />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-slate-500">
                    No demand lines found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-[13px] text-slate-500">
            Showing {filteredRows.length ? ((safePage - 1) * rowsPerPage) + 1 : 0} to {Math.min(safePage * rowsPerPage, filteredRows.length)} of {filteredRows.length}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
              disabled={safePage === 1}
              className="flex h-8 items-center gap-1 rounded-[var(--radius-button,0.5rem)] px-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <span className="hidden sm:inline">Previous</span>
            </button>

            <div className="flex items-center gap-1 mx-1">
              {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => {
                const start = Math.max(1, safePage - 2);
                const pageNum = Math.min(pageCount, start + i);
                if (pageNum < 1 || pageNum > pageCount) return null;
                const active = pageNum === safePage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={active
                      ? 'flex h-8 min-w-[32px] items-center justify-center rounded-[var(--radius-button,0.5rem)] bg-[var(--primary,#1661F6)] px-2 text-[13px] font-medium text-white shadow-sm'
                      : 'flex h-8 min-w-[32px] items-center justify-center rounded-[var(--radius-button,0.5rem)] border border-slate-200 bg-white px-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50'
                    }
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage((current) => Math.min(pageCount, current + 1))}
              disabled={safePage === pageCount || filteredRows.length === 0}
              className="flex h-8 items-center gap-1 rounded-[var(--radius-button,0.5rem)] px-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <span className="hidden sm:inline">Next</span>
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title={activeRecord ? 'Edit Demand Entry' : 'Create Demand Entry'}
        onClose={closeEditor}
        width="min(1000px, 96vw)"
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" type="button" onClick={closeEditor} disabled={saving}>Cancel</Button>
            <Button type="submit" form="demand-form" disabled={saving || lookupsLoading} className="bg-[var(--primary,#1661F6)] text-white hover:opacity-90">
              {saving ? 'Saving...' : 'Save & Post'}
            </Button>
          </div>
        }
      >
        <DemandForm
          value={draft}
          setValue={setDraft}
          onSubmit={saveDemand}
          branches={branches}
          members={members}
        />
      </Modal>

    </div>
  );
}

export default DemandEntryPage;

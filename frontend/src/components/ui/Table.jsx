import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ArrowDown, ArrowUp, Search } from 'lucide-react';
import { Select } from './Select';

export function Table({
  columns = [],
  data = [],
  defaultRowsPerPage = 10,
  emptyMessage = 'No data available',
  search,
  onSearch,
  searchPlaceholder = 'Search...',
  headerActions,
  serverPagination = null
}) {
  const isServerPagination = Boolean(serverPagination);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!isServerPagination) return;
    const nextLimit = Number(serverPagination?.limit || defaultRowsPerPage);
    setRowsPerPage(nextLimit);
  }, [defaultRowsPerPage, isServerPagination, serverPagination?.limit]);

  useEffect(() => {
    if (!isServerPagination) return;
    const nextPage = Math.max(1, Number(serverPagination?.page || 1));
    setCurrentPage(nextPage);
  }, [isServerPagination, serverPagination?.page]);

  const handleSort = (key) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (isServerPagination) return data;
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      const column = columns.find((c) => c.key === sortKey);
      if (column && column.sortValue) {
        aVal = column.sortValue(a);
        bVal = column.sortValue(b);
      }

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, isServerPagination, sortKey, sortDirection, columns]);

  const totalItems = isServerPagination ? Number(serverPagination?.total || 0) : sortedData.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / rowsPerPage));
  const validCurrentPage = isServerPagination
    ? Math.min(Math.max(1, Number(serverPagination?.page || 1)), pageCount)
    : Math.min(Math.max(1, currentPage), pageCount);

  useEffect(() => {
    if (!isServerPagination) {
      setCurrentPage((current) => {
        const next = Math.min(Math.max(1, current), pageCount);
        return next === current ? current : next;
      });
    }
  }, [isServerPagination, pageCount]);

  const paginatedData = useMemo(() => {
    if (isServerPagination) return sortedData;
    const startIndex = (validCurrentPage - 1) * rowsPerPage;
    return sortedData.slice(startIndex, startIndex + rowsPerPage);
  }, [isServerPagination, rowsPerPage, sortedData, validCurrentPage]);

  const startIndex = totalItems > 0 ? ((validCurrentPage - 1) * rowsPerPage) + 1 : 0;
  const endIndex = Math.min(validCurrentPage * rowsPerPage, totalItems);

  function updatePage(nextPage) {
    const safePage = Math.min(Math.max(1, nextPage), pageCount);
    if (isServerPagination) {
      serverPagination?.onPageChange?.(safePage);
      return;
    }
    setCurrentPage(safePage);
  }

  function updateRows(nextRows) {
    if (isServerPagination) {
      serverPagination?.onLimitChange?.(nextRows);
      return;
    }
    setRowsPerPage(nextRows);
    setCurrentPage(1);
  }

  return (
    <div className="flex flex-col">
      {(onSearch !== undefined || headerActions !== undefined || true) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-1 max-w-md">
            {onSearch !== undefined && (
              <div className="relative w-full">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="flex h-9 w-full rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white px-3 pl-9 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <Select
              value={rowsPerPage}
              onChange={(val) => updateRows(Number(val))}
              options={[
                { label: '10 rows', value: 10 },
                { label: '25 rows', value: 25 },
                { label: '50 rows', value: 50 },
                { label: '100 rows', value: 100 },
              ]}
              size="sm"
              className="w-28"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-t-2xl border border-slate-200 border-b-0 bg-white">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-[0.05em] text-[11px]">
            <tr>
              <th className="px-4 py-3.5 w-16 whitespace-nowrap">#</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3.5 whitespace-nowrap ${col.sortable ? 'cursor-pointer hover:bg-slate-100 transition-colors select-none' : ''} ${col.align === 'right' ? 'text-right' : ''} ${col.align === 'center' ? 'text-center' : ''}`}
                  onClick={() => col.sortable && !isServerPagination && handleSort(col.key)}
                >
                  <div className={`flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : ''} ${col.align === 'center' ? 'justify-center' : ''}`}>
                    {col.label}
                    {col.sortable && !isServerPagination && (
                      <span className="text-slate-400">
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? <ArrowUp size={14} className="text-blue-600" /> : <ArrowDown size={14} className="text-blue-600" />
                        ) : (
                          <ArrowUpDown size={14} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => (
                <tr key={row.id || index} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-400">
                    {startIndex + index}
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-slate-700 ${col.align === 'right' ? 'text-right' : ''} ${col.align === 'center' ? 'text-center' : ''}`}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border border-slate-200 bg-white px-4 py-3 rounded-b-2xl">
        <div className="text-[13px] text-slate-500">
          Showing {startIndex} to {endIndex} of {totalItems}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => updatePage(validCurrentPage - 1)}
            disabled={validCurrentPage === 1}
            className="flex h-8 items-center gap-1 rounded-[var(--radius-button,1rem)] px-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="hidden sm:inline">Previous</span>
          </button>

          <div className="flex h-8 min-w-[32px] items-center justify-center rounded-[var(--radius-button,1rem)] bg-[var(--primary,#1661F6)] px-2 text-[13px] font-medium text-white shadow-sm">
            {validCurrentPage}
          </div>

          <button
            onClick={() => updatePage(validCurrentPage + 1)}
            disabled={validCurrentPage === pageCount || totalItems === 0}
            className="flex h-8 items-center gap-1 rounded-[var(--radius-button,1rem)] px-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="hidden sm:inline">Next</span>
          </button>
        </div>
      </div>
    </div>
  );
}

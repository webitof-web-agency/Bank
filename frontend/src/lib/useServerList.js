import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// Drives a server-paged list: the page fetches only the rows it shows.
// `fetchPage({ page, limit, search, sortKey, sortDir })` must resolve to the
// API response `{ data, meta: { total, summary } }`. `filters` is any value
// whose change should refetch from page 1 (filter fields, section, FY...).
export function useServerList(fetchPage, filters, { defaultLimit = 10, debounceMs = 300, enabled = true, errorMessage = 'Unable to load data' } = {}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultLimit);
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestIdRef = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const filterKey = JSON.stringify(filters ?? null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [search, debounceMs]);

  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  useEffect(() => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    Promise.resolve(fetchRef.current({ page, limit, search: debouncedSearch, sortKey: sort.key, sortDir: sort.dir }))
      .then((response) => {
        if (requestId !== requestIdRef.current) return;
        const meta = response?.meta || {};
        setRows(Array.isArray(response?.data) ? response.data : []);
        setTotal(Number(meta.total || 0));
        setSummary(meta.summary || {});
        // The server clamps a page past the end (e.g. after a delete).
        if (meta.page && Number(meta.page) !== page) setPage(Number(meta.page));
        setError(null);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        setError(err);
        toast.error(err?.message || errorMessage);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [enabled, page, limit, sort.key, sort.dir, debouncedSearch, filterKey, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return {
    rows,
    setRows,
    total,
    summary,
    loading,
    error,
    search,
    setSearch,
    reload,
    // The current query without paging, e.g. for a full CSV export.
    query: { search: debouncedSearch, sortKey: sort.key, sortDir: sort.dir },
    serverPagination: {
      page,
      limit,
      total,
      loading,
      sortKey: sort.key,
      sortDir: sort.dir,
      onPageChange: setPage,
      onLimitChange: (next) => {
        setLimit(next);
        setPage(1);
      },
      onSortChange: (key, dir) => {
        setSort({ key, dir });
        setPage(1);
      }
    }
  };
}

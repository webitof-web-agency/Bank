// Server-side paging for list endpoints. A list is paged only when the request
// carries `page`; without it the endpoint keeps returning every row, which
// reports, pickers and CSV export rely on.

const MAX_LIMIT = 500;

function getPath(row, path) {
  return String(path || '').split('.').reduce((value, key) => (value == null ? value : value[key]), row);
}

// A sort key may list fallbacks, "instrumentNo|referenceNo": the first
// non-empty value wins, like a column showing `a || b`. Arrays (e.g. roles)
// sort by their names.
function getSortValue(row, sortKey) {
  for (const path of sortKey.split('|')) {
    let value = getPath(row, path.trim());
    if (Array.isArray(value)) {
      value = value.map((item) => (item && typeof item === 'object' ? (item.name || item.label || item.code || '') : item)).join(', ');
    }
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function compareSortValues(a, b) {
  if (a == null || a === '') return (b == null || b === '') ? 0 : -1;
  if (b == null || b === '') return 1;
  const numA = typeof a === 'number' ? a : Number(a);
  const numB = typeof b === 'number' ? b : Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB) && String(a).trim() !== '' && String(b).trim() !== '') {
    return numA - numB;
  }
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

function wantsPaging(query = {}) {
  return query.page !== undefined && query.page !== '';
}

function matchesSearch(row, fields, term) {
  if (!term) return true;
  return fields.some((field) => String(getPath(row, field) ?? '').toLowerCase().includes(term));
}

// rows: the fully filtered list. options.searchFields: dot paths searched in
// memory (for rows the database could not search, e.g. legacy vouchers).
// options.summarize(rows): totals over every matching row, not just the page.
function paginateRows(rows = [], query = {}, options = {}) {
  const term = String(query.search || '').trim().toLowerCase();
  let list = options.searchFields?.length && term
    ? rows.filter((row) => matchesSearch(row, options.searchFields, term))
    : rows;

  const sortKey = String(query.sortKey || '').trim();
  if (sortKey) {
    const direction = String(query.sortDir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
    list = [...list].sort((a, b) => compareSortValues(getSortValue(a, sortKey), getSortValue(b, sortKey)) * direction);
  }

  const total = list.length;
  // limit=all returns every matching row in one page (CSV export).
  const limit = String(query.limit) === 'all'
    ? Math.max(1, total)
    : Math.max(1, Math.min(MAX_LIMIT, Number(query.limit) || 10));
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(1, Number(query.page) || 1), pageCount);
  const start = (page - 1) * limit;

  return {
    data: list.slice(start, start + limit),
    meta: {
      total,
      page,
      limit,
      ...(options.summarize ? { summary: options.summarize(list) } : {})
    }
  };
}

module.exports = { paginateRows, wantsPaging, getPath };

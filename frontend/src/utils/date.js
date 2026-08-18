const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function formatParts(year, month, day, fallback) {
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) {
    return fallback;
  }

  return `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatDateOnly(value, fallback = '-') {
  if (value == null || String(value).trim() === '') return fallback;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
    if (dateOnlyMatch) {
      return formatParts(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]),
        Number(dateOnlyMatch[3]),
        trimmed
      );
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return formatParts(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth() + 1,
    parsed.getUTCDate(),
    String(value)
  );
}

export function isDateOnlyColumn(column = {}) {
  const key = String(column.key || '');
  const label = String(column.label || '');

  return key.toLowerCase() === 'date'
    || /date$/i.test(key)
    || /(?:created|updated|deleted|received|read|sent|logged|login)At$/i.test(key)
    || /\bdate\b/i.test(label);
}

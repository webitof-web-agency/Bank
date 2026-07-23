export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

export function sumBy(items = [], selector = (item) => item) {
  return round2(items.reduce((total, item) => total + toNumber(selector(item)), 0));
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateString, days) {
  const date = new Date(dateString || today());
  date.setDate(date.getDate() + toNumber(days));
  return date.toISOString().slice(0, 10);
}

export function getFinancialYear(dateString = today()) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export function getMonthKey(dateString = today()) {
  return (dateString || today()).slice(0, 7);
}

export function isSameMonth(dateString, compareDate = today()) {
  return getMonthKey(dateString) === getMonthKey(compareDate);
}

export function findById(items = [], id) {
  return items.find((item) => String(item.id) === String(id));
}

export function removeById(items = [], id) {
  return items.filter((item) => String(item.id) !== String(id));
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function optionList(items = [], selectedValue = '') {
  return items.map((item) => {
    const value = typeof item === 'object' ? item.value ?? item.id ?? item.name : item;
    const label = typeof item === 'object' ? item.label ?? item.name ?? item.value ?? item.id : item;
    const selected = String(value) === String(selectedValue) ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
  }).join('');
}

export function isDateWithinDays(dateString, days) {
  if (!dateString) return false;
  const now = new Date(today());
  const target = new Date(dateString);
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= days;
}

export function showToast(message, type = 'success') {
  const root = document.getElementById('toastRoot');
  if (!root) {
    window.alert(message);
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

export function readForm(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    if (data[key] !== undefined) {
      data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    } else {
      data[key] = value;
    }
  });
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    data[input.name] = input.checked;
  });
  return data;
}

export function collectionLabel(collection, id, fallback = '-') {
  const item = findById(collection, id);
  return item?.name || item?.title || item?.invoiceNumber || item?.bankName || fallback;
}

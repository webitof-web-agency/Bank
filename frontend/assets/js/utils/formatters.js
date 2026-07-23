import { escapeHtml, toNumber } from './helpers.js';

export function formatCurrencyINR(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(toNumber(value));
}

export function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2
  }).format(toNumber(value));
}

export function formatStatus(status = '') {
  const normalized = String(status).toLowerCase().replaceAll(' ', '-');
  return `<span class="badge status-${escapeHtml(normalized)}">${escapeHtml(status || 'Unknown')}</span>`;
}

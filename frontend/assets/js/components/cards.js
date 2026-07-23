import { escapeHtml } from '../utils/helpers.js';

export function summaryCard({ label, value, meta = '', tone = 'default', link = '' }) {
  const startTag = link
    ? `<a href="${escapeHtml(link)}" class="summary-card hover-link tone-${escapeHtml(tone)}">`
    : `<article class="summary-card tone-${escapeHtml(tone)}">`;
  const endTag = link ? '</a>' : '</article>';

  return `
    ${startTag}
      <span class="summary-label">${escapeHtml(label)}</span>
      <strong class="summary-value">${value}</strong>
      ${meta ? `<small class="summary-meta">${escapeHtml(meta)}</small>` : ''}
    ${endTag}
  `;
}

export function summaryGrid(cards = []) {
  return `<section class="summary-grid">${cards.map(summaryCard).join('')}</section>`;
}

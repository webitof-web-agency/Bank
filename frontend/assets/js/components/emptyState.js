import { escapeHtml } from '../utils/helpers.js';

export function emptyState(title = 'No records found', message = 'Add a record to get started.', actionHtml = '') {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">+</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${actionHtml}
    </div>
  `;
}

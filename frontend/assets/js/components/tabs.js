import { escapeHtml } from '../utils/helpers.js';

export function renderTabs(tabs = [], activeKey = '') {
  return `
    <nav class="tabs" aria-label="Section tabs">
      ${tabs.map((tab) => `
        <a class="tab ${tab.key === activeKey ? 'active' : ''}" href="${escapeHtml(tab.route)}">${escapeHtml(tab.label)}</a>
      `).join('')}
    </nav>
  `;
}

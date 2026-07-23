import { escapeHtml } from '../utils/helpers.js';

export function renderHeader({ title = 'Dashboard', subtitle = '' } = {}) {
  const root = document.getElementById('header');
  if (!root) return;
  root.innerHTML = `
    <div class="page-heading">
      <button class="icon-btn mobile-menu-btn" type="button" data-action="toggle-sidebar" title="Menu">Menu</button>
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </div>
    </div>
    <div class="header-actions">
      <label class="search-box">
        <span>Search</span>
        <input type="search" id="globalSearch" placeholder="Search clients, invoices, projects">
      </label>
      <a class="btn btn-secondary" href="#/clients/add">New Client</a>
      <a class="btn btn-primary" href="#/invoices/add">New Invoice</a>
    </div>
  `;
}

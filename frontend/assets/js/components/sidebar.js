import { SIDEBAR_MENU } from '../constants.js';
import { escapeHtml } from '../utils/helpers.js';

const ICONS = {
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.9"></path><path d="M16 3.1a4 4 0 0 1 0 7.8"></path></svg>',
  briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path><path d="M2 12h20"></path></svg>',
  receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2v20l3-2 3 2 3-2 3 2 4-2V2l-4 2-3-2-3 2-3-2-3 2Z"></path><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>',
  wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v13H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h15"></path><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z"></path></svg>',
  card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M2 10h20"></path><path d="M6 15h4"></path></svg>',
  bank: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18"></path><path d="M5 10v8"></path><path d="M9 10v8"></path><path d="M15 10v8"></path><path d="M19 10v8"></path><path d="M2 18h20"></path><path d="m12 3 9 5H3l9-5Z"></path></svg>',
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 1 4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="m7 23-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21v-7"></path><path d="M4 10V3"></path><path d="M12 21v-9"></path><path d="M12 8V3"></path><path d="M20 21v-5"></path><path d="M20 12V3"></path><path d="M2 14h4"></path><path d="M10 8h4"></path><path d="M18 16h4"></path></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"></path><path d="M7 16l4-4 3 3 5-7"></path></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z"></path></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>'
};

export function renderSidebar(activeHash = '#/dashboard') {
  const root = document.getElementById('sidebar');
  if (!root) return;
  root.innerHTML = `
    <div class="brand">
      <img src="./assets/images/placeholder-logo.svg" alt="Webitof logo">
      <div>
        <strong>Webitof ERP</strong>
        <span>Client + Finance</span>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${SIDEBAR_MENU.map((group) => `
        <section class="nav-group">
          <button class="nav-group-title" type="button" data-action="toggle-nav-group">
            <span>${escapeHtml(group.label)}</span>
            <svg class="chevron-icon" viewBox="0 0 24 24" width="12" height="12"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="nav-group-items">
            ${group.items.map((item) => {
              const active = isActiveRoute(activeHash, item.route);
              return `
                <a class="nav-link ${active ? 'active' : ''}" href="${escapeHtml(item.route)}">
                  <span class="nav-icon">${ICONS[item.icon] || ICONS.file}</span>
                  <span>${escapeHtml(item.label)}</span>
                </a>
              `;
            }).join('')}
          </div>
        </section>
      `).join('')}
    </nav>
  `;
}

export function bindSidebar() {
  document.getElementById('sidebar')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="toggle-nav-group"]');
    if (button) button.parentElement.classList.toggle('collapsed');
  });
}

function isActiveRoute(activeHash, route) {
  const activeBase = activeHash.split('/').slice(0, 3).join('/');
  const routeBase = route.split('/').slice(0, 3).join('/');
  return activeHash === route || activeBase === routeBase;
}

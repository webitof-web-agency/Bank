import { renderSidebar } from './components/sidebar.js';
import { renderHeader } from './components/header.js';
import { renderDashboard, bindDashboard } from './modules/dashboard.js';
import { renderClients, bindClients } from './modules/clients.js';
import { renderClientDetail, bindClientDetail } from './modules/clientDetail.js';
import { renderProjects, bindProjects } from './modules/projects.js';
import { renderInvoices, bindInvoices } from './modules/invoices.js';
import { renderPayments, bindPayments } from './modules/payments.js';
import { renderExpenses, bindExpenses } from './modules/expenses.js';
import { renderVendors, bindVendors } from './modules/vendors.js';
import { renderOutsourcing, bindOutsourcing } from './modules/outsourcing.js';
import { renderLeadCommissions, bindLeadCommissions } from './modules/leadCommissions.js';
import { renderBanking, bindBanking } from './modules/banking.js';
import { renderAmc, bindAmc } from './modules/amc.js';
import { renderRenewals, bindRenewals } from './modules/renewals.js';
import { renderMasters, bindMasters } from './modules/masters.js';
import { renderReports, bindReports } from './modules/reports.js';
import { renderProjectProfitability, bindProjectProfitability } from './modules/projectProfitability.js';
import { renderSettings, bindSettings } from './modules/settings.js';

const ROUTES = [
  { pattern: /^\/dashboard$/, title: 'Dashboard', render: renderDashboard, bind: bindDashboard },
  { pattern: /^\/clients$/, title: 'Clients', render: renderClients, bind: bindClients },
  { pattern: /^\/clients\/add$/, title: 'Add Client', render: () => renderClients({ mode: 'add' }), bind: () => bindClients({ mode: 'add' }) },
  { pattern: /^\/clients\/edit\/([^/]+)$/, title: 'Edit Client', render: ([id]) => renderClients({ mode: 'edit', id }), bind: ([id]) => bindClients({ mode: 'edit', id }) },
  { pattern: /^\/clients\/detail\/([^/]+)\/?([^/]*)?$/, title: 'Client Detail', render: ([id, tab]) => renderClientDetail({ id, tab: tab || 'overview' }), bind: ([id, tab]) => bindClientDetail({ id, tab }) },
  { pattern: /^\/projects$/, title: 'Projects', render: renderProjects, bind: bindProjects },
  { pattern: /^\/projects\/add$/, title: 'Add Project', render: () => renderProjects({ mode: 'add' }), bind: () => bindProjects({ mode: 'add' }) },
  { pattern: /^\/projects\/edit\/([^/]+)$/, title: 'Edit Project', render: ([id]) => renderProjects({ mode: 'edit', id }), bind: ([id]) => bindProjects({ mode: 'edit', id }) },
  { pattern: /^\/invoices$/, title: 'Invoices', render: renderInvoices, bind: bindInvoices },
  { pattern: /^\/invoices\/add$/, title: 'Add Invoice', render: (_, query) => renderInvoices({ mode: 'add', query }), bind: (_, query) => bindInvoices({ mode: 'add', query }) },
  { pattern: /^\/invoices\/edit\/([^/]+)$/, title: 'Edit Invoice', render: ([id]) => renderInvoices({ mode: 'edit', id }), bind: ([id]) => bindInvoices({ mode: 'edit', id }) },
  { pattern: /^\/invoices\/preview\/([^/]+)$/, title: 'Invoice Preview', render: ([id]) => renderInvoices({ mode: 'preview', id }), bind: ([id]) => bindInvoices({ mode: 'preview', id }) },
  { pattern: /^\/payments$/, title: 'Payments', render: renderPayments, bind: bindPayments },
  { pattern: /^\/expenses$/, title: 'Expenses', render: renderExpenses, bind: bindExpenses },
  { pattern: /^\/vendors$/, title: 'Vendors', render: renderVendors, bind: bindVendors },
  { pattern: /^\/outsourcing$/, title: 'Outsourcing', render: renderOutsourcing, bind: bindOutsourcing },
  { pattern: /^\/lead-commissions$/, title: 'Lead Commissions', render: renderLeadCommissions, bind: bindLeadCommissions },
  { pattern: /^\/banking$/, title: 'Banking', render: renderBanking, bind: bindBanking },
  { pattern: /^\/amc$/, title: 'AMC', render: renderAmc, bind: bindAmc },
  { pattern: /^\/renewals\/?([^/]*)?$/, title: 'Renewals', render: ([section]) => renderRenewals({ section: section || 'dashboard' }), bind: ([section]) => bindRenewals({ section: section || 'dashboard' }) },
  { pattern: /^\/masters\/?([^/]*)?$/, title: 'Masters', render: ([section]) => renderMasters({ section: section || 'services' }), bind: ([section]) => bindMasters({ section: section || 'services' }) },
  { pattern: /^\/reports\/?([^/]*)?$/, title: 'Reports', render: ([section]) => renderReports({ section: section || 'analytics' }), bind: ([section]) => bindReports({ section: section || 'analytics' }) },
  { pattern: /^\/project-profitability$/, title: 'Project Profitability', render: renderProjectProfitability, bind: bindProjectProfitability },
  { pattern: /^\/settings$/, title: 'Settings', render: renderSettings, bind: bindSettings }
];

export function initRouter() {
  window.addEventListener('hashchange', route);
  if (!window.location.hash) {
    window.location.hash = '#/dashboard';
  } else {
    route();
  }
}

export function route() {
  const main = document.getElementById('mainContent');
  const { path, query } = parseHash();
  const matched = findRoute(path);

  if (!matched) {
    renderHeader({ title: 'Page Not Found' });
    renderSidebar(window.location.hash);
    main.innerHTML = `
      <section class="page-section">
        <h2>Route not found</h2>
        <p>The requested ERP screen does not exist.</p>
        <a class="btn btn-primary" href="#/dashboard">Go to Dashboard</a>
      </section>
    `;
    return;
  }

  renderHeader({ title: matched.title });
  renderSidebar(window.location.hash);
  main.innerHTML = matched.route.render(matched.params, query);
  matched.route.bind?.(matched.params, query);
  document.body.classList.remove('sidebar-open');

  main.querySelectorAll('input, select, textarea').forEach((el) => {
    el.classList.toggle('has-value', el.value !== '');
  });
}

function findRoute(path) {
  for (const routeItem of ROUTES) {
    const match = path.match(routeItem.pattern);
    if (match) return { route: routeItem, title: routeItem.title, params: match.slice(1) };
  }
  return null;
}

function parseHash() {
  const raw = (window.location.hash || '#/dashboard').slice(1);
  const [pathPart, queryString = ''] = raw.split('?');
  return {
    path: pathPart || '/dashboard',
    query: Object.fromEntries(new URLSearchParams(queryString).entries())
  };
}

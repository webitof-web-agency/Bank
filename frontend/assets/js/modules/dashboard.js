import { summaryGrid } from '../components/cards.js';
import { renderTable } from '../components/table.js';
import { mergeSeedData, create50KProjectDemo, createEmptyState } from '../seed.js';
import { getState, setState } from '../state.js';
import { resetData } from '../storage.js';
import { calculateDashboardMetrics, calculateGstSummary, calculateProfitLoss } from '../utils/finance.js';
import { findById, showToast } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';

export function renderDashboard() {
  const state = getState();
  const metrics = calculateDashboardMetrics(state);
  const gst = calculateGstSummary(state);
  const pl = calculateProfitLoss(state);
  const demoInvoice = [...state.invoices].reverse().find((invoice) => invoice.demoSummary);

  const cards = [
    { label: 'Total Clients', value: metrics.totalClients, meta: 'All client records', link: '#/clients' },
    { label: 'Active Projects', value: metrics.activeProjects, meta: 'Currently in progress', link: '#/projects' },
    { label: 'Monthly Sales', value: formatCurrencyINR(metrics.monthlySales), meta: 'Taxable revenue', link: '#/reports' },
    { label: 'Monthly Expense', value: formatCurrencyINR(metrics.monthlyExpense), meta: 'GST-aware expense', link: '#/reports' },
    { label: 'Monthly Profit', value: formatCurrencyINR(metrics.monthlyProfit), tone: metrics.monthlyProfit >= 0 ? 'success' : 'danger', link: '#/reports' },
    { label: 'Total Due', value: formatCurrencyINR(metrics.totalDue), meta: 'Receivables', link: '#/invoices' },
    { label: 'GST Payable', value: formatCurrencyINR(metrics.gstPayable), meta: 'Output minus input GST', link: '#/reports/gst' },
    { label: 'AMC Expiring Soon', value: metrics.amcExpiringSoon, meta: 'Next 30 days', link: '#/amc' },
    { label: 'Renewals Expiring Soon', value: metrics.renewalsExpiringSoon, meta: 'Domain / hosting / software', link: '#/renewals/dashboard' },
    { label: 'Pending Invoices', value: metrics.pendingInvoices, meta: 'Sent or partially paid', link: '#/invoices' }
  ];

  const invoices = state.invoices.slice(0, 6);

  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Business Snapshot</h2>
          <p>GST-compliant finance numbers generated from localStorage data.</p>
        </div>
        <div class="button-row">
          <button class="btn btn-secondary" type="button" data-action="seed-sample">Create Sample Data</button>
          <button class="btn btn-secondary" type="button" data-action="seed-50k">Create 50K Project Demo</button>
          <button class="btn btn-danger" type="button" data-action="reset-data">Reset All Data</button>
        </div>
      </div>
      ${summaryGrid(cards)}
    </section>

    <section class="two-column">
      <article class="panel">
        <h2>GST Position</h2>
        <div class="metric-list">
          <p><span>Output GST</span><strong>${formatCurrencyINR(gst.outputGst)}</strong></p>
          <p><span>Input GST</span><strong>${formatCurrencyINR(gst.inputGst)}</strong></p>
          <p><span>Net GST Payable</span><strong>${formatCurrencyINR(gst.netGstPayable)}</strong></p>
        </div>
      </article>
      <article class="panel">
        <h2>Profit & Loss</h2>
        <div class="metric-list">
          <p><span>Revenue</span><strong>${formatCurrencyINR(pl.revenue)}</strong></p>
          <p><span>Expense</span><strong>${formatCurrencyINR(pl.expense)}</strong></p>
          <p><span>Profit</span><strong>${formatCurrencyINR(pl.profit)}</strong></p>
        </div>
      </article>
    </section>

    ${demoInvoice ? `
      <section class="page-section">
        <article class="panel">
          <h2>50K Project Demo Calculation</h2>
          <div class="metric-list wide">
            <p><span>Revenue = invoice taxable value</span><strong>${formatCurrencyINR(demoInvoice.demoSummary.revenue)}</strong></p>
            <p><span>Expense = amount before GST</span><strong>${formatCurrencyINR(demoInvoice.demoSummary.expense)}</strong></p>
            <p><span>GST Output = GST collected</span><strong>${formatCurrencyINR(demoInvoice.demoSummary.gstOutput)}</strong></p>
            <p><span>GST Input = GST on expense</span><strong>${formatCurrencyINR(demoInvoice.demoSummary.gstInput)}</strong></p>
            <p><span>Net GST Payable = output minus input</span><strong>${formatCurrencyINR(demoInvoice.demoSummary.netGstPayable)}</strong></p>
            <p><span>Profit = revenue minus expense</span><strong>${formatCurrencyINR(demoInvoice.demoSummary.profit)}</strong></p>
          </div>
        </article>
      </section>
    ` : ''}

    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Recent Invoices</h2>
          <p>Pending and recent billing activity.</p>
        </div>
        <a class="btn btn-primary" href="#/invoices/add">New Invoice</a>
      </div>
      ${renderTable({
        columns: [
          { label: 'Invoice', render: (invoice) => `<a href="#/invoices/preview/${invoice.id}">${invoice.invoiceNumber}</a>` },
          { label: 'Client', render: (invoice) => findById(state.clients, invoice.clientId)?.companyName || '-' },
          { label: 'Date', render: (invoice) => formatDate(invoice.invoiceDate) },
          { label: 'Status', align: 'center', render: (invoice) => formatStatus(invoice.status) }
        ],
        rows: invoices,
        emptyTitle: 'No invoices',
        emptyMessage: 'Create an invoice to see billing activity.'
      })}
    </section>
  `;
}

export function bindDashboard() {
  document.querySelector('[data-action="seed-sample"]')?.addEventListener('click', () => {
    setState(mergeSeedData(getState()));
    showToast('Sample data created.');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  document.querySelector('[data-action="seed-50k"]')?.addEventListener('click', () => {
    setState(create50KProjectDemo(getState()));
    showToast('50K project demo created.');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  document.querySelector('[data-action="reset-data"]')?.addEventListener('click', () => {
    if (!window.confirm('Reset all local demo data?')) return;
    resetData();
    setState(createEmptyState());
    showToast('All local data reset.');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

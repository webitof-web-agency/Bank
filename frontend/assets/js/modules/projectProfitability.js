import { summaryGrid } from '../components/cards.js';
import { renderTable } from '../components/table.js';
import { getState } from '../state.js';
import { calculatePortfolioProfitability } from '../utils/projectProfitability.js';
import { escapeHtml, findById } from '../utils/helpers.js';
import { formatCurrencyINR } from '../utils/formatters.js';

export function renderProjectProfitability() {
  const state = getState();
  const rows = calculatePortfolioProfitability(state);
  const totals = rows.reduce((acc, row) => {
    acc.revenue += row.summary.salesTaxableValue;
    acc.outsourcing += row.summary.outsourcingBaseCost;
    acc.commissions += row.summary.commissionBaseCost;
    acc.other += row.summary.otherBaseExpenses;
    acc.profit += row.summary.grossProfit;
    acc.pending += row.summary.pendingAmount;
    return acc;
  }, { revenue: 0, outsourcing: 0, commissions: 0, other: 0, profit: 0, pending: 0 });

  return `
    <section class="page-section wide">
      <div class="section-toolbar">
        <div>
          <h2>Project Profitability</h2>
          <p>GST collected is not treated as profit. Profit uses taxable sales minus outsourcing, commission, and other project costs.</p>
        </div>
      </div>
      ${summaryGrid([
        { label: 'Taxable Revenue', value: formatCurrencyINR(totals.revenue) },
        { label: 'Outsourcing Cost', value: formatCurrencyINR(totals.outsourcing) },
        { label: 'Commission Cost', value: formatCurrencyINR(totals.commissions) },
        { label: 'Other Expenses', value: formatCurrencyINR(totals.other) },
        { label: 'Gross Profit', value: formatCurrencyINR(totals.profit), tone: totals.profit >= 0 ? 'success' : 'danger' },
        { label: 'Client Pending', value: formatCurrencyINR(totals.pending), tone: totals.pending > 0 ? 'warning' : 'success' }
      ])}
      ${renderTable({
        rows,
        columns: [
          { label: 'Project', render: (row) => `<strong>${escapeHtml(row.project.title)}</strong><small>${escapeHtml(findById(state.clients, row.project.clientId)?.companyName || '-')}</small>` },
          { label: 'Sales Taxable', render: (row) => formatCurrencyINR(row.summary.salesTaxableValue) },
          { label: 'GST Collected', render: (row) => formatCurrencyINR(row.summary.gstCollected) },
          { label: 'Received / Pending', render: (row) => `${formatCurrencyINR(row.summary.amountReceived)}<small>${formatCurrencyINR(row.summary.pendingAmount)} pending</small>` },
          { label: 'Outsource', render: (row) => formatCurrencyINR(row.summary.outsourcingBaseCost) },
          { label: 'Commission', render: (row) => formatCurrencyINR(row.summary.commissionBaseCost) },
          { label: 'Other', render: (row) => formatCurrencyINR(row.summary.otherBaseExpenses) },
          { label: 'ITC / TDS', render: (row) => `${formatCurrencyINR(row.summary.itcEligibleGst)}<small>${formatCurrencyINR(row.summary.tdsDeducted)} TDS</small>` },
          { label: 'Profit', render: (row) => `${formatCurrencyINR(row.summary.grossProfit)}<small>${row.summary.profitPercent}%</small>` }
        ],
        emptyTitle: 'No projects',
        emptyMessage: 'Create projects and invoices to see profitability.'
      })}
      <p class="report-note">${escapeHtml(state.settings?.complianceNote || '')}</p>
    </section>
  `;
}

export function bindProjectProfitability() {}

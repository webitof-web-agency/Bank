import { summaryGrid } from '../components/cards.js';
import { renderTable } from '../components/table.js';
import { getState } from '../state.js';
import {
  calculateBalanceSheet,
  calculateGstSummary,
  calculateLedgerSummary,
  calculateProfitLoss,
  calculateProjectSummary,
  calculateDetailedProfitLoss,
  calculateDetailedBalanceSheet,
  calculateMonthlyTrends,
  calculateExpenseCategoryDistribution,
  calculateInvoiceTotals,
  getInvoiceDueAmount
} from '../utils/finance.js';
import { escapeHtml, findById, sumBy } from '../utils/helpers.js';
import {
  calculateLeadCommission,
  calculateOutsourcingExpense,
  collectItcRows,
  collectTdsRows,
  getPendingVendorPayables
} from '../utils/outsourcingAccounting.js';
import { calculatePortfolioProfitability } from '../utils/projectProfitability.js';
import { getComputedRenewalStatus, getRenewalAmount, getRenewalDate, getRenewalProvider, getRenewalTitle } from '../utils/renewals.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';

const REPORT_TABS = [
  { key: 'analytics', label: 'Analytics Dashboard', route: '#/reports/analytics' },
  { key: 'gst', label: 'GST Summary', route: '#/reports/gst' },
  { key: 'pl', label: 'Profit & Loss', route: '#/reports/pl' },
  { key: 'balance-sheet', label: 'Balance Sheet', route: '#/reports/balance-sheet' },
  { key: 'ca-audit', label: 'CA Audit Summary', route: '#/reports/ca-audit' },
  { key: 'ledger', label: 'Ledger', route: '#/reports/ledger' },
  { key: 'sales', label: 'Sales Invoices', route: '#/reports/sales' },
  { key: 'project-profit', label: 'Project Profit', route: '#/reports/project-profit' },
  { key: 'vendor-expenses', label: 'Vendor Expenses', route: '#/reports/vendor-expenses' },
  { key: 'commissions', label: 'Commissions', route: '#/reports/commissions' },
  { key: 'itc', label: 'ITC Log', route: '#/reports/itc' },
  { key: 'tds', label: 'TDS Log', route: '#/reports/tds' },
  { key: 'pending', label: 'Pending Payouts', route: '#/reports/pending' },
  { key: 'expenses', label: 'General Expenses', route: '#/reports/expenses' },
  { key: 'clients', label: 'Clients List', route: '#/reports/clients' },
  { key: 'projects', label: 'Projects List', route: '#/reports/projects' },
  { key: 'payments', label: 'Payments List', route: '#/reports/payments' },
  { key: 'renewals', label: 'Renewals List', route: '#/reports/renewals' },
  { key: 'amc', label: 'AMC List', route: '#/reports/amc' }
];

export function renderReports(params = {}) {
  const active = params.section || 'analytics';
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Reports & Analytics Dashboard</h2>
          <p>Real-time accounting ledgers, financial statements, and compliance audits generated from state.</p>
        </div>
      </div>
      <nav class="tabs" style="overflow-x: auto; white-space: nowrap; padding-bottom: 4px;">
        ${REPORT_TABS.map((tab) => `<a class="tab ${tab.key === active ? 'active' : ''}" href="${tab.route}">${tab.label}</a>`).join('')}
      </nav>
      ${renderReport(active)}
      <p class="report-note" style="margin-top: 24px;">${escapeHtml(getState().settings?.complianceNote || '')}</p>
    </section>
  `;
}

export function bindReports() {}

function renderReport(active) {
  const state = getState();

  if (active === 'analytics') {
    const pl = calculateDetailedProfitLoss(state);
    const bs = calculateDetailedBalanceSheet(state);
    const gst = calculateGstSummary(state);
    const trends = calculateMonthlyTrends(state);
    const expenseCats = calculateExpenseCategoryDistribution(state);

    return `
      <div>
        <!-- Key Metrics Cards -->
        ${summaryGrid([
          { label: 'Sundry Debtors (Receivables)', value: formatCurrencyINR(bs.receivables), meta: 'Outstanding client invoices' },
          { label: 'Sundry Creditors (Payables)', value: formatCurrencyINR(bs.sundryCreditors), meta: 'Outstanding vendor/partner payouts' },
          { label: 'Net GST Liability', value: formatCurrencyINR(gst.netGstPayable), tone: gst.netGstPayable >= 0 ? 'warning' : 'success', meta: 'Tax payable minus input tax credits' },
          { label: 'Current Period Net Profit', value: formatCurrencyINR(pl.netProfit), tone: pl.netProfit >= 0 ? 'success' : 'danger', meta: 'Service revenues minus all business costs' }
        ])}

        <!-- Visual Analytics Grid -->
        <div class="analytics-grid" style="margin-top: 24px;">
          <!-- Chart 1: Revenue vs Expenses -->
          <div class="chart-card">
            <div>
              <h3>Monthly Revenue vs Expenses</h3>
              <p>Comparison of gross taxable sales revenue and combined expenses over the last 6 months.</p>
            </div>
            <div class="chart-svg-container">
              ${renderSalesExpenseChart(trends)}
            </div>
            <div class="chart-legend">
              <div class="legend-item"><span class="legend-color sales"></span><span>Sales Revenue</span></div>
              <div class="legend-item"><span class="legend-color expense"></span><span>Business Expenses</span></div>
            </div>
          </div>

          <!-- Chart 2: Cash Flow Trend -->
          <div class="chart-card">
            <div>
              <h3>Cash Flow Trend</h3>
              <p>Cumulative monthly bank balance tracking the business's liquid funds.</p>
            </div>
            <div class="chart-svg-container">
              ${renderCashFlowChart(trends)}
            </div>
            <div class="chart-legend">
              <div class="legend-item"><span class="legend-color sales"></span><span>Cumulative Bank Balance</span></div>
            </div>
          </div>

          <!-- Chart 3: Expense Distribution -->
          <div class="chart-card" style="grid-column: span 12;">
            <div>
              <h3>Expense Distribution Analysis</h3>
              <p>Breakdown of all direct outsourcing/referral costs and indirect administrative expenses.</p>
            </div>
            <div>
              ${renderExpenseDonutChart(expenseCats)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (active === 'pl') {
    const pl = calculateDetailedProfitLoss(state);
    return `
      <div class="financial-statement-wrap">
        <table class="financial-table">
          <thead>
            <tr>
              <th>Particulars</th>
              <th class="align-right">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr class="section-header">
              <td colspan="2">I. REVENUE FROM OPERATIONS</td>
            </tr>
            <tr>
              <td class="indented">Gross Service Revenues (Sales Invoices)</td>
              <td class="align-right">${formatCurrencyINR(pl.salesRevenue)}</td>
            </tr>
            <tr class="total-row">
              <td>Total Revenue (A)</td>
              <td class="align-right">${formatCurrencyINR(pl.salesRevenue)}</td>
            </tr>
            
            <tr class="section-header">
              <td colspan="2">II. DIRECT COSTS (COST OF SERVICES)</td>
            </tr>
            <tr>
              <td class="indented">Subcontracting & Outsourcing Payouts</td>
              <td class="align-right">${formatCurrencyINR(pl.outsourcingCost)}</td>
            </tr>
            <tr>
              <td class="indented">Referral & Lead Commissions</td>
              <td class="align-right">${formatCurrencyINR(pl.commissionCost)}</td>
            </tr>
            <tr class="total-row">
              <td>Total Direct Costs (B)</td>
              <td class="align-right">${formatCurrencyINR(pl.totalDirectCosts)}</td>
            </tr>
            
            <tr class="total-row" style="background: rgba(99, 102, 241, 0.05);">
              <td><strong>GROSS PROFIT (C = A - B)</strong></td>
              <td class="align-right"><strong>${formatCurrencyINR(pl.grossProfit)}</strong></td>
            </tr>
            
            <tr class="section-header">
              <td colspan="2">III. INDIRECT / OPERATING EXPENSES</td>
            </tr>
            ${pl.indirectExpensesList.map(exp => `
              <tr>
                <td class="indented">${escapeHtml(exp.categoryName)}</td>
                <td class="align-right">${formatCurrencyINR(exp.amount)}</td>
              </tr>
            `).join('')}
            ${pl.indirectExpensesList.length === 0 ? `
              <tr>
                <td class="indented" style="color: var(--color-muted)">No general expenses recorded</td>
                <td class="align-right">₹0.00</td>
              </tr>
            ` : ''}
            <tr class="total-row">
              <td>Total Indirect Expenses (D)</td>
              <td class="align-right">${formatCurrencyINR(pl.totalIndirectExpenses)}</td>
            </tr>
            
            <tr class="grand-total-row">
              <td><strong>NET PROFIT / LOSS (E = C - D)</strong></td>
              <td class="align-right"><strong>${formatCurrencyINR(pl.netProfit)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  if (active === 'balance-sheet') {
    const bs = calculateDetailedBalanceSheet(state);
    return `
      <div class="financial-statement-wrap">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(480px, 1fr)); gap: 24px;">
          <!-- Liabilities & Equity -->
          <div>
            <table class="financial-table" style="margin-bottom: 0;">
              <thead>
                <tr>
                  <th>Equity & Liabilities</th>
                  <th class="align-right">Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                <tr class="section-header">
                  <td colspan="2">A. OWNER'S FUNDS (EQUITY)</td>
                </tr>
                <tr>
                  <td class="indented">Proprietor's Capital Account (Balancing Figure)</td>
                  <td class="align-right">${formatCurrencyINR(bs.proprietorCapital)}</td>
                </tr>
                <tr>
                  <td class="indented">Retained Earnings (Current Year Profit)</td>
                  <td class="align-right">${formatCurrencyINR(bs.retainedEarnings)}</td>
                </tr>
                <tr class="total-row">
                  <td>Total Proprietor Equity</td>
                  <td class="align-right">${formatCurrencyINR(bs.totalEquity)}</td>
                </tr>
                
                <tr class="section-header">
                  <td colspan="2">B. CURRENT LIABILITIES</td>
                </tr>
                <tr>
                  <td class="indented">Sundry Creditors (Pending Payouts)</td>
                  <td class="align-right">${formatCurrencyINR(bs.sundryCreditors)}</td>
                </tr>
                <tr>
                  <td class="indented">GST Payable (Net GST Liability)</td>
                  <td class="align-right">${formatCurrencyINR(bs.gstLiability)}</td>
                </tr>
                <tr>
                  <td class="indented">TDS Payable (Pending Deposits)</td>
                  <td class="align-right">${formatCurrencyINR(bs.tdsPayable)}</td>
                </tr>
                <tr class="total-row">
                  <td>Total Current Liabilities</td>
                  <td class="align-right">${formatCurrencyINR(bs.totalLiabilities)}</td>
                </tr>
                
                <tr class="grand-total-row">
                  <td><strong>TOTAL EQUITY & LIABILITIES</strong></td>
                  <td class="align-right"><strong>${formatCurrencyINR(bs.totalLiabilitiesAndEquity)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Assets -->
          <div>
            <table class="financial-table" style="margin-bottom: 0;">
              <thead>
                <tr>
                  <th>Assets</th>
                  <th class="align-right">Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                <tr class="section-header">
                  <td colspan="2">A. CURRENT ASSETS</td>
                </tr>
                <tr>
                  <td class="indented">Sundry Debtors (Accounts Receivable)</td>
                  <td class="align-right">${formatCurrencyINR(bs.receivables)}</td>
                </tr>
                ${bs.bankDetails.map(bank => `
                  <tr>
                    <td class="indented">${escapeHtml(bank.bankName)} (A/c: ${escapeHtml(bank.accountNumber)})</td>
                    <td class="align-right">${formatCurrencyINR(bank.balance)}</td>
                  </tr>
                `).join('')}
                ${bs.bankDetails.length === 0 ? `
                  <tr>
                    <td class="indented" style="color: var(--color-muted)">No Bank Accounts linked</td>
                    <td class="align-right">₹0.00</td>
                  </tr>
                ` : ''}
                <tr>
                  <td class="indented">GST ITC Receivable (Unutilized Credit)</td>
                  <td class="align-right">${formatCurrencyINR(bs.gstItcReceivable)}</td>
                </tr>
                <tr class="total-row">
                  <td>Total Current Assets</td>
                  <td class="align-right">${formatCurrencyINR(bs.totalAssets)}</td>
                </tr>
                
                <tr class="section-header">
                  <td colspan="2">B. NON-CURRENT / FIXED ASSETS</td>
                </tr>
                <tr>
                  <td class="indented" style="color: var(--color-muted)">Fixed Assets & Equipment</td>
                  <td class="align-right">₹0.00</td>
                </tr>
                
                <tr class="grand-total-row">
                  <td><strong>TOTAL ASSETS</strong></td>
                  <td class="align-right"><strong>${formatCurrencyINR(bs.totalAssets)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  if (active === 'ca-audit') {
    const itcRows = collectItcRows(state);
    const tdsRows = collectTdsRows(state);
    
    // GSTR-1 outward supplies
    const salesRows = state.invoices.filter(inv => inv.status !== 'Cancelled').map(inv => {
      const client = findById(state.clients, inv.clientId) || {};
      const totals = calculateInvoiceTotals(inv, inv.items || [], state.settings, client);
      const isInterstate = client.state && state.settings.company?.state && client.state !== state.settings.company.state;
      return {
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        clientName: client.companyName || client.name || '-',
        clientGstin: client.gstin || 'Unregistered',
        placeOfSupply: inv.placeOfSupply || client.state || '-',
        supplyType: isInterstate ? 'Interstate' : 'Intrastate',
        taxableValue: totals.taxableAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        totalGst: totals.gstAmount,
        totalAmount: totals.totalAmount
      };
    });

    return `
      <div class="financial-statement-wrap">
        <div class="ca-actions-bar no-print">
          <button class="btn btn-secondary" onclick="window.print()">Print CA Audit Copy</button>
        </div>
        
        <h3 class="ca-section-title">GSTR-1 Outward Supplies (Sales Audit Trail)</h3>
        ${renderTable({
          rows: salesRows,
          columns: [
            { label: 'Invoice No', render: (row) => `<strong>${escapeHtml(row.invoiceNumber)}</strong>` },
            { label: 'Date', render: (row) => formatDate(row.invoiceDate) },
            { label: 'Client Name', render: (row) => escapeHtml(row.clientName) },
            { label: 'GSTIN', render: (row) => `<code style="font-size:11px;">${escapeHtml(row.clientGstin)}</code>` },
            { label: 'Place of Supply', render: (row) => escapeHtml(row.placeOfSupply) },
            { label: 'Type', render: (row) => `<small style="font-weight:600;">${escapeHtml(row.supplyType)}</small>` },
            { label: 'Taxable (₹)', align: 'right', render: (row) => formatCurrencyINR(row.taxableValue) },
            { label: 'CGST (₹)', align: 'right', render: (row) => formatCurrencyINR(row.cgst) },
            { label: 'SGST (₹)', align: 'right', render: (row) => formatCurrencyINR(row.sgst) },
            { label: 'IGST (₹)', align: 'right', render: (row) => formatCurrencyINR(row.igst) },
            { label: 'Total GST (₹)', align: 'right', render: (row) => formatCurrencyINR(row.totalGst) },
            { label: 'Gross (₹)', align: 'right', render: (row) => formatCurrencyINR(row.totalAmount) }
          ],
          emptyTitle: 'No sales records',
          emptyMessage: 'No non-cancelled invoices found.'
        })}
        
        <h3 class="ca-section-title">GSTR-3B Inward Supplies (ITC Audit Trail)</h3>
        ${renderTable({
          rows: itcRows,
          columns: [
            { label: 'Invoice/Ref', render: (row) => escapeHtml(row.invoiceNumber) },
            { label: 'Date', render: (row) => formatDate(row.invoiceDate) },
            { label: 'Vendor Name', render: (row) => escapeHtml(row.vendorName) },
            { label: 'GSTIN', render: (row) => `<code style="font-size:11px;">${escapeHtml(row.gstin)}</code>` },
            { label: 'Taxable (₹)', align: 'right', render: (row) => formatCurrencyINR(row.taxableValue) },
            { label: 'CGST (₹)', align: 'right', render: (row) => formatCurrencyINR(row.cgst) },
            { label: 'SGST (₹)', align: 'right', render: (row) => formatCurrencyINR(row.sgst) },
            { label: 'IGST (₹)', align: 'right', render: (row) => formatCurrencyINR(row.igst) },
            { label: 'ITC Eligible (₹)', align: 'right', render: (row) => formatCurrencyINR(row.totalGst) }
          ],
          emptyTitle: 'No ITC purchases',
          emptyMessage: 'No eligible purchases with Input Tax Credit found.'
        })}

        <h3 class="ca-section-title">TDS Deduction Ledger (Form 26Q Report)</h3>
        ${renderTable({
          rows: tdsRows,
          columns: [
            { label: 'Deduction Date', render: (row) => formatDate(row.deductionDate) },
            { label: 'Payee Name', render: (row) => escapeHtml(row.vendorName) },
            { label: 'PAN', render: (row) => `<code style="font-size:11px;">${escapeHtml(row.pan || '-')}</code>` },
            { label: 'Section', render: (row) => escapeHtml(row.section) },
            { label: 'Base Amount (₹)', align: 'right', render: (row) => formatCurrencyINR(row.baseAmount) },
            { label: 'Rate', align: 'right', render: (row) => `${row.tdsRate}%` },
            { label: 'TDS Deducted (₹)', align: 'right', render: (row) => formatCurrencyINR(row.tdsAmount) },
            { label: 'Deposit Status', render: (row) => formatStatus(row.depositStatus) },
            { label: 'Challan / Ref', render: (row) => escapeHtml(row.challanNumber || '-') }
          ],
          emptyTitle: 'No TDS deductions',
          emptyMessage: 'No commissions subject to TDS found.'
        })}
        
        <h3 class="ca-section-title">Reconciliation Statement: Bank Balances</h3>
        ${renderTable({
          rows: calculateDetailedBalanceSheet(state).bankDetails,
          columns: [
            { label: 'Bank Name', render: (row) => `<strong>${escapeHtml(row.bankName)}</strong>` },
            { label: 'Account Number', render: (row) => escapeHtml(row.accountNumber) },
            { label: 'Running Balance (₹)', align: 'right', render: (row) => formatCurrencyINR(row.balance) }
          ],
          emptyTitle: 'No bank accounts',
          emptyMessage: 'No bank accounts linked in database.'
        })}
      </div>
    `;
  }

  if (active === 'ledger') {
    return renderTable({
      rows: calculateLedgerSummary(state).map(({ client, summary }) => ({ id: client.id, client, summary })),
      columns: [
        { label: 'Client', render: (row) => escapeHtml(row.client.companyName || row.client.name) },
        { label: 'Invoices', render: (row) => formatCurrencyINR(row.summary.totalInvoiceAmount) },
        { label: 'Received', render: (row) => formatCurrencyINR(row.summary.totalReceived) },
        { label: 'Due', render: (row) => formatCurrencyINR(row.summary.totalDue) },
        { label: 'Profit', render: (row) => formatCurrencyINR(row.summary.totalProfitLoss) }
      ],
      emptyTitle: 'No ledger rows',
      emptyMessage: 'Add clients and invoices to generate ledger summaries.'
    });
  }

  if (active === 'sales') {
    return renderTable({
      rows: state.invoices,
      columns: [
        { label: 'Invoice No', render: (invoice) => escapeHtml(invoice.invoiceNumber) },
        { label: 'Client', render: (invoice) => escapeHtml(findById(state.clients, invoice.clientId)?.companyName || '-') },
        { label: 'Date', render: (invoice) => formatDate(invoice.invoiceDate) },
        { label: 'Status', render: (invoice) => formatStatus(invoice.status) }
      ]
    });
  }

  if (active === 'project-profit') {
    return renderTable({
      rows: calculatePortfolioProfitability(state),
      columns: [
        { label: 'Project', render: (row) => escapeHtml(row.project.title) },
        { label: 'Client', render: (row) => escapeHtml(findById(state.clients, row.project.clientId)?.companyName || '-') },
        { label: 'Revenue', render: (row) => formatCurrencyINR(row.summary.salesTaxableValue) },
        { label: 'Outsource', render: (row) => formatCurrencyINR(row.summary.outsourcingBaseCost) },
        { label: 'Commission', render: (row) => formatCurrencyINR(row.summary.commissionBaseCost) },
        { label: 'Other', render: (row) => formatCurrencyINR(row.summary.otherBaseExpenses) },
        { label: 'Profit', render: (row) => `${formatCurrencyINR(row.summary.grossProfit)} (${row.summary.profitPercent}%)` }
      ],
      emptyTitle: 'No project profitability',
      emptyMessage: 'Add invoices and costs to calculate project profit.'
    });
  }

  if (active === 'vendor-expenses') {
    return renderTable({
      rows: state.outsourcingExpenses || [],
      columns: [
        { label: 'Date', render: (expense) => formatDate(expense.expenseDate) },
        { label: 'Vendor', render: (expense) => escapeHtml(findById(state.masters?.vendors || [], expense.vendorId)?.name || expense.vendorName || '-') },
        { label: 'Project', render: (expense) => escapeHtml(findById(state.projects, expense.projectId)?.title || '-') },
        { label: 'Base', render: (expense) => formatCurrencyINR(calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings).baseAmount) },
        { label: 'GST', render: (expense) => formatCurrencyINR(calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings).gstAmount) },
        { label: 'Total', render: (expense) => formatCurrencyINR(calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings).totalAmount) },
        { label: 'Status', render: (expense) => formatStatus(expense.paymentStatus || 'Pending') }
      ],
      emptyTitle: 'No outsourcing expenses',
      emptyMessage: 'Add outsourcing expenses to see vendor-wise reports.'
    });
  }

  if (active === 'commissions') {
    return renderTable({
      rows: state.leadCommissions || [],
      columns: [
        { label: 'Partner', render: (commission) => escapeHtml(findById(state.masters?.vendors || [], commission.partnerId)?.name || commission.partnerName || '-') },
        { label: 'Project', render: (commission) => escapeHtml(findById(state.projects, commission.projectId)?.title || '-') },
        { label: 'Base', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).commissionBaseAmount) },
        { label: 'Commission', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).commissionAmount) },
        { label: 'GST', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).gstAmount) },
        { label: 'TDS', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).tdsAmount) },
        { label: 'Net Payable', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).netPayable) },
        { label: 'Status', render: (commission) => formatStatus(commission.paymentStatus || 'Pending') }
      ],
      emptyTitle: 'No commissions',
      emptyMessage: 'Add lead commissions to see referral reports.'
    });
  }

  if (active === 'itc') {
    return renderTable({
      rows: collectItcRows(state),
      columns: [
        { label: 'Vendor', render: (row) => escapeHtml(row.vendorName) },
        { label: 'GSTIN', render: (row) => escapeHtml(row.gstin || '-') },
        { label: 'Invoice', render: (row) => escapeHtml(row.invoiceNumber || '-') },
        { label: 'Date', render: (row) => formatDate(row.invoiceDate) },
        { label: 'Taxable', render: (row) => formatCurrencyINR(row.taxableValue) },
        { label: 'CGST', render: (row) => formatCurrencyINR(row.cgst) },
        { label: 'SGST', render: (row) => formatCurrencyINR(row.sgst) },
        { label: 'IGST', render: (row) => formatCurrencyINR(row.igst) },
        { label: 'Total GST', render: (row) => formatCurrencyINR(row.totalGst) }
      ],
      emptyTitle: 'No ITC entries',
      emptyMessage: 'GST registered vendor/commission invoices create ITC rows.'
    });
  }

  if (active === 'tds') {
    return renderTable({
      rows: collectTdsRows(state),
      columns: [
        { label: 'Vendor', render: (row) => escapeHtml(row.vendorName) },
        { label: 'PAN', render: (row) => escapeHtml(row.pan || '-') },
        { label: 'Section', render: (row) => escapeHtml(row.section) },
        { label: 'Base', render: (row) => formatCurrencyINR(row.baseAmount) },
        { label: 'Rate', render: (row) => `${row.tdsRate}%` },
        { label: 'TDS', render: (row) => formatCurrencyINR(row.tdsAmount) },
        { label: 'Deposit', render: (row) => escapeHtml(row.depositStatus) },
        { label: 'Challan', render: (row) => escapeHtml(row.challanNumber || '-') }
      ],
      emptyTitle: 'No TDS rows',
      emptyMessage: 'TDS rows appear from applicable lead commissions.'
    });
  }

  if (active === 'pending') {
    const pending = getPendingVendorPayables(state);
    const rows = [
      ...pending.outsource.map((item) => ({ ...item, type: 'Outsourcing', amount: calculateOutsourcingExpense(item, findById(state.masters?.vendors || [], item.vendorId), state.settings).totalAmount, vendorName: findById(state.masters?.vendors || [], item.vendorId)?.name || item.vendorName })),
      ...pending.commissions.map((item) => ({ ...item, type: 'Commission', amount: calculateLeadCommission(item, findById(state.masters?.vendors || [], item.partnerId), state.settings).netPayable, vendorName: findById(state.masters?.vendors || [], item.partnerId)?.name || item.partnerName }))
    ];
    return renderTable({
      rows,
      columns: [
        { label: 'Type', render: (row) => escapeHtml(row.type) },
        { label: 'Vendor', render: (row) => escapeHtml(row.vendorName || '-') },
        { label: 'Project', render: (row) => escapeHtml(findById(state.projects, row.projectId)?.title || '-') },
        { label: 'Amount', render: (row) => formatCurrencyINR(row.amount) },
        { label: 'Status', render: (row) => formatStatus(row.paymentStatus || 'Pending') }
      ],
      emptyTitle: 'No pending vendor payables',
      emptyMessage: 'Pending outsourcing and commission payables appear here.'
    });
  }

  if (active === 'expenses') {
    return renderTable({
      rows: state.expenses,
      columns: [
        { label: 'Date', render: (expense) => formatDate(expense.expenseDate) },
        { label: 'Vendor', render: (expense) => escapeHtml(expense.vendor) },
        { label: 'Before GST', render: (expense) => formatCurrencyINR(expense.amountBeforeGst) },
        { label: 'GST', render: (expense) => formatCurrencyINR(expense.gstAmount) },
        { label: 'Total', render: (expense) => formatCurrencyINR(expense.totalAmount) }
      ]
    });
  }

  if (active === 'clients') {
    return renderTable({
      rows: state.clients,
      columns: [
        { label: 'Client', render: (client) => escapeHtml(client.companyName || client.name) },
        { label: 'State', render: (client) => escapeHtml(client.state) },
        { label: 'GSTIN', render: (client) => escapeHtml(client.gstin || '-') },
        { label: 'Status', render: (client) => formatStatus(client.status) }
      ]
    });
  }

  if (active === 'projects') {
    return renderTable({
      rows: state.projects.map((project) => ({ ...project, summary: calculateProjectSummary(project.id, state) })),
      columns: [
        { label: 'Project', render: (project) => escapeHtml(project.title) },
        { label: 'Client', render: (project) => escapeHtml(findById(state.clients, project.clientId)?.companyName || '-') },
        { label: 'Revenue', render: (project) => formatCurrencyINR(project.summary.taxableRevenue) },
        { label: 'Expense', render: (project) => formatCurrencyINR(project.summary.expenseAmount) },
        { label: 'Profit', render: (project) => formatCurrencyINR(project.summary.profit) }
      ]
    });
  }

  if (active === 'payments') {
    return renderTable({
      rows: state.payments,
      columns: [
        { label: 'Date', render: (payment) => formatDate(payment.paymentDate) },
        { label: 'Client', render: (payment) => escapeHtml(findById(state.clients, payment.clientId)?.companyName || '-') },
        { label: 'Amount', render: (payment) => formatCurrencyINR(payment.amountReceived) },
        { label: 'Mode', render: (payment) => escapeHtml(payment.paymentMode) }
      ]
    });
  }

  if (active === 'renewals') {
    return renderTable({
      rows: state.renewals,
      columns: [
        { label: 'Renewal', render: (renewal) => escapeHtml(getRenewalTitle(renewal)) },
        { label: 'Provider', render: (renewal) => escapeHtml(getRenewalProvider(renewal)) },
        { label: 'Renewal Date', render: (renewal) => formatDate(getRenewalDate(renewal)) },
        { label: 'Cost', render: (renewal) => formatCurrencyINR(getRenewalAmount(renewal)) },
        { label: 'Status', render: (renewal) => formatStatus(getComputedRenewalStatus(renewal)) }
      ]
    });
  }

  if (active === 'amc') {
    return renderTable({
      rows: state.amcs,
      columns: [
        { label: 'AMC Type', render: (amc) => escapeHtml(amc.amcType) },
        { label: 'Client', render: (amc) => escapeHtml(findById(state.clients, amc.clientId)?.companyName || '-') },
        { label: 'End Date', render: (amc) => formatDate(amc.endDate) },
        { label: 'Amount', render: (amc) => formatCurrencyINR(amc.amcAmount) },
        { label: 'Status', render: (amc) => formatStatus(amc.status) }
      ]
    });
  }

  const gst = calculateGstSummary(state);
  return summaryGrid([
    { label: 'Output GST', value: formatCurrencyINR(gst.outputGst), meta: 'GST collected on sales' },
    { label: 'Input GST', value: formatCurrencyINR(gst.inputGst), meta: 'ITC eligible GST on expenses' },
    { label: 'Net GST Payable', value: formatCurrencyINR(gst.netGstPayable), tone: gst.netGstPayable >= 0 ? 'warning' : 'success' },
    { label: 'CGST Output', value: formatCurrencyINR(gst.cgst) },
    { label: 'SGST Output', value: formatCurrencyINR(gst.sgst) },
    { label: 'UTGST Output', value: formatCurrencyINR(gst.utgst) },
    { label: 'IGST Output', value: formatCurrencyINR(gst.igst) }
  ]);
}

function renderSalesExpenseChart(trends) {
  const maxVal = Math.max(...trends.map(t => Math.max(t.sales, t.expenses)), 10000);
  const roundedMax = Math.ceil(maxVal / 5000) * 5000;
  
  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const y = 240 - (i * 50);
    const val = (roundedMax / 4) * i;
    gridLines += `
      <line class="chart-grid-line" x1="55" y1="${y}" x2="580" y2="${y}"></line>
      <text class="chart-label" x="45" y="${y + 3}" text-anchor="end">₹${(val/1000).toFixed(0)}k</text>
    `;
  }
  
  let bars = '';
  let xLabels = '';
  const colWidth = 525 / 6;
  
  trends.forEach((t, i) => {
    const centerX = 55 + i * colWidth + colWidth / 2;
    const salesHeight = (t.sales / roundedMax) * 200;
    const expenseHeight = (t.expenses / roundedMax) * 200;
    
    const salesX = centerX - 20;
    const salesY = 240 - salesHeight;
    const expX = centerX + 2;
    const expY = 240 - expenseHeight;
    
    bars += `
      <rect class="chart-bar-sales" x="${salesX}" y="${salesY}" width="18" height="${salesHeight}">
        <title>Sales: ${formatCurrencyINR(t.sales)}</title>
      </rect>
      <rect class="chart-bar-expense" x="${expX}" y="${expY}" width="18" height="${expenseHeight}">
        <title>Expense: ${formatCurrencyINR(t.expenses)}</title>
      </rect>
    `;
    
    xLabels += `
      <text class="chart-label" x="${centerX}" y="260" text-anchor="middle">${t.monthLabel}</text>
    `;
  });
  
  return `
    <svg class="chart-svg" viewBox="0 0 600 280">
      ${gridLines}
      <line class="chart-axis-line" x1="55" y1="240" x2="580" y2="240"></line>
      ${bars}
      ${xLabels}
    </svg>
  `;
}

function renderCashFlowChart(trends) {
  const cashValues = trends.map(t => t.cumulativeCash);
  const minCash = Math.min(...cashValues, 0);
  const maxCash = Math.max(...cashValues, 10000);
  const roundedMax = Math.ceil(maxCash / 10000) * 10000;
  const roundedMin = Math.floor(minCash / 10000) * 10000;
  const absoluteRange = roundedMax - roundedMin || 10000;

  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const y = 240 - (i * 50);
    const val = roundedMin + (absoluteRange / 4) * i;
    gridLines += `
      <line class="chart-grid-line" x1="55" y1="${y}" x2="580" y2="${y}"></line>
      <text class="chart-label" x="45" y="${y + 3}" text-anchor="end">₹${(val/1000).toFixed(0)}k</text>
    `;
  }

  const colWidth = 525 / 6;
  let points = [];
  let dots = '';
  let xLabels = '';

  trends.forEach((t, i) => {
    const centerX = 55 + i * colWidth + colWidth / 2;
    const y = 240 - ((t.cumulativeCash - roundedMin) / absoluteRange) * 200;
    points.push({ x: centerX, y });
    
    dots += `
      <circle class="chart-dot" cx="${centerX}" cy="${y}" r="4.5">
        <title>Cash Balance: ${formatCurrencyINR(t.cumulativeCash)}</title>
      </circle>
    `;
    
    xLabels += `
      <text class="chart-label" x="${centerX}" y="260" text-anchor="middle">${t.monthLabel}</text>
    `;
  });

  const pathD = points.length ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') : '';
  const areaD = points.length ? `${pathD} L ${points[points.length - 1].x} 240 L ${points[0].x} 240 Z` : '';

  return `
    <svg class="chart-svg" viewBox="0 0 600 280">
      <defs>
        <linearGradient id="chart-line-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <line class="chart-axis-line" x1="55" y1="240" x2="580" y2="240"></line>
      ${points.length ? `<path class="chart-area" d="${areaD}"></path>` : ''}
      ${points.length ? `<path class="chart-line" d="${pathD}"></path>` : ''}
      ${dots}
      ${xLabels}
    </svg>
  `;
}

function renderExpenseDonutChart(categories) {
  const total = sumBy(categories, (c) => c.amount);
  if (total <= 0) {
    return `
      <div style="display: flex; align-items: center; justify-content: center; height: 180px; color: var(--color-muted); font-size: 13px;">
        No expense data recorded.
      </div>
    `;
  }

  const radius = 70;
  const circ = 2 * Math.PI * radius;
  let accumulatedPercent = 0;
  let circles = '';
  let legend = '';

  const colors = {
    outsourcing: '#3b82f6',
    commission: '#10b981',
    direct: '#f59e0b'
  };

  categories.forEach((cat) => {
    const percent = cat.amount / total;
    const dashArray = `${percent * circ} ${circ}`;
    const dashOffset = -accumulatedPercent * circ;
    accumulatedPercent += percent;

    const strokeColor = colors[cat.colorClass] || '#6366f1';

    circles += `
      <circle class="donut-segment" cx="120" cy="120" r="${radius}" stroke="${strokeColor}" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 120 120)">
        <title>${cat.name}: ${formatCurrencyINR(cat.amount)} (${(percent*100).toFixed(1)}%)</title>
      </circle>
    `;

    legend += `
      <div class="legend-item" style="margin-bottom: 6px;">
        <span class="legend-color ${cat.colorClass}" style="background: ${strokeColor}; display: inline-block;"></span>
        <span>${escapeHtml(cat.name)}: <strong>${formatCurrencyINR(cat.amount)}</strong></span>
      </div>
    `;
  });

  return `
    <div style="display: flex; align-items: center; gap: 48px; flex-wrap: wrap; justify-content: center; padding: 16px 0;">
      <div style="width: 200px; height: 200px;">
        <svg viewBox="0 0 240 240" style="width:100%; height:100%;">
          ${circles}
          <g class="chart-center-text">
            <text x="120" y="115" class="title" text-anchor="middle" fill="var(--color-muted)" style="font-size: 10px; font-weight: 600;">TOTAL COST</text>
            <text x="120" y="136" class="value" text-anchor="middle" fill="var(--color-text)" style="font-size: 15px; font-weight: 800;">₹${(total/1000).toFixed(1)}k</text>
          </g>
        </svg>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px; min-width: 220px; justify-content: center;">
        ${legend}
      </div>
    </div>
  `;
}

import { summaryGrid } from '../components/cards.js';
import { renderTable } from '../components/table.js';
import { renderTabs } from '../components/tabs.js';
import { inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { addItem, deleteItem, getItem, getState, updateItem } from '../state.js';
import { calculateClientSummary } from '../utils/finance.js';
import { escapeHtml, findById, readForm, showToast, today, uid } from '../utils/helpers.js';
import { calculateLeadCommission, calculateOutsourcingExpense } from '../utils/outsourcingAccounting.js';
import { getComputedRenewalStatus, getRenewalAmount, getRenewalCategory, getRenewalDate, getRenewalProvider, getRenewalTimelineItems, getRenewalTitle } from '../utils/renewals.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';

const DETAIL_TABS = [
  'Overview',
  'Projects',
  'Invoices',
  'Payments',
  'Expenses',
  'AMC / Renewals',
  'Ledger',
  'Files',
  'Contacts'
];

const FILE_TYPES = ['Document', 'PDF', 'Image', 'Spreadsheet', 'Link', 'Other'];

export function renderClientDetail(params = {}) {
  const state = getState();
  const client = findById(state.clients, params.id);
  if (!client) return '<section class="page-section"><h2>Client not found</h2><a class="btn btn-secondary" href="#/clients">Back to Clients</a></section>';

  const activeTab = params.tab || 'overview';
  const summary = calculateClientSummary(client.id, state);
  const tabs = DETAIL_TABS.map((label) => ({
    key: label.toLowerCase().replaceAll(' / ', '-').replaceAll(' ', '-'),
    label,
    route: `#/clients/detail/${client.id}/${label.toLowerCase().replaceAll(' / ', '-').replaceAll(' ', '-')}`
  }));

  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>${escapeHtml(client.companyName || client.name)}</h2>
          <p>${escapeHtml(client.billingAddress || '')} ${escapeHtml(client.state || '')} ${escapeHtml(client.country || '')}</p>
        </div>
        <div class="button-row">
          <a class="btn btn-secondary" href="#/clients/edit/${client.id}">Edit Client</a>
          <a class="btn btn-primary" href="#/invoices/add?clientId=${client.id}">New Invoice</a>
        </div>
      </div>
      ${summaryGrid([
        { label: 'Total Projects', value: summary.totalProjects },
        { label: 'Active Projects', value: summary.activeProjects },
        { label: 'Completed Projects', value: summary.completedProjects },
        { label: 'Invoice Amount', value: formatCurrencyINR(summary.totalInvoiceAmount) },
        { label: 'Taxable Amount', value: formatCurrencyINR(summary.totalTaxableAmount) },
        { label: 'GST Charged', value: formatCurrencyINR(summary.totalGstCharged) },
        { label: 'Received', value: formatCurrencyINR(summary.totalReceived) },
        { label: 'Due', value: formatCurrencyINR(summary.totalDue) },
        { label: 'Expenses', value: formatCurrencyINR(summary.totalClientExpenses) },
        { label: 'Eligible ITC', value: formatCurrencyINR(summary.totalEligibleItc) },
        { label: 'Profit / Loss', value: formatCurrencyINR(summary.totalProfitLoss), tone: summary.totalProfitLoss >= 0 ? 'success' : 'danger' },
        { label: 'AMC Active / Expired', value: `${summary.amcActive} / ${summary.amcExpired}` },
        { label: 'Pending Renewals', value: summary.pendingRenewals }
      ])}
      ${renderTabs(tabs, activeTab)}
      <div class="tab-panel">${renderDetailTab(activeTab, client, state)}</div>
    </section>
  `;
}

export function bindClientDetail(params = {}) {
  const client = getItem('clients', params.id);
  if (!client) return;

  document.querySelector('[data-action="add-client-file"]')?.addEventListener('click', () => {
    openClientFileModal(client);
  });

  document.querySelectorAll('[data-action="edit-client-file"]').forEach((button) => {
    button.addEventListener('click', () => {
      const file = getItem('files', button.dataset.id);
      if (!file) return;
      openClientFileModal(client, file);
    });
  });

  document.querySelectorAll('[data-action="delete-client-file"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this file record?')) return;
      deleteItem('files', button.dataset.id);
      showToast('File deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
}

function renderDetailTab(tab, client, state) {
  const projects = state.projects.filter((item) => item.clientId === client.id);
  const invoices = state.invoices.filter((item) => item.clientId === client.id);
  const payments = state.payments.filter((item) => item.clientId === client.id);
  const expenses = state.expenses.filter((item) => item.clientId === client.id);
  const files = (state.files || []).filter((item) => item.clientId === client.id);
  const outsourcingExpenses = (state.outsourcingExpenses || []).filter((item) => item.clientId === client.id);
  const leadCommissions = (state.leadCommissions || []).filter((item) => item.clientId === client.id);
  const amcs = state.amcs.filter((item) => item.clientId === client.id);
  const renewals = state.renewals.filter((item) => item.clientId === client.id);

  if (tab === 'projects') {
    return renderTable({
      rows: projects,
      columns: [
        { label: 'Project', render: (project) => escapeHtml(project.title) },
        { label: 'Value', render: (project) => formatCurrencyINR(project.value) },
        { label: 'Deadline', render: (project) => formatDate(project.deadline) },
        { label: 'Status', render: (project) => formatStatus(project.status) }
      ],
      emptyTitle: 'No projects',
      emptyMessage: 'No projects linked to this client.'
    });
  }

  if (tab === 'invoices') {
    return renderTable({
      rows: invoices,
      columns: [
        { label: 'Invoice', render: (invoice) => `<a href="#/invoices/preview/${invoice.id}">${escapeHtml(invoice.invoiceNumber)}</a>` },
        { label: 'Date', render: (invoice) => formatDate(invoice.invoiceDate) },
        { label: 'Due', render: (invoice) => formatDate(invoice.dueDate) },
        { label: 'Status', render: (invoice) => formatStatus(invoice.status) }
      ],
      emptyTitle: 'No invoices',
      emptyMessage: 'No invoices linked to this client.'
    });
  }

  if (tab === 'payments') {
    return renderTable({
      rows: payments,
      columns: [
        { label: 'Date', render: (payment) => formatDate(payment.paymentDate) },
        { label: 'Amount', render: (payment) => formatCurrencyINR(payment.amountReceived) },
        { label: 'TDS', render: (payment) => formatCurrencyINR(payment.tdsDeducted) },
        { label: 'Mode', render: (payment) => escapeHtml(payment.paymentMode) }
      ],
      emptyTitle: 'No payments',
      emptyMessage: 'No payments recorded for this client.'
    });
  }

  if (tab === 'expenses') {
    return `
      <div class="renewal-client-stack">
        <section>
          <h3>Business Expenses</h3>
          ${renderTable({
            rows: expenses,
            columns: [
              { label: 'Date', render: (expense) => formatDate(expense.expenseDate) },
              { label: 'Vendor', render: (expense) => escapeHtml(expense.vendor) },
              { label: 'Amount', render: (expense) => formatCurrencyINR(expense.amountBeforeGst) },
              { label: 'ITC', render: (expense) => expense.itcEligible ? 'Eligible' : 'Not eligible' }
            ],
            emptyTitle: 'No expenses',
            emptyMessage: 'No expenses linked to this client.'
          })}
        </section>
        <section>
          <h3>Outsourcing</h3>
          ${renderTable({
            rows: outsourcingExpenses,
            columns: [
              { label: 'Date', render: (expense) => formatDate(expense.expenseDate) },
              { label: 'Vendor', render: (expense) => escapeHtml(findById(state.masters?.vendors || [], expense.vendorId)?.name || expense.vendorName || '-') },
              { label: 'Work', render: (expense) => escapeHtml(expense.workType || '-') },
              { label: 'Base', render: (expense) => formatCurrencyINR(calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings).baseAmount) },
              { label: 'Total', render: (expense) => formatCurrencyINR(calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings).totalAmount) }
            ],
            emptyTitle: 'No outsourcing',
            emptyMessage: 'No outsourcing expenses linked to this client.'
          })}
        </section>
        <section>
          <h3>Lead Commissions</h3>
          ${renderTable({
            rows: leadCommissions,
            columns: [
              { label: 'Partner', render: (commission) => escapeHtml(findById(state.masters?.vendors || [], commission.partnerId)?.name || commission.partnerName || '-') },
              { label: 'Commission', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).commissionAmount) },
              { label: 'GST', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).gstAmount) },
              { label: 'TDS', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).tdsAmount) },
              { label: 'Net', render: (commission) => formatCurrencyINR(calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings).netPayable) }
            ],
            emptyTitle: 'No commissions',
            emptyMessage: 'No lead commissions linked to this client.'
          })}
        </section>
      </div>
    `;
  }

  if (tab === 'amc-renewals') {
    const domains = renewals.filter((item) => getRenewalCategory(item) === 'Domain');
    const hosting = renewals.filter((item) => getRenewalCategory(item) === 'Hosting');
    const software = renewals.filter((item) => getRenewalCategory(item) === 'Software License');
    const timeline = getRenewalTimelineItems(client.id, state);
    return `
      <div class="renewal-client-stack">
        <section>
          <h3>Domains</h3>
          ${renderClientRenewalTable(domains, state)}
        </section>
        <section>
          <h3>Hosting</h3>
          ${renderClientRenewalTable(hosting, state)}
        </section>
        <section>
          <h3>Software Licenses</h3>
          ${renderClientRenewalTable(software, state)}
        </section>
        <section>
          <h3>AMC</h3>
          ${renderTable({
          rows: amcs,
          columns: [
            { label: 'AMC Type', render: (amc) => escapeHtml(amc.amcType) },
            { label: 'Cycle', render: (amc) => escapeHtml(amc.billingCycle || '-') },
            { label: 'End Date', render: (amc) => formatDate(amc.endDate) },
            { label: 'Next Invoice', render: (amc) => formatDate(amc.nextInvoiceDate) },
            { label: 'Amount', render: (amc) => formatCurrencyINR(amc.amcAmount) },
            { label: 'Status', render: (amc) => formatStatus(amc.status) }
          ],
          emptyTitle: 'No AMC records',
          emptyMessage: 'No AMC linked to this client.'
          })}
        </section>
        <section>
          <h3>History Timeline</h3>
          ${renderRenewalTimeline(timeline)}
        </section>
      </div>
    `;
  }

  if (tab === 'ledger') {
    const summary = calculateClientSummary(client.id, state);
    return `
      <div class="metric-list wide">
        <p><span>Opening Balance</span><strong>${formatCurrencyINR(client.openingBalance)}</strong></p>
        <p><span>Total Invoice Amount</span><strong>${formatCurrencyINR(summary.totalInvoiceAmount)}</strong></p>
        <p><span>Total Received</span><strong>${formatCurrencyINR(summary.totalReceived)}</strong></p>
        <p><span>Total Due</span><strong>${formatCurrencyINR(summary.totalDue)}</strong></p>
        <p><span>Total Client Expenses</span><strong>${formatCurrencyINR(summary.totalClientExpenses)}</strong></p>
        <p><span>Eligible ITC</span><strong>${formatCurrencyINR(summary.totalEligibleItc)}</strong></p>
        <p><span>Profit / Loss</span><strong>${formatCurrencyINR(summary.totalProfitLoss)}</strong></p>
      </div>
    `;
  }

  if (tab === 'files' || tab === 'documents') {
    return renderClientFilesTab(client, files, state);
  }

  if (tab === 'contacts') {
    return `
      <div class="metric-list wide">
        <p><span>Contact Person</span><strong>${escapeHtml(client.contactPerson || client.name)}</strong></p>
        <p><span>Mobile</span><strong>${escapeHtml(client.mobile || '-')}</strong></p>
        <p><span>Email</span><strong>${escapeHtml(client.email || '-')}</strong></p>
        <p><span>GST Registration Type</span><strong>${escapeHtml(client.gstRegistrationType || '-')}</strong></p>
        <p><span>State Code</span><strong>${escapeHtml(client.stateCode || '-')}</strong></p>
        <p><span>Place of Supply</span><strong>${escapeHtml(client.placeOfSupply || '-')}</strong></p>
        <p><span>GSTIN</span><strong>${escapeHtml(client.gstin || '-')}</strong></p>
      </div>
    `;
  }

  return `
    <div class="metric-list wide">
      <p><span>Client Type</span><strong>${escapeHtml(client.clientType)}</strong></p>
      <p><span>Status</span><strong>${escapeHtml(client.status)}</strong></p>
      <p><span>Currency</span><strong>${escapeHtml(client.currency)}</strong></p>
      <p><span>PAN</span><strong>${escapeHtml(client.pan || '-')}</strong></p>
      <p><span>Notes</span><strong>${escapeHtml(client.notes || '-')}</strong></p>
    </div>
  `;
}

function renderClientFilesTab(client, files, state) {
  const rows = [...files].sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));

  return `
    <div class="renewal-client-stack">
      <section>
        <div class="section-toolbar compact">
          <div>
            <h3>Files</h3>
            <p>Store shared documents, reference links, and uploads for this client.</p>
          </div>
          <button class="btn btn-primary" type="button" data-action="add-client-file" data-client-id="${escapeHtml(client.id)}">Add File</button>
        </div>
        ${renderTable({
          rows,
          columns: [
            { label: 'File', render: (file) => `<strong>${escapeHtml(file.title)}</strong><small>${escapeHtml(file.fileType || 'Document')}</small>` },
            { label: 'Project', render: (file) => escapeHtml(findById(state.projects, file.projectId)?.title || '-') },
            { label: 'Uploaded', render: (file) => formatDate(file.uploadedAt) },
            { label: 'Link', render: (file) => fileLinkMarkup(file.fileUrl) }
          ],
          rowActions: [
            { label: 'Edit', action: 'edit-client-file', icon: 'Edit' },
            { label: 'Delete', action: 'delete-client-file', icon: 'Del', className: 'danger' }
          ],
          emptyTitle: 'No files',
          emptyMessage: 'Add the first file for this client.'
        })}
      </section>
    </div>
  `;
}

function openClientFileModal(client, file = {}) {
  openModal({
    title: file.id ? 'Edit File' : 'Add File',
    body: renderClientFileForm(client, file)
  });
  bindClientFileForm(client, file.id || '');
}

function renderClientFileForm(client, file = {}) {
  const state = getState();
  const clientProjects = state.projects.filter((project) => project.clientId === client.id);

  return `
    <form id="clientFileForm" class="form-grid">
      <input type="hidden" name="clientId" value="${escapeHtml(client.id)}">
      <h3 class="form-section-title">File Details</h3>
      ${inputField({ label: 'File Name', name: 'title', value: file.title || '', required: true, className: 'span-6' })}
      ${selectField({ label: 'File Type', name: 'fileType', options: FILE_TYPES, value: file.fileType || 'Document', className: 'span-6' })}
      ${inputField({ label: 'File URL / Reference', name: 'fileUrl', value: file.fileUrl || '', required: true, className: 'span-12' })}
      ${selectField({ label: 'Project (Optional)', name: 'projectId', options: clientProjects.map((project) => ({ id: project.id, name: project.title })), value: file.projectId || '', className: 'span-6' })}
      ${inputField({ label: 'Uploaded On', name: 'uploadedAt', value: file.uploadedAt || today(), type: 'date', className: 'span-6' })}
      ${textareaField({ label: 'Notes', name: 'notes', value: file.notes || '', rows: 2, className: 'span-12' })}
      ${formActions(file.id ? 'Update File' : 'Save File')}
    </form>
  `;
}

function bindClientFileForm(client, existingId = '') {
  const form = document.getElementById('clientFileForm');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = readForm(form);
    if (!data.title || !data.fileUrl) {
      window.alert('File name and file URL are required.');
      return;
    }

    const record = normalizeClientFile(data, client.id, existingId);
    if (existingId) {
      updateItem('files', existingId, record);
      showToast('File updated.');
    } else {
      addItem('files', record);
      showToast('File added.');
    }

    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function normalizeClientFile(data, clientId, existingId = '') {
  return {
    id: existingId || uid('file'),
    clientId,
    projectId: data.projectId || '',
    title: data.title,
    fileType: data.fileType || 'Document',
    fileUrl: data.fileUrl,
    uploadedAt: data.uploadedAt || today(),
    notes: data.notes || ''
  };
}

function fileLinkMarkup(fileUrl) {
  if (!fileUrl) return '-';
  const safeUrl = isSafeFileUrl(fileUrl) ? fileUrl : '#';
  return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">Open File</a>`;
}

function isSafeFileUrl(value) {
  return /^(https?:|mailto:|tel:|\/)/i.test(String(value || '').trim());
}

function renderClientRenewalTable(rows, state) {
  return renderTable({
    rows,
    columns: [
      { label: 'Name', render: (record) => escapeHtml(getRenewalTitle(record)) },
      { label: 'Project', render: (record) => escapeHtml(findById(state.projects, record.projectId)?.title || '-') },
      { label: 'Provider', render: (record) => escapeHtml(getRenewalProvider(record)) },
      { label: 'Renewal Date', render: (record) => formatDate(getRenewalDate(record)) },
      { label: 'Cost', render: (record) => formatCurrencyINR(getRenewalAmount(record)) },
      { label: 'Status', render: (record) => formatStatus(getComputedRenewalStatus(record)) }
    ],
    emptyTitle: 'No records',
    emptyMessage: 'No renewal records linked to this client.'
  });
}

function renderRenewalTimeline(items = []) {
  if (!items.length) {
    return '<div class="empty-state"><h3>No timeline</h3><p>Renewal history appears here after records are added.</p></div>';
  }

  return `
    <div class="timeline">
      ${items.map((item) => `
        <article class="timeline-item">
          <time>${formatDate(item.date)}</time>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.detail || '-')}</p>
            <small>${formatCurrencyINR(item.amount || 0)}</small>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

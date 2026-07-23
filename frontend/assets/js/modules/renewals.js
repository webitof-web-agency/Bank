import { renderTable } from '../components/table.js';
import { checkboxField, inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { summaryGrid } from '../components/cards.js';
import { renderTabs } from '../components/tabs.js';
import { closeModal, openModal } from '../components/modal.js';
import { RENEWAL_FINANCE_ACTIONS, RENEWAL_STATUSES, SOFTWARE_LICENSE_SCOPES } from '../constants.js';
import { deleteItem, getItem, getState, setState } from '../state.js';
import { calculateInvoiceTotals } from '../utils/finance.js';
import { getPlaceOfSupplyForClient } from '../utils/gst.js';
import { generateInvoiceNumber, getNextInvoiceSequence } from '../utils/invoiceNumber.js';
import { addYears, daysUntil, getComputedRenewalStatus, getRenewalAmount, getRenewalCategory, getRenewalDashboard, getRenewalDate, getRenewalProvider, getRenewalTitle } from '../utils/renewals.js';
import { escapeHtml, findById, optionList, readForm, round2, showToast, toNumber, today, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';

const RENEWAL_TABS = [
  { key: 'dashboard', label: 'Dashboard', route: '#/renewals/dashboard' },
  { key: 'domains', label: 'Domains', route: '#/renewals/domains' },
  { key: 'hosting', label: 'Hosting', route: '#/renewals/hosting' },
  { key: 'software', label: 'Software Licenses', route: '#/renewals/software' },
  { key: 'calendar', label: 'Renewal Calendar', route: '#/renewals/calendar' }
];

export function renderRenewals(params = {}) {
  const section = params.section || 'dashboard';
  return `
    <section class="page-section wide">
      <div class="section-toolbar">
        <div>
          <h2>Renewals</h2>
          <p>Domains, hosting, software licenses, AMC billing, and renewal calendar.</p>
        </div>
        <a class="btn btn-secondary" href="#/amc">Open AMC</a>
      </div>
      ${renderTabs(RENEWAL_TABS, section)}
      ${renderRenewalSection(section)}
    </section>
  `;
}

export function bindRenewals(params = {}) {
  const section = params.section || 'dashboard';

  document.querySelector('[data-action="add-renewal"]')?.addEventListener('click', () => {
    openRenewalModal(categoryForSection(section), section);
  });

  document.querySelectorAll('[data-action="edit-renewal"]').forEach((button) => {
    button.addEventListener('click', () => {
      const record = getItem('renewals', button.dataset.id);
      if (!record) return;
      openRenewalModal(getRenewalCategory(record), sectionForRecord(record), record);
    });
  });
  document.querySelectorAll('[data-action="delete-renewal"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this renewal record?')) return;
      deleteItem('renewals', button.dataset.id);
      showToast('Renewal deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
}

function renderRenewalSection(section) {
  const state = getState();
  if (section === 'domains') return renderCategoryCrud('Domain', state);
  if (section === 'hosting') return renderCategoryCrud('Hosting', state);
  if (section === 'software') return renderCategoryCrud('Software License', state);
  if (section === 'calendar') return renderRenewalCalendar(state);
  return renderRenewalDashboard(state);
}

function renderRenewalDashboard(state) {
  const dashboard = getRenewalDashboard(state);
  return `
    ${summaryGrid([
      { label: 'Expired', value: dashboard.expired.length, tone: dashboard.expired.length ? 'danger' : 'success' },
      { label: 'Next 30 Days', value: dashboard.nearby.length, tone: dashboard.nearby.length ? 'warning' : 'success' },
      { label: 'Future Renewals', value: dashboard.future.length },
      { label: 'Total Renewal Records', value: dashboard.rows.length }
    ])}
    <section class="page-section">
      <div class="section-toolbar compact">
        <div>
          <h3>Expired Renewals</h3>
          <p>These stay visible until the renewal date is updated to a future date.</p>
        </div>
      </div>
      ${renderRenewalTable(dashboard.expired, state, false)}
    </section>
    <section class="page-section">
      <div class="section-toolbar compact">
        <div>
          <h3>Nearby Renewals</h3>
          <p>Renewals due within the next 30 days.</p>
        </div>
      </div>
      ${renderRenewalTable(dashboard.nearby, state, false)}
    </section>
  `;
}

function renderCategoryCrud(category, state) {
  const rows = (state.renewals || []).filter((item) => getRenewalCategory(item) === category);
  const title = category === 'Software License' ? 'Software Licenses' : `${category} Renewals`;

  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(title)} linked with clients, projects, providers, pricing, and renewal dates.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-renewal">Add ${escapeHtml(category)}</button>
      </div>
      ${renderRenewalTable(rows, state)}
    </section>
  `;
}

function renderRenewalForm(category, record = {}, state, editId = '') {
  const providerOptions = getProviderOptions(state, category);
  const commonFields = `
    <h3 class="form-section-title">Client & Provider</h3>
    <div class="field span-6">
      <select name="clientId" id="f-clientId">
        <option value="" disabled hidden ${record.clientId ? '' : 'selected'}>Select Client</option>
        ${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })), record.clientId)}
      </select>
      <label for="f-clientId">Client</label>
    </div>
    <div class="field span-6">
      <select name="projectId" id="f-projectId">
        <option value="" disabled hidden ${record.projectId ? '' : 'selected'}>Select Project</option>
        ${optionList(state.projects.map((project) => ({ id: project.id, name: project.title })), record.projectId)}
      </select>
      <label for="f-projectId">Project</label>
    </div>
    ${selectField({ label: 'Provider', name: 'provider', options: providerOptions, value: record.provider || providerOptions[0] || '', className: 'span-12' })}
    
    <h3 class="form-section-title">Timeline & Cost</h3>
    ${inputField({ label: 'Purchase Date', name: 'purchaseDate', value: record.purchaseDate || today(), type: 'date', className: 'span-4' })}
    ${inputField({ label: 'Years', name: 'durationYears', value: record.durationYears || 1, type: 'number', min: '1', className: 'span-4' })}
    ${inputField({ label: 'Renewal Date', name: 'renewalDate', value: getRenewalDate(record) || addYears(today(), 1), type: 'date', className: 'span-4' })}
    ${inputField({ label: 'Purchase Price', name: 'purchasePrice', value: record.purchasePrice ?? 0, type: 'number', step: '0.01', min: '0', className: 'span-6' })}
    ${inputField({ label: 'Renewal Price', name: 'renewalPrice', value: record.renewalPrice ?? record.renewalCost ?? 0, type: 'number', step: '0.01', min: '0', className: 'span-6' })}
    
    <h3 class="form-section-title">Compliance & Automation</h3>
    ${selectField({ label: 'Status', name: 'status', options: RENEWAL_STATUSES, value: record.status || 'Pending', className: 'span-4' })}
    ${checkboxField({ label: 'Auto Renewal Finance Entry', name: 'autoRenewal', checked: record.autoRenewal, className: 'span-4' })}
    ${selectField({ label: 'Finance Action', name: 'financeAction', options: RENEWAL_FINANCE_ACTIONS, value: record.financeAction || 'None', className: 'span-4' })}
    
    <h3 class="form-section-title">Additional Info</h3>
    ${textareaField({ label: 'Remarks', name: 'remarks', value: record.remarks || record.notes, rows: 2, className: 'span-12' })}
  `;

  if (category === 'Domain') {
    return `
      <form id="renewalForm" class="form-grid">
        <h3 class="form-section-title">Asset details</h3>
        ${inputField({ label: 'Domain Name', name: 'domainName', value: record.domainName || record.renewalType || '', required: true, className: 'span-12' })}
        ${commonFields}
        ${formActions(editId ? 'Update Domain' : 'Add Domain')}
      </form>
    `;
  }

  if (category === 'Hosting') {
    return `
      <form id="renewalForm" class="form-grid">
        <h3 class="form-section-title">Asset details</h3>
        ${inputField({ label: 'Hosting / Plan Name', name: 'hostingName', value: record.hostingName || record.renewalType || '', required: true, className: 'span-6' })}
        ${inputField({ label: 'Server / Package', name: 'packageName', value: record.packageName || '', className: 'span-6' })}
        ${commonFields}
        ${formActions(editId ? 'Update Hosting' : 'Add Hosting')}
      </form>
    `;
  }

  return `
    <form id="renewalForm" class="form-grid">
      <h3 class="form-section-title">Asset details</h3>
      ${inputField({ label: 'Software Name', name: 'softwareName', value: record.softwareName || '', required: true, className: 'span-6' })}
      ${selectField({ label: 'Use Type', name: 'licenseScope', options: SOFTWARE_LICENSE_SCOPES, value: record.licenseScope || 'Internal', className: 'span-2' })}
      ${inputField({ label: 'Seats / Users', name: 'seats', value: record.seats || 1, type: 'number', min: '1', className: 'span-2' })}
      ${inputField({ label: 'License Key / Account', name: 'licenseKey', value: record.licenseKey || '', className: 'span-2' })}
      ${commonFields}
      ${formActions(editId ? 'Update License' : 'Add License')}
    </form>
  `;
}

function openRenewalModal(category, section, record = {}) {
  const editId = record?.id || '';
  openModal({
    title: editId ? `Edit ${category}` : `Add ${category}`,
    body: renderRenewalForm(category, record, getState(), editId)
  });
  bindRenewalModalForm(category, section, editId);
}

function bindRenewalModalForm(category, section, editId = '') {
  const form = document.getElementById('renewalForm');
  if (!form) return;
  form.addEventListener('input', (event) => {
    if (event.target.name === 'renewalDate') event.target.dataset.userEdited = 'true';
    syncRenewalDate(form);
  });
  form.addEventListener('change', (event) => {
    if (event.target.name === 'renewalDate') event.target.dataset.userEdited = 'true';
    syncRenewalDate(form);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveRenewalRecord(form, section || sectionForCategory(category), editId);
  });
}

function renderRenewalTable(rows, state, showActions = true) {
  return renderTable({
    rows,
    columns: [
      { label: 'Type', render: (record) => escapeHtml(getRenewalCategory(record)) },
      { label: 'Name', render: (record) => `<strong>${escapeHtml(getRenewalTitle(record))}</strong><small>${escapeHtml(record.packageName || record.licenseScope || '')}</small>` },
      { label: 'Client', render: (record) => escapeHtml(findById(state.clients, record.clientId)?.companyName || '-') },
      { label: 'Project', render: (record) => escapeHtml(findById(state.projects, record.projectId)?.title || '-') },
      { label: 'Provider', render: (record) => escapeHtml(getRenewalProvider(record)) },
      { label: 'Renewal Date', render: (record) => `${formatDate(getRenewalDate(record))}<small>${formatDueText(record)}</small>` },
      { label: 'Renewal Price', render: (record) => formatCurrencyINR(getRenewalAmount(record)) },
      { label: 'Status', render: (record) => formatStatus(getComputedRenewalStatus(record)) }
    ],
    rowActions: showActions ? [
      { label: 'Edit', action: 'edit-renewal', icon: 'Edit' },
      { label: 'Delete', action: 'delete-renewal', icon: 'Del', className: 'danger' }
    ] : [],
    emptyTitle: 'No renewal records',
    emptyMessage: 'Add a domain, hosting plan, software license, or AMC record.'
  });
}

function renderRenewalCalendar(state) {
  const rows = getRenewalDashboard(state).rows;
  const grouped = rows.reduce((acc, record) => {
    const date = getRenewalDate(record);
    const key = date ? date.slice(0, 7) : 'No date';
    acc[key] = acc[key] || [];
    acc[key].push(record);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort();

  if (!months.length) {
    return '<div class="empty-state"><h3>No calendar records</h3><p>Add renewal records to populate the calendar.</p></div>';
  }

  return `
    <div class="renewal-calendar">
      ${months.map((month) => `
        <article class="panel">
          <h3>${escapeHtml(formatCalendarMonth(month))}</h3>
          <div class="metric-list">
            ${grouped[month].map((record) => `
              <p>
                <span>${escapeHtml(getRenewalCategory(record))}: ${escapeHtml(getRenewalTitle(record))}</span>
                <strong>${formatDate(getRenewalDate(record))}</strong>
              </p>
            `).join('')}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function saveRenewalRecord(form, section, editId = '') {
  const state = getState();
  const data = readForm(form);
  const category = categoryForSection(section);
  const record = normalizeRenewalRecord(data, category, editId);
  state.renewals = state.renewals || [];
  const existingRecord = editId ? findById(state.renewals, editId) : null;
  if (existingRecord?.financeEntryId) {
    record.financeEntryId = existingRecord.financeEntryId;
    record.financeEntryType = existingRecord.financeEntryType;
  }

  if (record.autoRenewal && record.financeAction !== 'None' && !record.financeEntryId) {
    const financeEntry = createSoftwareFinanceEntry(record, state);
    if (financeEntry) {
      record.financeEntryType = financeEntry.type;
      record.financeEntryId = financeEntry.id;
    }
  }

  if (editId) {
    state.renewals = state.renewals.map((item) => String(item.id) === String(editId) ? record : item);
    showToast(`${category} updated.`);
  } else {
    state.renewals.push(record);
    showToast(`${category} added.`);
  }

  setState(state);
  closeModal();
  window.location.hash = `#/renewals/${sectionForRecord(record)}`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function normalizeRenewalRecord(data, category, existingId = '') {
  const renewalDate = data.renewalDate || addYears(data.purchaseDate, data.durationYears);
  const base = {
    id: existingId || uid('renewal'),
    category,
    clientId: data.clientId,
    projectId: data.projectId,
    provider: data.provider,
    purchaseDate: data.purchaseDate,
    durationYears: toNumber(data.durationYears, 1),
    renewalDate,
    expiryDate: renewalDate,
    purchasePrice: toNumber(data.purchasePrice),
    renewalPrice: toNumber(data.renewalPrice),
    renewalCost: toNumber(data.renewalPrice),
    reminderDate: renewalDate,
    status: data.status || 'Pending',
    remarks: data.remarks
  };

  if (category === 'Domain') {
    return { ...base, domainName: data.domainName, renewalType: data.domainName || 'Domain' };
  }
  if (category === 'Hosting') {
    return { ...base, hostingName: data.hostingName, packageName: data.packageName, renewalType: data.hostingName || 'Hosting' };
  }

  return {
    ...base,
    softwareName: data.softwareName,
    renewalType: data.softwareName || 'Software License',
    licenseScope: data.licenseScope || 'Internal',
    seats: toNumber(data.seats, 1),
    licenseKey: data.licenseKey,
    autoRenewal: Boolean(data.autoRenewal),
    financeAction: data.financeAction || 'None'
  };
}

function createSoftwareFinanceEntry(record, state) {
  const amount = toNumber(record.renewalPrice || record.purchasePrice);
  if (amount <= 0) return null;
  const client = findById(state.clients, record.clientId);
  const date = record.purchaseDate || today();
  const name = record.softwareName || record.hostingName || record.domainName || 'Renewal Asset';
  const action = record.clientId ? record.financeAction : 'Create Expense';

  if (action === 'Create Invoice') {
    const sequence = getNextInvoiceSequence(state);
    const invoiceBase = {
      invoiceNumber: generateInvoiceNumber(state.settings, sequence, date),
      invoiceDate: date,
      dueDate: record.renewalDate,
      clientId: record.clientId,
      projectId: record.projectId,
      placeOfSupply: getPlaceOfSupplyForClient(client, state.settings),
      invoiceType: 'Regular',
      amountType: 'GST Extra'
    };
    const item = {
      id: uid('item'),
      serviceId: '',
      serviceName: `${record.category} - ${name}`,
      hsnSac: '998314',
      description: `Auto renewal billing for ${name}`,
      qty: 1,
      rate: amount,
      discount: 0,
      gstRate: toNumber(state.settings?.gst?.defaultRate, 18),
      isPureAgent: false
    };
    const totals = calculateInvoiceTotals(invoiceBase, [item], state.settings, client);
    const invoice = {
      id: uid('invoice'),
      ...invoiceBase,
      status: 'Sent',
      notes: `Auto-created from ${record.category.toLowerCase()} renewal: ${name}`,
      sourceRenewalId: record.id,
      items: totals.items
    };
    state.invoices.push(invoice);
    state.settings.invoice.nextSequence = sequence + 1;
    return { type: 'Invoice', id: invoice.id };
  }

  let expCat = 'exp-software';
  if (record.category === 'Domain') expCat = 'exp-marketing';
  const category = findById(state.masters?.expenseCategories || [], expCat)
    || (state.masters?.expenseCategories || []).find((item) => item.name.toLowerCase().includes('marketing') || item.name.toLowerCase().includes('subscription'))
    || (state.masters?.expenseCategories || [])[0]
    || {};
  const gstRate = toNumber(category.defaultGstRate, 18);
  const gstAmount = round2(amount * gstRate / 100);
  const expense = {
    id: uid('expense'),
    expenseDate: date,
    vendor: record.provider || name,
    categoryId: category.id || expCat,
    clientId: record.clientId || '',
    projectId: record.projectId || '',
    amountBeforeGst: amount,
    gstRate,
    gstAmount,
    totalAmount: round2(amount + gstAmount),
    invoiceNumber: `AUTO-${record.id}`,
    vendorGstin: '',
    paymentMode: 'Bank Transfer',
    bankAccountId: state.bankAccounts?.[0]?.id || '',
    itcEligible: category.itcEligible !== false,
    rcmApplicable: false,
    attachmentUrl: '',
    notes: `Auto-created from ${record.category.toLowerCase()} renewal: ${name}`,
    sourceRenewalId: record.id
  };
  state.expenses.push(expense);
  return { type: 'Expense', id: expense.id };
}

function getProviderOptions(state, category) {
  const providers = (state.masters?.renewalProviders || [])
    .filter((provider) => provider.isActive !== false)
    .filter((provider) => !provider.type || provider.type === category)
    .map((provider) => provider.name);
  if (providers.length) return providers;
  return (state.masters?.vendors || []).filter((vendor) => vendor.isActive !== false).map((vendor) => vendor.name);
}

function syncRenewalDate(form) {
  const purchaseDate = form.querySelector('[name="purchaseDate"]')?.value;
  const years = form.querySelector('[name="durationYears"]')?.value;
  const renewalDate = form.querySelector('[name="renewalDate"]');
  if (!purchaseDate || !years || !renewalDate || renewalDate.dataset.userEdited) return;
  renewalDate.value = addYears(purchaseDate, years);
}

function categoryForSection(section) {
  if (section === 'hosting') return 'Hosting';
  if (section === 'software') return 'Software License';
  return 'Domain';
}

function sectionForRecord(record = {}) {
  const category = getRenewalCategory(record);
  if (category === 'Hosting') return 'hosting';
  if (category === 'Software License') return 'software';
  return 'domains';
}

function sectionForCategory(category = '') {
  if (category === 'Hosting') return 'hosting';
  if (category === 'Software License') return 'software';
  return 'domains';
}

function formatDueText(record) {
  const remaining = daysUntil(getRenewalDate(record));
  if (remaining === null) return '';
  if (remaining < 0) return `${Math.abs(remaining)} days overdue`;
  if (remaining === 0) return 'Due today';
  return `${remaining} days left`;
}

function formatCalendarMonth(monthKey) {
  if (monthKey === 'No date') return monthKey;
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-01`));
}

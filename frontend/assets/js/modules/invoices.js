import { renderTable } from '../components/table.js';
import { inputField, selectField, textareaField, formActions, checkboxField } from '../components/formFields.js';
import { renderInvoicePreview } from '../components/invoicePreview.js';
import { closeModal, openModal } from '../components/modal.js';
import { AMOUNT_TYPES, INVOICE_STATUSES, INVOICE_TYPES } from '../constants.js';
import { INDIAN_STATES } from '../data/states.js';
import { addItem, deleteItem, getItem, getState, setState, updateItem } from '../state.js';
import { calculateInvoiceTotals, getInvoicePaidAmount } from '../utils/finance.js';
import { getDefaultInvoiceTypeForClient, getPlaceOfSupplyForClient } from '../utils/gst.js';
import { generateInvoiceNumber, getNextInvoiceSequence } from '../utils/invoiceNumber.js';
import { addDays, escapeHtml, findById, optionList, readForm, showToast, toNumber, today, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';
import { validateInvoice } from '../utils/validators.js';

export function renderInvoices(params = {}) {
  if (params.mode === 'preview') return renderInvoicePreview(getItem('invoices', params.id), getState());

  const state = getState();
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Invoices</h2>
          <p>Create GST-inclusive or GST-extra tax invoices with automatic CGST / SGST / IGST.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-invoice">Add Invoice</button>
      </div>
      ${renderTable({
        selectable: true,
        rows: state.invoices,
        columns: [
          { label: 'Invoice', render: (invoice) => `<a href="#/invoices/preview/${invoice.id}"><strong>${escapeHtml(invoice.invoiceNumber)}</strong></a><small>${escapeHtml(invoice.invoiceType)}</small>` },
          { label: 'Client', render: (invoice) => escapeHtml(findById(state.clients, invoice.clientId)?.companyName || '-') },
          { label: 'Project', render: (invoice) => escapeHtml(findById(state.projects, invoice.projectId)?.title || '-') },
          { label: 'Date', render: (invoice) => formatDate(invoice.invoiceDate) },
          { label: 'Total', align: 'right', render: (invoice) => {
            const client = findById(state.clients, invoice.clientId);
            return formatCurrencyINR(calculateInvoiceTotals(invoice, invoice.items || [], state.settings, client).totalAmount);
          } },
          { label: 'Paid', align: 'right', render: (invoice) => formatCurrencyINR(getInvoicePaidAmount(invoice.id, state)) },
          { label: 'Status', align: 'center', render: (invoice) => formatStatus(invoice.status) }
        ],
        rowActions: [
          { label: 'Preview', action: 'preview-invoice', icon: 'View' },
          { label: 'Edit', action: 'edit-invoice', icon: 'Edit' },
          { label: 'Delete', action: 'delete-invoice', icon: 'Del', className: 'danger' }
        ],
        emptyTitle: 'No invoices',
        emptyMessage: 'Create your first GST invoice.'
      })}
    </section>
  `;
}

export function bindInvoices(params = {}) {
  if (params.mode === 'add') openInvoiceModal('', params.query || {});
  if (params.mode === 'edit') openInvoiceModal(params.id);

  document.querySelector('[data-action="add-invoice"]')?.addEventListener('click', () => openInvoiceModal());

  document.querySelector('[data-action="print-invoice"]')?.addEventListener('click', () => window.print());
  document.querySelector('[data-action="download-pdf-placeholder"]')?.addEventListener('click', () => {
    window.alert('Use the browser print dialog and choose "Save as PDF". Backend PDF generation can be added later.');
  });

  document.querySelectorAll('[data-action="preview-invoice"]').forEach((button) => {
    button.addEventListener('click', () => { window.location.hash = `#/invoices/preview/${button.dataset.id}`; });
  });
  document.querySelectorAll('[data-action="edit-invoice"]').forEach((button) => {
    button.addEventListener('click', () => openInvoiceModal(button.dataset.id));
  });
  document.querySelectorAll('[data-action="delete-invoice"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this invoice?')) return;
      deleteItem('invoices', button.dataset.id);
      showToast('Invoice deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });

  // Bulk Actions Logic for Invoices
  let bulkBar = document.getElementById('bulkActionsBarInvoice');
  if (!bulkBar) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="bulkActionsBarInvoice" class="no-print" style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #0f172a; border: 1px solid rgba(255,255,255,0.08); padding: 12px 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-lg); display: none; align-items: center; gap: 16px; z-index: 70; color: #fff;">
        <span id="bulkCountInvoice" style="font-weight: 600; font-size: 13px;">0 items selected</span>
        <button class="btn btn-secondary" type="button" data-bulk-action="mark-paid" style="background: transparent; color: #fff; border-color: rgba(255,255,255,0.2); min-height: 30px; padding: 4px 10px; font-size: 12px;">Mark Paid</button>
        <button class="btn btn-danger" type="button" data-bulk-action="delete" style="min-height: 30px; padding: 4px 10px; font-size: 12px;">Delete Selected</button>
      </div>
    `);
    bulkBar = document.getElementById('bulkActionsBarInvoice');
    
    bulkBar.querySelector('[data-bulk-action="mark-paid"]').addEventListener('click', () => {
      const selectedIds = Array.from(document.querySelectorAll('.row-selector-chk:checked')).map(chk => chk.dataset.id);
      if (!selectedIds.length) return;
      selectedIds.forEach(id => {
        updateItem('invoices', id, { status: 'Paid' });
      });
      showToast(`Marked ${selectedIds.length} invoices as Paid.`);
      bulkBar.classList.remove('visible');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    
    bulkBar.querySelector('[data-bulk-action="delete"]').addEventListener('click', () => {
      const selectedIds = Array.from(document.querySelectorAll('.row-selector-chk:checked')).map(chk => chk.dataset.id);
      if (!selectedIds.length) return;
      if (!window.confirm(`Delete ${selectedIds.length} selected invoices?`)) return;
      selectedIds.forEach(id => {
        deleteItem('invoices', id);
      });
      showToast(`Deleted ${selectedIds.length} invoices.`);
      bulkBar.classList.remove('visible');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  }

  const updateBulkBar = () => {
    const checkedChks = document.querySelectorAll('.row-selector-chk:checked');
    const countSpan = document.getElementById('bulkCountInvoice');
    if (checkedChks.length > 0) {
      if (countSpan) countSpan.textContent = `${checkedChks.length} invoices selected`;
    }
    if (bulkBar) {
      bulkBar.classList.toggle('visible', checkedChks.length > 0);
    }
  };

  document.querySelector('[data-action="toggle-all-rows"]')?.addEventListener('change', (e) => {
    document.querySelectorAll('.row-selector-chk').forEach(chk => {
      chk.checked = e.target.checked;
    });
    updateBulkBar();
  });

  document.querySelectorAll('.row-selector-chk').forEach(chk => {
    chk.addEventListener('change', updateBulkBar);
  });

  updateBulkBar();
}

function renderInvoiceForm(id = '', query = {}) {
  const state = getState();
  const invoice = id ? getItem('invoices', id) : {};
  if (id && !invoice) return '<section class="page-section"><h2>Invoice not found</h2></section>';
  const sequence = getNextInvoiceSequence(state);
  const invoiceDate = invoice.invoiceDate || today();
  const invoiceNumber = invoice.invoiceNumber || generateInvoiceNumber(state.settings, sequence, invoiceDate);
  const defaultClientId = query?.clientId || invoice.clientId || '';
  const selectedClient = findById(state.clients, defaultClientId) || {};
  const initialPlaceOfSupply = invoice.placeOfSupply || getPlaceOfSupplyForClient(selectedClient, state.settings);
  const initialInvoiceType = invoice.invoiceType || getDefaultInvoiceTypeForClient(selectedClient, state.settings);
  const itemRows = invoice.items?.length ? invoice.items : [defaultInvoiceItem(state)];

  return `
      <form id="invoiceForm" class="stacked-form">
        <div class="form-grid">
          <h3 class="form-section-title">Invoice Details</h3>
          ${inputField({ label: 'Invoice Number', name: 'invoiceNumber', value: invoiceNumber, required: true, className: 'span-4' })}
          ${inputField({ label: 'Invoice Date', name: 'invoiceDate', value: invoiceDate, type: 'date', required: true, className: 'span-4' })}
          ${inputField({ label: 'Due Date', name: 'dueDate', value: invoice.dueDate || addDays(invoiceDate, state.settings.invoice.defaultDueDays), type: 'date', required: true, className: 'span-4' })}
          
          <h3 class="form-section-title">Client & Project</h3>
          <div class="field span-6">
            <select name="clientId" id="f-clientId" required>
              <option value="" disabled hidden ${defaultClientId ? '' : 'selected'}>Select Client</option>
              ${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })), defaultClientId)}
            </select>
            <label for="f-clientId">Client *</label>
          </div>
          <div class="field span-6">
            <select name="projectId" id="f-projectId">
              <option value="" disabled hidden ${invoice.projectId ? '' : 'selected'}>Select Project</option>
              ${optionList(state.projects.map((project) => ({ id: project.id, name: project.title })), invoice.projectId)}
            </select>
            <label for="f-projectId">Project</label>
          </div>
          
          <h3 class="form-section-title">GST & Tax Settings</h3>
          ${selectField({ label: 'Place of Supply', name: 'placeOfSupply', options: ['Outside India', ...INDIAN_STATES], value: initialPlaceOfSupply, className: 'span-4' })}
          ${selectField({ label: 'Invoice Type', name: 'invoiceType', options: INVOICE_TYPES, value: initialInvoiceType, className: 'span-4' })}
          ${selectField({ label: 'Amount Type', name: 'amountType', options: AMOUNT_TYPES, value: invoice.amountType || 'GST Extra', className: 'span-4' })}
          
          <h3 class="form-section-title">Status & Schedule</h3>
          ${selectField({ label: 'Status', name: 'status', options: INVOICE_STATUSES, value: invoice.status || 'Sent', className: 'span-4' })}
          ${checkboxField({ label: 'Make Recurring', name: 'isRecurring', checked: invoice.isRecurring, className: 'span-4' })}
          ${selectField({ label: 'Recurring Interval', name: 'recurringInterval', options: ['None', 'Monthly', 'Quarterly', 'Yearly'], value: invoice.recurringInterval || 'None', className: 'span-4' })}
          
          <h3 class="form-section-title">Notes</h3>
          ${textareaField({ label: 'Notes', name: 'notes', value: invoice.notes, rows: 2, className: 'span-12' })}
        </div>

        <section class="line-items">
          <div class="section-toolbar compact">
            <div>
              <h3>Invoice Items</h3>
              <p>Each row calculates taxable amount and GST based on invoice settings.</p>
            </div>
            <button class="btn btn-secondary" type="button" data-action="add-invoice-row">Add Item</button>
          </div>
          <div id="invoiceItems">
            ${itemRows.map((item) => renderInvoiceItemRow(item, state)).join('')}
          </div>
        </section>

        <div id="invoiceLiveTotals" class="invoice-live-totals"></div>
        ${formActions(id ? 'Update Invoice' : 'Save Invoice')}
      </form>
  `;
}

function openInvoiceModal(id = '', query = {}) {
  openModal({
    title: id ? 'Edit Invoice' : 'Add Invoice',
    body: renderInvoiceForm(id, query)
  });
  const form = document.getElementById('invoiceForm');
  if (form) bindInvoiceForm(form, { id });
}

function bindInvoiceForm(form, params) {
  const state = getState();
  const itemsRoot = document.getElementById('invoiceItems');

  form.querySelector('[data-action="add-invoice-row"]')?.addEventListener('click', () => {
    itemsRoot.insertAdjacentHTML('beforeend', renderInvoiceItemRow(defaultInvoiceItem(getState()), getState()));
    updateLiveTotals(form);
  });

  form.addEventListener('change', (event) => {
    const clientSelect = event.target.closest('[name="clientId"]');
    if (clientSelect) {
      applyClientTaxDefaults(form, findById(getState().clients, clientSelect.value));
    }

    const serviceSelect = event.target.closest('[data-field="serviceId"]');
    if (serviceSelect) {
      const service = findById(getState().masters.services, serviceSelect.value);
      const row = serviceSelect.closest('.invoice-item-row');
      if (service && row) {
        row.querySelector('[name="serviceName"]').value = service.name;
        row.querySelector('[name="hsnSac"]').value = service.sac;
        row.querySelector('[name="gstRate"]').value = service.gstRate;
        row.querySelector('[name="rate"]').value = service.defaultPrice;
        row.querySelector('[name="description"]').value = service.name;
      }
    }
    updateLiveTotals(form);
  });

  form.addEventListener('input', () => updateLiveTotals(form));
  form.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-action="remove-invoice-row"]');
    if (removeButton) {
      if (itemsRoot.children.length === 1) return;
      removeButton.closest('.invoice-item-row').remove();
      updateLiveTotals(form);
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const invoiceData = readForm(form);
    const items = collectInvoiceItems(form);
    const errors = validateInvoice(invoiceData, items);
    if (errors.length) {
      window.alert(errors.join('\n'));
      return;
    }

    const client = findById(state.clients, invoiceData.clientId);
    const invoiceType = state.settings.gst?.autoDetectTax !== false && invoiceData.invoiceType === 'Regular'
      ? getDefaultInvoiceTypeForClient(client, state.settings)
      : invoiceData.invoiceType;
    const placeOfSupply = invoiceData.placeOfSupply || getPlaceOfSupplyForClient(client, state.settings);
    const totals = calculateInvoiceTotals(invoiceData, items, state.settings, client);
    const invoice = {
      id: params.id || uid('invoice'),
      invoiceNumber: invoiceData.invoiceNumber,
      invoiceDate: invoiceData.invoiceDate,
      dueDate: invoiceData.dueDate,
      clientId: invoiceData.clientId,
      projectId: invoiceData.projectId,
      placeOfSupply,
      invoiceType,
      amountType: invoiceData.amountType,
      status: invoiceData.status || 'Sent',
      notes: invoiceData.notes,
      items: totals.items,
      isRecurring: Boolean(invoiceData.isRecurring),
      recurringInterval: invoiceData.recurringInterval || 'None'
    };

    if (params.id) {
      updateItem('invoices', params.id, invoice);
      showToast('Invoice updated.');
    } else {
      const sequence = getNextInvoiceSequence(state);
      const nextState = getState();
      nextState.invoices.push(invoice);
      nextState.settings.invoice.nextSequence = sequence + 1;
      setState(nextState);
      showToast('Invoice added.');
    }
    closeModal();
    window.location.hash = '#/invoices';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  updateLiveTotals(form);
}

function applyClientTaxDefaults(form, client) {
  const state = getState();
  const placeOfSupplyField = form.querySelector('[name="placeOfSupply"]');
  const invoiceTypeField = form.querySelector('[name="invoiceType"]');
  if (placeOfSupplyField) {
    placeOfSupplyField.value = getPlaceOfSupplyForClient(client, state.settings);
  }
  if (invoiceTypeField && state.settings.gst?.autoDetectTax !== false) {
    invoiceTypeField.value = getDefaultInvoiceTypeForClient(client, state.settings);
  }
}

function renderInvoiceItemRow(item, state) {
  const rowId = item.id || uid('item');
  return `
    <div class="invoice-item-row" data-row-id="${rowId}">
      <div class="field">
        <select name="serviceId" id="f-serviceId-${rowId}" data-field="serviceId">
          <option value="" disabled hidden ${item.serviceId ? '' : 'selected'}>Custom</option>
          ${optionList(state.masters.services.map((service) => ({ id: service.id, name: service.name })), item.serviceId)}
        </select>
        <label for="f-serviceId-${rowId}">Service</label>
      </div>
      ${inputField({ label: 'Service Name', name: 'serviceName', value: item.serviceName })}
      ${inputField({ label: 'SAC / HSN', name: 'hsnSac', value: item.hsnSac })}
      ${inputField({ label: 'Description', name: 'description', value: item.description })}
      ${inputField({ label: 'Qty', name: 'qty', value: item.qty || 1, type: 'number', step: '0.01', min: '0' })}
      ${inputField({ label: 'Rate', name: 'rate', value: item.rate || 0, type: 'number', step: '0.01', min: '0' })}
      ${inputField({ label: 'Discount', name: 'discount', value: item.discount || 0, type: 'number', step: '0.01', min: '0' })}
      ${inputField({ label: 'GST Rate', name: 'gstRate', value: item.gstRate ?? 18, type: 'number', step: '0.01', min: '0' })}
      ${checkboxField({ label: 'Pure Agent', name: 'isPureAgent', checked: item.isPureAgent })}
      <button class="icon-btn danger row-remove" type="button" data-action="remove-invoice-row" title="Remove item" style="min-height: 42px;">&times;</button>
    </div>
  `;
}

function collectInvoiceItems(form) {
  return Array.from(form.querySelectorAll('.invoice-item-row')).map((row) => ({
    id: uid('item'),
    serviceId: row.querySelector('[name="serviceId"]').value,
    serviceName: row.querySelector('[name="serviceName"]').value,
    hsnSac: row.querySelector('[name="hsnSac"]').value,
    description: row.querySelector('[name="description"]').value,
    qty: toNumber(row.querySelector('[name="qty"]').value),
    rate: toNumber(row.querySelector('[name="rate"]').value),
    discount: toNumber(row.querySelector('[name="discount"]').value),
    gstRate: toNumber(row.querySelector('[name="gstRate"]').value),
    isPureAgent: row.querySelector('[name="isPureAgent"]').checked
  }));
}

function updateLiveTotals(form) {
  const state = getState();
  const data = readForm(form);
  const client = findById(state.clients, data.clientId);
  const totals = calculateInvoiceTotals(data, collectInvoiceItems(form), state.settings, client);
  const root = document.getElementById('invoiceLiveTotals');
  if (!root) return;
  root.innerHTML = `
    <div><span>Supply Type</span><strong>${escapeHtml(totals.supplyType || '-')}</strong></div>
    <div><span>GST Head</span><strong>${escapeHtml(formatGstType(totals.gstType))}</strong></div>
    <div><span>Taxable</span><strong>${formatCurrencyINR(totals.taxableAmount)}</strong></div>
    <div><span>CGST</span><strong>${formatCurrencyINR(totals.cgst)}</strong></div>
    <div><span>SGST</span><strong>${formatCurrencyINR(totals.sgst)}</strong></div>
    <div><span>UTGST</span><strong>${formatCurrencyINR(totals.utgst)}</strong></div>
    <div><span>IGST</span><strong>${formatCurrencyINR(totals.igst)}</strong></div>
    <div><span>Total</span><strong>${formatCurrencyINR(totals.totalAmount)}</strong></div>
  `;
}

function formatGstType(gstType = '') {
  return String(gstType || 'NONE').replaceAll('_', ' + ');
}

function defaultInvoiceItem(state) {
  const service = state.masters.services[0] || {};
  return {
    serviceId: service.id || '',
    serviceName: service.name || '',
    hsnSac: service.sac || '',
    description: service.name || '',
    qty: 1,
    rate: service.defaultPrice || 0,
    discount: 0,
    gstRate: service.gstRate ?? 18,
    isPureAgent: false
  };
}

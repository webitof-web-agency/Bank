import { renderTable } from '../components/table.js';
import { inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { CLIENT_GST_REGISTRATION_TYPES, CLIENT_STATUSES, CLIENT_TYPES, CURRENCIES } from '../constants.js';
import { INDIAN_STATES } from '../data/states.js';
import { addItem, deleteItem, getItem, getState, updateItem } from '../state.js';
import { getGstStateCode, getPlaceOfSupplyForClient, isIndiaCountry } from '../utils/gst.js';
import { escapeHtml, readForm, showToast, toNumber, today, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatStatus } from '../utils/formatters.js';
import { validateGstin, validateRequired } from '../utils/validators.js';
import { parseGstinData } from '../utils/automation.js';

export function renderClients(params = {}) {
  const state = getState();
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Clients</h2>
          <p>Maintain billing, GST, contact, and ledger details for every client.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-client">Add Client</button>
      </div>
      <label class="list-search">
        <span>Search client</span>
        <input type="search" data-action="filter-table" placeholder="Search by name, company, email, mobile">
      </label>
      ${renderTable({
        selectable: true,
        columns: [
          { label: 'Client', render: (client) => `<a href="#/clients/detail/${client.id}"><strong>${escapeHtml(client.companyName || client.name)}</strong></a><small>${escapeHtml(client.contactPerson || client.name)}</small>` },
          { label: 'Mobile', render: (client) => escapeHtml(client.mobile) },
          { label: 'Email', render: (client) => escapeHtml(client.email) },
          { label: 'Place', render: (client) => escapeHtml(client.placeOfSupply || client.state || client.country) },
          { label: 'GST Type', render: (client) => escapeHtml(client.gstRegistrationType || '-') },
          { label: 'GSTIN', render: (client) => escapeHtml(client.gstin || '-') },
          { label: 'Opening', align: 'right', render: (client) => formatCurrencyINR(client.openingBalance) },
          { label: 'Status', align: 'center', render: (client) => formatStatus(client.status) }
        ],
        rows: state.clients,
        rowActions: [
          { label: 'View', action: 'view-client', icon: 'View' },
          { label: 'Edit', action: 'edit-client', icon: 'Edit' },
          { label: 'Delete', action: 'delete-client', icon: 'Del', className: 'danger' }
        ],
        emptyTitle: 'No clients',
        emptyMessage: 'Add a client to start tracking projects, invoices, payments, and expenses.'
      })}
    </section>
  `;
}

export function bindClients(params = {}) {
  if (params.mode === 'add') openClientModal();
  if (params.mode === 'edit') openClientModal(params.id);

  document.querySelector('[data-action="add-client"]')?.addEventListener('click', () => openClientModal());

  document.querySelector('[data-action="filter-table"]')?.addEventListener('input', (event) => {
    const term = event.target.value.toLowerCase();
    document.querySelectorAll('tbody tr').forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(term);
    });
  });

  document.querySelectorAll('[data-action="view-client"]').forEach((button) => {
    button.addEventListener('click', () => { window.location.hash = `#/clients/detail/${button.dataset.id}`; });
  });
  document.querySelectorAll('[data-action="edit-client"]').forEach((button) => {
    button.addEventListener('click', () => openClientModal(button.dataset.id));
  });
  document.querySelectorAll('[data-action="delete-client"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this client? Linked records will remain but lose the visible client name.')) return;
      deleteItem('clients', button.dataset.id);
      showToast('Client deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });

  // Bulk Actions Logic
  let bulkBar = document.getElementById('bulkActionsBar');
  if (!bulkBar) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="bulkActionsBar" class="no-print" style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #0f172a; border: 1px solid rgba(255,255,255,0.08); padding: 12px 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-lg); display: none; align-items: center; gap: 16px; z-index: 70; color: #fff;">
        <span id="bulkCount" style="font-weight: 600; font-size: 13px;">0 items selected</span>
        <button class="btn btn-secondary" type="button" data-bulk-action="inactive" style="background: transparent; color: #fff; border-color: rgba(255,255,255,0.2); min-height: 30px; padding: 4px 10px; font-size: 12px;">Mark Inactive</button>
        <button class="btn btn-danger" type="button" data-bulk-action="delete" style="min-height: 30px; padding: 4px 10px; font-size: 12px;">Delete Selected</button>
      </div>
    `);
    bulkBar = document.getElementById('bulkActionsBar');
    
    bulkBar.querySelector('[data-bulk-action="inactive"]').addEventListener('click', () => {
      const selectedIds = Array.from(document.querySelectorAll('.row-selector-chk:checked')).map(chk => chk.dataset.id);
      if (!selectedIds.length) return;
      selectedIds.forEach(id => {
        updateItem('clients', id, { status: 'Inactive' });
      });
      showToast(`Marked ${selectedIds.length} clients as Inactive.`);
      bulkBar.classList.remove('visible');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    
    bulkBar.querySelector('[data-bulk-action="delete"]').addEventListener('click', () => {
      const selectedIds = Array.from(document.querySelectorAll('.row-selector-chk:checked')).map(chk => chk.dataset.id);
      if (!selectedIds.length) return;
      if (!window.confirm(`Delete ${selectedIds.length} selected clients?`)) return;
      selectedIds.forEach(id => {
        deleteItem('clients', id);
      });
      showToast(`Deleted ${selectedIds.length} clients.`);
      bulkBar.classList.remove('visible');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  }

  const updateBulkBar = () => {
    const checkedChks = document.querySelectorAll('.row-selector-chk:checked');
    const countSpan = document.getElementById('bulkCount');
    if (checkedChks.length > 0) {
      if (countSpan) countSpan.textContent = `${checkedChks.length} clients selected`;
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

  // Hide bar on list transition
  updateBulkBar();
}

function renderClientForm(id = '') {
  const client = id ? getItem('clients', id) : {};
  const state = getState();
  const title = id ? 'Edit Client' : 'Add Client';
  if (id && !client) return '<section class="page-section"><h2>Client not found</h2></section>';
  const placeOfSupply = client.placeOfSupply || getPlaceOfSupplyForClient(client, state.settings);
  const stateCode = client.stateCode || getGstStateCode(client.state, client.gstin);

  return `
      <form id="clientForm" class="form-grid">
        <h3 class="form-section-title">Contact Details</h3>
        ${inputField({ label: 'Client Name', name: 'name', value: client.name, required: true, className: 'span-6' })}
        ${inputField({ label: 'Company Name', name: 'companyName', value: client.companyName, className: 'span-6' })}
        ${inputField({ label: 'Contact Person', name: 'contactPerson', value: client.contactPerson, className: 'span-4' })}
        ${inputField({ label: 'Mobile', name: 'mobile', value: client.mobile, className: 'span-4' })}
        ${inputField({ label: 'Email', name: 'email', value: client.email, type: 'email', className: 'span-4' })}
        
        <h3 class="form-section-title">Address & Supply</h3>
        ${textareaField({ label: 'Billing Address', name: 'billingAddress', value: client.billingAddress, rows: 2, className: 'span-6' })}
        ${textareaField({ label: 'Shipping Address', name: 'shippingAddress', value: client.shippingAddress, rows: 2, className: 'span-6' })}
        ${selectField({ label: 'State', name: 'state', options: INDIAN_STATES, value: client.state || 'Chhattisgarh', className: 'span-3' })}
        ${inputField({ label: 'State Code', name: 'stateCode', value: stateCode, className: 'span-2' })}
        ${inputField({ label: 'Country', name: 'country', value: client.country || 'India', required: true, className: 'span-3' })}
        ${selectField({ label: 'Place of Supply', name: 'placeOfSupply', options: ['Outside India', ...INDIAN_STATES], value: placeOfSupply, className: 'span-4' })}
        
        <h3 class="form-section-title">GST & Financial Settings</h3>
        ${selectField({ label: 'Client Type', name: 'clientType', options: CLIENT_TYPES, value: client.clientType || 'Company', className: 'span-4' })}
        ${selectField({ label: 'GST Registration Type', name: 'gstRegistrationType', options: CLIENT_GST_REGISTRATION_TYPES, value: client.gstRegistrationType || (client.gstin ? 'Registered' : 'Unregistered'), className: 'span-4' })}
        <div class="field span-4">
          <input type="text" name="gstin" id="f-gstin" value="${escapeHtml(client.gstin || '')}" placeholder=" ">
          <label for="f-gstin">GSTIN <button class="btn btn-secondary" type="button" data-action="autofill-gstin" style="min-height: 20px; padding: 2px 8px; font-size: 11px; margin-left: 8px; pointer-events: auto;">Auto-fill</button></label>
        </div>
        ${inputField({ label: 'PAN', name: 'pan', value: client.pan, className: 'span-3' })}
        ${selectField({ label: 'Currency', name: 'currency', options: CURRENCIES, value: client.currency || 'INR', className: 'span-3' })}
        ${inputField({ label: 'Opening Balance', name: 'openingBalance', value: client.openingBalance || 0, type: 'number', step: '0.01', className: 'span-3' })}
        ${selectField({ label: 'Status', name: 'status', options: CLIENT_STATUSES, value: client.status || 'Active', required: true, className: 'span-3' })}
        
        <h3 class="form-section-title">Additional Info</h3>
        ${textareaField({ label: 'Notes', name: 'notes', value: client.notes, rows: 2, className: 'span-12' })}
        ${formActions(id ? 'Update Client' : 'Save Client')}
      </form>
  `;
}

function openClientModal(id = '') {
  openModal({
    title: id ? 'Edit Client' : 'Add Client',
    body: renderClientForm(id)
  });
  bindClientForm(id);
}

function bindClientForm(id = '') {
  const form = document.getElementById('clientForm');
  if (!form) return;
  form.querySelector('[data-action="autofill-gstin"]')?.addEventListener('click', () => {
    const gstinVal = form.querySelector('[name="gstin"]').value;
    const parsed = parseGstinData(gstinVal);
    if (!parsed) {
      showToast('Please enter a valid 15-digit GSTIN.');
      return;
    }
    form.querySelector('[name="state"]').value = parsed.state || 'Chhattisgarh';
    form.querySelector('[name="stateCode"]').value = parsed.stateCode;
    form.querySelector('[name="pan"]').value = parsed.pan;
    form.querySelector('[name="companyName"]').value = parsed.legalName;
    form.querySelector('[name="gstRegistrationType"]').value = 'Registered';
    showToast('GSTIN parsed & fields auto-filled!');
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = normalizeClient(readForm(form), id);
    const errors = validateRequired(data, ['name', 'country', 'status']);
    if (isIndiaCountry(data.country) && !data.state) errors.push('State is required for Indian clients.');
    if (!validateGstin(data.gstin)) errors.push('GSTIN format is invalid.');
    if (['Registered', 'SEZ'].includes(data.gstRegistrationType) && !data.gstin) {
      errors.push('GSTIN is required for registered or SEZ clients.');
    }
    if (errors.length) {
      window.alert(errors.join('\n'));
      return;
    }
    if (id) {
      updateItem('clients', id, data);
      showToast('Client updated.');
    } else {
      addItem('clients', data);
      showToast('Client added.');
    }
    closeModal();
    window.location.hash = '#/clients';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function normalizeClient(data, existingId = '') {
  const country = data.country || 'India';
  const gstRegistrationType = isIndiaCountry(country)
    ? data.gstRegistrationType || (data.gstin ? 'Registered' : 'Unregistered')
    : 'Overseas';
  const normalizedGstin = String(data.gstin || '').toUpperCase();
  const stateCode = getGstStateCode(data.state, normalizedGstin) || data.stateCode;
  return {
    id: existingId || uid('client'),
    name: data.name,
    companyName: data.companyName,
    mobile: data.mobile,
    email: data.email,
    billingAddress: data.billingAddress,
    shippingAddress: data.shippingAddress,
    state: data.state,
    stateCode,
    country,
    placeOfSupply: gstRegistrationType === 'Overseas' ? 'Outside India' : data.placeOfSupply || data.state,
    clientType: data.clientType || 'Company',
    gstRegistrationType,
    gstin: normalizedGstin,
    pan: String(data.pan || '').toUpperCase(),
    currency: data.currency || 'INR',
    contactPerson: data.contactPerson,
    openingBalance: toNumber(data.openingBalance),
    notes: data.notes,
    status: data.status || 'Active',
    createdAt: data.createdAt || today()
  };
}

import { renderTable } from '../components/table.js';
import { checkboxField, inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { TDS_SECTIONS, VENDOR_TYPES } from '../constants.js';
import { INDIAN_STATES } from '../data/states.js';
import { getState, setState } from '../state.js';
import { escapeHtml, readForm, showToast, uid } from '../utils/helpers.js';
import { validateGstin, validatePan, validateRequired } from '../utils/validators.js';

export function renderVendors() {
  const state = getState();
  const vendors = state.masters?.vendors || [];
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Vendors</h2>
          <p>Freelancers, agencies, and referral partners used for outsourcing, commission, TDS, and ITC.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-vendor">Add Vendor</button>
      </div>
      ${renderTable({
        rows: vendors,
        columns: [
          { label: 'Vendor', render: (vendor) => `<strong>${escapeHtml(vendor.name)}</strong><small>${escapeHtml(vendor.vendorType || 'Other')}</small>` },
          { label: 'GST', render: (vendor) => vendor.gstRegistered ? `Registered ${escapeHtml(vendor.gstin || '')}` : 'Unregistered' },
          { label: 'PAN', render: (vendor) => escapeHtml(vendor.pan || '-') },
          { label: 'State', render: (vendor) => escapeHtml(vendor.state || '-') },
          { label: 'TDS', render: (vendor) => vendor.tdsApplicable ? escapeHtml(vendor.defaultTdsSection || 'Yes') : 'No' },
          { label: 'Active', render: (vendor) => vendor.isActive !== false ? 'Yes' : 'No' }
        ],
        rowActions: [
          { label: 'Edit', action: 'edit-vendor', icon: 'Edit' },
          { label: 'Delete', action: 'delete-vendor', icon: 'Del', className: 'danger' }
        ],
        emptyTitle: 'No vendors',
        emptyMessage: 'Add vendors or referral partners to record outsourcing and commission.'
      })}
    </section>
  `;
}

export function bindVendors() {
  document.querySelector('[data-action="add-vendor"]')?.addEventListener('click', () => openVendorModal());
  document.querySelectorAll('[data-action="edit-vendor"]').forEach((button) => {
    button.addEventListener('click', () => {
      const vendor = (getState().masters?.vendors || []).find((item) => String(item.id) === String(button.dataset.id));
      if (vendor) openVendorModal(vendor);
    });
  });
  document.querySelectorAll('[data-action="delete-vendor"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this vendor? Existing records will keep vendor name but lose master lookup.')) return;
      const state = getState();
      state.masters.vendors = (state.masters.vendors || []).filter((vendor) => String(vendor.id) !== String(button.dataset.id));
      setState(state);
      showToast('Vendor deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
}

function openVendorModal(vendor = {}) {
  openModal({
    title: vendor.id ? 'Edit Vendor' : 'Add Vendor',
    body: renderVendorForm(vendor)
  });
  bindVendorForm(vendor.id || '');
}

function renderVendorForm(vendor = {}) {
  return `
    <form id="vendorForm" class="form-grid">
      ${inputField({ label: 'Vendor Name', name: 'name', value: vendor.name, required: true })}
      ${selectField({ label: 'Vendor Type', name: 'vendorType', options: VENDOR_TYPES, value: vendor.vendorType || 'Freelancer' })}
      ${checkboxField({ label: 'GST Registered', name: 'gstRegistered', checked: vendor.gstRegistered })}
      ${inputField({ label: 'GSTIN', name: 'gstin', value: vendor.gstin })}
      ${inputField({ label: 'PAN', name: 'pan', value: vendor.pan })}
      ${textareaField({ label: 'Address', name: 'address', value: vendor.address, className: 'full-span' })}
      ${selectField({ label: 'State', name: 'state', options: INDIAN_STATES, value: vendor.state || 'Chhattisgarh' })}
      ${inputField({ label: 'Mobile', name: 'mobile', value: vendor.mobile })}
      ${inputField({ label: 'Email', name: 'email', value: vendor.email, type: 'email' })}
      ${textareaField({ label: 'Bank Details', name: 'bankDetails', value: vendor.bankDetails, className: 'full-span' })}
      ${inputField({ label: 'UPI ID', name: 'upiId', value: vendor.upiId })}
      ${checkboxField({ label: 'TDS Applicable', name: 'tdsApplicable', checked: vendor.tdsApplicable })}
      ${selectField({ label: 'Default TDS Section', name: 'defaultTdsSection', options: TDS_SECTIONS, value: vendor.defaultTdsSection || 'Not Applicable' })}
      ${checkboxField({ label: 'Active', name: 'isActive', checked: vendor.isActive !== false })}
      ${textareaField({ label: 'Notes', name: 'notes', value: vendor.notes, className: 'full-span' })}
      ${formActions(vendor.id ? 'Update Vendor' : 'Add Vendor')}
    </form>
  `;
}

function bindVendorForm(existingId = '') {
  document.getElementById('vendorForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);
    const vendor = normalizeVendor(data, existingId);
    const errors = validateRequired(vendor, ['name']);
    if (vendor.gstRegistered && !vendor.gstin) errors.push('GSTIN is required for GST registered vendors.');
    if (!validateGstin(vendor.gstin)) errors.push('GSTIN format is invalid.');
    if (!validatePan(vendor.pan)) errors.push('PAN format is invalid.');
    if (errors.length) {
      window.alert(errors.join('\n'));
      return;
    }

    const state = getState();
    state.masters.vendors = state.masters.vendors || [];
    if (existingId) {
      state.masters.vendors = state.masters.vendors.map((item) => String(item.id) === String(existingId) ? vendor : item);
      showToast('Vendor updated.');
    } else {
      state.masters.vendors.push(vendor);
      showToast('Vendor added.');
    }
    setState(state);
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function normalizeVendor(data, existingId = '') {
  return {
    id: existingId || uid('vendor'),
    name: data.name,
    vendorType: data.vendorType || 'Other',
    gstRegistered: Boolean(data.gstRegistered),
    gstin: String(data.gstin || '').toUpperCase(),
    pan: String(data.pan || '').toUpperCase(),
    address: data.address,
    state: data.state,
    mobile: data.mobile,
    email: data.email,
    bankDetails: data.bankDetails,
    upiId: data.upiId,
    tdsApplicable: Boolean(data.tdsApplicable),
    defaultTdsSection: data.defaultTdsSection || 'Not Applicable',
    notes: data.notes,
    isActive: Boolean(data.isActive)
  };
}

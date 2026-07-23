import { renderTable } from '../components/table.js';
import { checkboxField, inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { OUTSOURCING_WORK_TYPES, PAYMENT_STATUSES } from '../constants.js';
import { getState, setState } from '../state.js';
import { calculateOutsourcingExpense } from '../utils/outsourcingAccounting.js';
import { escapeHtml, findById, optionList, readForm, showToast, toNumber, today, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';

export function renderOutsourcing() {
  const state = getState();
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Outsourcing Expenses</h2>
          <p>Book outsourced work costs separately from client invoices for project profitability and ITC.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-outsourcing">Add Outsourcing Expense</button>
      </div>
      ${renderTable({
        rows: state.outsourcingExpenses || [],
        columns: [
          { label: 'Date', render: (item) => formatDate(item.expenseDate) },
          { label: 'Project', render: (item) => escapeHtml(findById(state.projects, item.projectId)?.title || '-') },
          { label: 'Vendor', render: (item) => escapeHtml(findById(state.masters?.vendors || [], item.vendorId)?.name || item.vendorName || '-') },
          { label: 'Work Type', render: (item) => escapeHtml(item.workType || '-') },
          { label: 'Base', render: (item) => formatCurrencyINR(calculateOutsourcingExpense(item, findById(state.masters?.vendors || [], item.vendorId), state.settings).baseAmount) },
          { label: 'GST / ITC', render: (item) => {
            const impact = calculateOutsourcingExpense(item, findById(state.masters?.vendors || [], item.vendorId), state.settings);
            return `${formatCurrencyINR(impact.gstAmount)}${impact.itcEligible ? '<small>ITC eligible</small>' : '<small>No ITC</small>'}`;
          } },
          { label: 'Total', render: (item) => formatCurrencyINR(calculateOutsourcingExpense(item, findById(state.masters?.vendors || [], item.vendorId), state.settings).totalAmount) },
          { label: 'Status', render: (item) => formatStatus(item.paymentStatus || 'Pending') }
        ],
        rowActions: [
          { label: 'Edit', action: 'edit-outsourcing', icon: 'Edit' },
          { label: 'Delete', action: 'delete-outsourcing', icon: 'Del', className: 'danger' }
        ],
        emptyTitle: 'No outsourcing expenses',
        emptyMessage: 'Add outsourced vendor costs to calculate project profit.'
      })}
    </section>
  `;
}

export function bindOutsourcing() {
  document.querySelector('[data-action="add-outsourcing"]')?.addEventListener('click', () => openOutsourcingModal());
  document.querySelectorAll('[data-action="edit-outsourcing"]').forEach((button) => {
    button.addEventListener('click', () => {
      const record = (getState().outsourcingExpenses || []).find((item) => String(item.id) === String(button.dataset.id));
      if (record) openOutsourcingModal(record);
    });
  });
  document.querySelectorAll('[data-action="delete-outsourcing"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this outsourcing expense?')) return;
      const state = getState();
      state.outsourcingExpenses = (state.outsourcingExpenses || []).filter((item) => String(item.id) !== String(button.dataset.id));
      setState(state);
      showToast('Outsourcing expense deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
}

function openOutsourcingModal(record = {}) {
  openModal({
    title: record.id ? 'Edit Outsourcing Expense' : 'Add Outsourcing Expense',
    body: renderOutsourcingForm(record)
  });
  bindOutsourcingForm(record.id || '');
}

function renderOutsourcingForm(record = {}) {
  const state = getState();
  return `
    <form id="outsourcingForm" class="form-grid">
      ${inputField({ label: 'Expense Date', name: 'expenseDate', value: record.expenseDate || today(), type: 'date', required: true })}
      <label class="field"><span>Client</span><select name="clientId"><option value="">Select</option>${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })), record.clientId)}</select></label>
      <label class="field"><span>Project *</span><select name="projectId" required><option value="">Select</option>${optionList(state.projects.map((project) => ({ id: project.id, name: project.title })), record.projectId)}</select></label>
      <label class="field"><span>Vendor *</span><select name="vendorId" required><option value="">Select</option>${optionList((state.masters?.vendors || []).map((vendor) => ({ id: vendor.id, name: vendor.name })), record.vendorId)}</select></label>
      ${selectField({ label: 'Work Type', name: 'workType', options: OUTSOURCING_WORK_TYPES, value: record.workType || 'Development' })}
      ${textareaField({ label: 'Description', name: 'description', value: record.description, className: 'full-span' })}
      ${inputField({ label: 'Base Amount', name: 'baseAmount', value: record.baseAmount || 0, type: 'number', step: '0.01', min: '0', required: true })}
      ${checkboxField({ label: 'GST Applicable', name: 'gstApplicable', checked: record.gstApplicable })}
      ${inputField({ label: 'GST Rate', name: 'gstRate', value: record.gstRate ?? state.settings?.gst?.defaultRate ?? 18, type: 'number', step: '0.01', min: '0' })}
      ${checkboxField({ label: 'ITC Eligible', name: 'itcEligible', checked: record.itcEligible !== false })}
      ${selectField({ label: 'Payment Status', name: 'paymentStatus', options: PAYMENT_STATUSES, value: record.paymentStatus || 'Pending' })}
      ${inputField({ label: 'Vendor Invoice Number', name: 'vendorInvoiceNumber', value: record.vendorInvoiceNumber })}
      ${inputField({ label: 'Vendor Invoice URL', name: 'vendorInvoiceUrl', value: record.vendorInvoiceUrl })}
      ${inputField({ label: 'Payment Proof URL', name: 'paymentProofUrl', value: record.paymentProofUrl })}
      ${textareaField({ label: 'Notes', name: 'notes', value: record.notes, className: 'full-span' })}
      ${formActions(record.id ? 'Update Expense' : 'Add Expense')}
    </form>
  `;
}

function bindOutsourcingForm(existingId = '') {
  document.getElementById('outsourcingForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = getState();
    const data = readForm(event.currentTarget);
    const vendor = findById(state.masters?.vendors || [], data.vendorId);
    if (!data.projectId || !data.vendorId) {
      window.alert('Project and vendor are required.');
      return;
    }
    const calculated = calculateOutsourcingExpense(data, vendor, state.settings);
    const record = {
      id: existingId || uid('outsource'),
      expenseDate: data.expenseDate,
      clientId: data.clientId,
      projectId: data.projectId,
      vendorId: data.vendorId,
      vendorName: vendor?.name || '',
      workType: data.workType,
      description: data.description,
      baseAmount: calculated.baseAmount,
      vendorGstRegistered: Boolean(vendor?.gstRegistered || vendor?.gstin),
      gstApplicable: calculated.gstApplicable,
      gstRate: calculated.gstRate,
      gstAmount: calculated.gstAmount,
      totalAmount: calculated.totalAmount,
      itcEligible: calculated.itcEligible,
      paymentStatus: data.paymentStatus || 'Pending',
      vendorInvoiceNumber: data.vendorInvoiceNumber,
      vendorInvoiceUrl: data.vendorInvoiceUrl,
      paymentProofUrl: data.paymentProofUrl,
      notes: data.notes
    };
    state.outsourcingExpenses = state.outsourcingExpenses || [];
    if (existingId) {
      state.outsourcingExpenses = state.outsourcingExpenses.map((item) => String(item.id) === String(existingId) ? record : item);
      showToast('Outsourcing expense updated.');
    } else {
      state.outsourcingExpenses.push(record);
      showToast('Outsourcing expense added.');
    }
    setState(state);
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

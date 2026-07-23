import { renderTable } from '../components/table.js';
import { checkboxField, inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { AMC_STATUSES } from '../constants.js';
import { addItem, deleteItem, getItem, getState, updateItem } from '../state.js';
import { escapeHtml, findById, optionList, readForm, showToast, toNumber, today, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';

export function renderAmc() {
  const state = getState();

  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>AMC</h2>
          <p>Manage recurring annual or monthly maintenance contracts.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-amc">Add AMC</button>
      </div>
      ${renderTable({
        rows: state.amcs,
        columns: [
          { label: 'Client', render: (item) => escapeHtml(findById(state.clients, item.clientId)?.companyName || '-') },
          { label: 'Project', render: (item) => escapeHtml(findById(state.projects, item.projectId)?.title || '-') },
          { label: 'AMC Type', render: (item) => escapeHtml(item.amcType) },
          { label: 'Cycle', render: (item) => escapeHtml(item.billingCycle || '-') },
          { label: 'End Date', render: (item) => formatDate(item.endDate) },
          { label: 'Next Invoice', render: (item) => formatDate(item.nextInvoiceDate) },
          { label: 'Amount', render: (item) => formatCurrencyINR(item.amcAmount) },
          { label: 'Status', render: (item) => formatStatus(item.status) }
        ],
        rowActions: [
          { label: 'Edit', action: 'edit-amc', icon: 'Edit' },
          { label: 'Delete', action: 'delete-amc', icon: 'Del', className: 'danger' }
        ],
        emptyTitle: 'No AMC records',
        emptyMessage: 'Add AMC records to track recurring billing.'
      })}
    </section>
  `;
}

export function bindAmc() {
  document.querySelector('[data-action="add-amc"]')?.addEventListener('click', () => openAmcModal());

  document.querySelectorAll('[data-action="edit-amc"]').forEach((button) => {
    button.addEventListener('click', () => openAmcModal(getItem('amcs', button.dataset.id)));
  });
  document.querySelectorAll('[data-action="delete-amc"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this AMC record?')) return;
      deleteItem('amcs', button.dataset.id);
      showToast('AMC record deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
}

function openAmcModal(amc = {}) {
  const editId = amc?.id || '';
  openModal({
    title: editId ? 'Edit AMC' : 'Add AMC',
    body: renderAmcForm(amc)
  });
  bindAmcModalForm(editId);
}

function renderAmcForm(amc = {}) {
  const state = getState();
  const editId = amc?.id || '';
  const amcTypes = activeMasterNames(state.masters?.amcTypes, ['Website Maintenance', 'Server Maintenance']);
  const billingCycles = activeMasterNames(state.masters?.billingCycles, ['Monthly', 'Quarterly', 'Yearly']);

  return `
    <form id="amcForm" class="form-grid">
      <label class="field"><span>Client</span><select name="clientId"><option value="">Select</option>${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })), amc.clientId)}</select></label>
      <label class="field"><span>Project</span><select name="projectId"><option value="">Select</option>${optionList(state.projects.map((project) => ({ id: project.id, name: project.title })), amc.projectId)}</select></label>
      ${selectField({ label: 'AMC Type', name: 'amcType', options: amcTypes, value: amc.amcType || amcTypes[0] })}
      ${inputField({ label: 'Start Date', name: 'startDate', value: amc.startDate || today(), type: 'date' })}
      ${inputField({ label: 'End Date', name: 'endDate', value: amc.endDate, type: 'date' })}
      ${selectField({ label: 'Billing Cycle', name: 'billingCycle', options: billingCycles, value: amc.billingCycle || 'Monthly' })}
      ${inputField({ label: 'AMC Amount', name: 'amcAmount', value: amc.amcAmount || 0, type: 'number', step: '0.01' })}
      ${selectField({ label: 'GST Type', name: 'gstType', options: ['Auto', 'CGST + SGST', 'IGST', 'GST Exempt'], value: amc.gstType || 'Auto' })}
      ${inputField({ label: 'Next Invoice Date', name: 'nextInvoiceDate', value: amc.nextInvoiceDate || today(), type: 'date' })}
      ${inputField({ label: 'Reminder Days', name: 'reminderDays', value: amc.reminderDays ?? 7, type: 'number' })}
      ${selectField({ label: 'Status', name: 'status', options: AMC_STATUSES, value: amc.status || 'Active' })}
      ${checkboxField({ label: 'Auto Invoice', name: 'autoInvoice', checked: amc.autoInvoice })}
      ${textareaField({ label: 'Remarks', name: 'remarks', value: amc.remarks, className: 'full-span' })}
      ${formActions(editId ? 'Update AMC' : 'Add AMC')}
    </form>
  `;
}

function bindAmcModalForm(editId = '') {
  const form = document.getElementById('amcForm');
  if (!form) return;
  form.addEventListener('input', (event) => {
    if (event.target.name === 'nextInvoiceDate') event.target.dataset.userEdited = 'true';
    syncNextInvoiceDate(form);
  });
  form.addEventListener('change', (event) => {
    if (event.target.name === 'nextInvoiceDate') event.target.dataset.userEdited = 'true';
    syncNextInvoiceDate(form);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);
    const record = normalizeAmc(data, editId);
    if (editId) {
      updateItem('amcs', editId, record);
      showToast('AMC record updated.');
    } else {
      addItem('amcs', record);
      showToast('AMC record added.');
    }
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function normalizeAmc(data, existingId = '') {
  return {
    id: existingId || uid('amc'),
    clientId: data.clientId,
    projectId: data.projectId,
    amcType: data.amcType,
    startDate: data.startDate,
    endDate: data.endDate,
    billingCycle: data.billingCycle,
    amcAmount: toNumber(data.amcAmount),
    gstType: data.gstType || 'Auto',
    nextInvoiceDate: data.nextInvoiceDate,
    autoInvoice: Boolean(data.autoInvoice),
    reminderDays: toNumber(data.reminderDays),
    status: data.status || 'Active',
    remarks: data.remarks
  };
}

function activeMasterNames(items = [], fallback = []) {
  const names = (items || []).filter((item) => item.isActive !== false).map((item) => item.name);
  return names.length ? names : fallback;
}

function syncNextInvoiceDate(form) {
  const start = form.querySelector('[name="startDate"]')?.value;
  const cycle = form.querySelector('[name="billingCycle"]')?.value;
  const nextField = form.querySelector('[name="nextInvoiceDate"]');
  if (!start || !cycle || !nextField || nextField.dataset.userEdited) return;
  nextField.value = addMonths(start, cycleMonths(cycle));
}

function cycleMonths(cycle = '') {
  const state = getState();
  const matched = (state.masters?.billingCycles || []).find((item) => item.name === cycle);
  if (matched?.months) return toNumber(matched.months, 1);
  if (cycle === 'Quarterly') return 3;
  if (cycle === 'Half Yearly') return 6;
  if (cycle === 'Yearly') return 12;
  return 1;
}

function addMonths(dateString, months) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  date.setMonth(date.getMonth() + toNumber(months, 1));
  return date.toISOString().slice(0, 10);
}

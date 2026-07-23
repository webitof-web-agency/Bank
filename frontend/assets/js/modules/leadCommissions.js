import { renderTable } from '../components/table.js';
import { checkboxField, inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { COMMISSION_TYPES, PAYMENT_STATUSES, TDS_SECTIONS } from '../constants.js';
import { getState, setState } from '../state.js';
import { calculateLeadCommission, getProjectTaxableValue } from '../utils/outsourcingAccounting.js';
import { escapeHtml, findById, optionList, readForm, showToast, toNumber, today, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';

export function renderLeadCommissions() {
  const state = getState();
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Lead Commissions</h2>
          <p>Track referral partner commission, GST, TDS, ITC, and net payable without reducing client invoice value.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-commission">Add Commission</button>
      </div>
      ${renderTable({
        rows: state.leadCommissions || [],
        columns: [
          { label: 'Date', render: (item) => formatDate(item.commissionDate || item.createdAt) },
          { label: 'Partner', render: (item) => escapeHtml(findById(state.masters?.vendors || [], item.partnerId)?.name || item.partnerName || '-') },
          { label: 'Project', render: (item) => escapeHtml(findById(state.projects, item.projectId)?.title || '-') },
          { label: 'Base', render: (item) => formatCurrencyINR(calculateLeadCommission(item, findById(state.masters?.vendors || [], item.partnerId), state.settings).commissionBaseAmount) },
          { label: 'Commission', render: (item) => formatCurrencyINR(calculateLeadCommission(item, findById(state.masters?.vendors || [], item.partnerId), state.settings).commissionAmount) },
          { label: 'GST', render: (item) => formatCurrencyINR(calculateLeadCommission(item, findById(state.masters?.vendors || [], item.partnerId), state.settings).gstAmount) },
          { label: 'TDS', render: (item) => formatCurrencyINR(calculateLeadCommission(item, findById(state.masters?.vendors || [], item.partnerId), state.settings).tdsAmount) },
          { label: 'Net Payable', render: (item) => formatCurrencyINR(calculateLeadCommission(item, findById(state.masters?.vendors || [], item.partnerId), state.settings).netPayable) },
          { label: 'Status', render: (item) => formatStatus(item.paymentStatus || 'Pending') }
        ],
        rowActions: [
          { label: 'Edit', action: 'edit-commission', icon: 'Edit' },
          { label: 'Delete', action: 'delete-commission', icon: 'Del', className: 'danger' }
        ],
        emptyTitle: 'No commissions',
        emptyMessage: 'Add referral partner commissions to track TDS and profitability.'
      })}
    </section>
  `;
}

export function bindLeadCommissions() {
  document.querySelector('[data-action="add-commission"]')?.addEventListener('click', () => openCommissionModal());
  document.querySelectorAll('[data-action="edit-commission"]').forEach((button) => {
    button.addEventListener('click', () => {
      const record = (getState().leadCommissions || []).find((item) => String(item.id) === String(button.dataset.id));
      if (record) openCommissionModal(record);
    });
  });
  document.querySelectorAll('[data-action="delete-commission"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this lead commission?')) return;
      const state = getState();
      state.leadCommissions = (state.leadCommissions || []).filter((item) => String(item.id) !== String(button.dataset.id));
      setState(state);
      showToast('Lead commission deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
}

function openCommissionModal(record = {}) {
  openModal({
    title: record.id ? 'Edit Lead Commission' : 'Add Lead Commission',
    body: renderCommissionForm(record)
  });
  bindCommissionForm(record.id || '');
}

function renderCommissionForm(record = {}) {
  const state = getState();
  const activeVendors = (state.masters?.vendors || []).filter((vendor) => vendor.isActive !== false);
  const referralPartners = activeVendors.filter((vendor) => vendor.vendorType === 'Referral Partner' || vendor.tdsApplicable);
  const partnerOptions = referralPartners.length ? referralPartners : activeVendors;
  return `
    <form id="commissionForm" class="form-grid">
      ${inputField({ label: 'Commission Date', name: 'commissionDate', value: record.commissionDate || record.createdAt || today(), type: 'date' })}
      <label class="field"><span>Lead / Referral Partner *</span><select name="partnerId" required><option value="">Select</option>${optionList(partnerOptions.map((vendor) => ({ id: vendor.id, name: vendor.name })), record.partnerId)}</select></label>
      <label class="field"><span>Client</span><select name="clientId"><option value="">Select</option>${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })), record.clientId)}</select></label>
      <label class="field"><span>Project *</span><select name="projectId" required><option value="">Select</option>${optionList(state.projects.map((project) => ({ id: project.id, name: project.title })), record.projectId)}</select></label>
      ${selectField({ label: 'Commission Type', name: 'commissionType', options: COMMISSION_TYPES, value: record.commissionType || 'Percentage' })}
      ${inputField({ label: 'Commission %', name: 'commissionPercentage', value: record.commissionPercentage ?? 30, type: 'number', step: '0.01', min: '0' })}
      ${inputField({ label: 'Fixed Amount', name: 'fixedAmount', value: record.commissionType === 'Fixed' ? record.commissionAmount : 0, type: 'number', step: '0.01', min: '0' })}
      ${inputField({ label: 'Commission Base Amount', name: 'commissionBaseAmount', value: record.commissionBaseAmount || '', type: 'number', step: '0.01', min: '0', placeholder: 'Leave blank to use project taxable value' })}
      ${inputField({ label: 'GST Rate', name: 'gstRate', value: record.gstRate ?? state.settings?.gst?.defaultRate ?? 18, type: 'number', step: '0.01', min: '0' })}
      ${checkboxField({ label: 'TDS Applicable', name: 'tdsApplicable', checked: record.tdsApplicable !== false })}
      ${selectField({ label: 'TDS Section', name: 'tdsSection', options: TDS_SECTIONS, value: record.tdsSection || state.settings?.tds?.commissionSection || '194H' })}
      ${inputField({ label: 'TDS Rate', name: 'tdsRate', value: record.tdsRate ?? state.settings?.tds?.commissionRate ?? 2, type: 'number', step: '0.01', min: '0' })}
      ${selectField({ label: 'Payment Status', name: 'paymentStatus', options: PAYMENT_STATUSES, value: record.paymentStatus || 'Pending' })}
      ${inputField({ label: 'Commission Invoice Number', name: 'invoiceNumber', value: record.invoiceNumber })}
      ${inputField({ label: 'Invoice / Receipt URL', name: 'invoiceUrl', value: record.invoiceUrl })}
      ${textareaField({ label: 'Notes', name: 'notes', value: record.notes, className: 'full-span' })}
      ${formActions(record.id ? 'Update Commission' : 'Add Commission')}
    </form>
  `;
}

function bindCommissionForm(existingId = '') {
  document.getElementById('commissionForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = getState();
    const data = readForm(event.currentTarget);
    const partner = findById(state.masters?.vendors || [], data.partnerId);
    if (!data.partnerId || !data.projectId) {
      window.alert('Referral partner and project are required.');
      return;
    }
    if (data.commissionType === 'Percentage' && toNumber(data.commissionPercentage) > 100) {
      window.alert('Commission percentage cannot exceed 100%.');
      return;
    }
    const baseAmount = toNumber(data.commissionBaseAmount) || getProjectTaxableValue(data.projectId, state);
    const calculated = calculateLeadCommission({ ...data, commissionBaseAmount: baseAmount }, partner, state.settings);
    const record = {
      id: existingId || uid('commission'),
      commissionDate: data.commissionDate || today(),
      createdAt: data.commissionDate || today(),
      partnerId: data.partnerId,
      partnerName: partner?.name || '',
      clientId: data.clientId,
      projectId: data.projectId,
      commissionType: calculated.commissionType,
      commissionPercentage: calculated.commissionPercentage,
      commissionBaseAmount: calculated.commissionBaseAmount,
      commissionAmount: calculated.commissionAmount,
      gstRegistered: calculated.gstRegistered,
      gstRate: calculated.gstRate,
      gstAmount: calculated.gstAmount,
      grossPayable: calculated.grossPayable,
      tdsApplicable: calculated.tdsApplicable,
      tdsSection: calculated.tdsSection,
      tdsRate: calculated.tdsRate,
      tdsAmount: calculated.tdsAmount,
      netPayable: calculated.netPayable,
      paymentStatus: data.paymentStatus || 'Pending',
      invoiceNumber: data.invoiceNumber,
      invoiceUrl: data.invoiceUrl,
      tdsDepositStatus: 'Not Deposited',
      notes: data.notes
    };
    state.leadCommissions = state.leadCommissions || [];
    if (existingId) {
      state.leadCommissions = state.leadCommissions.map((item) => String(item.id) === String(existingId) ? record : item);
      showToast('Lead commission updated.');
    } else {
      state.leadCommissions.push(record);
      showToast('Lead commission added.');
    }
    setState(state);
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

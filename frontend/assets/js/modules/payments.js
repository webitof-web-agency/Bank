import { renderTable } from '../components/table.js';
import { inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { PAYMENT_MODES } from '../constants.js';
import { addItem, getState, setState } from '../state.js';
import { calculateInvoiceTotals, getInvoiceDueAmount } from '../utils/finance.js';
import { escapeHtml, findById, optionList, readForm, showToast, toNumber, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate } from '../utils/formatters.js';
import { validatePaymentAmount } from '../utils/validators.js';

export function renderPayments() {
  const state = getState();
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Payments</h2>
          <p>Record receipts, TDS deductions, bank references, and invoice status updates.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-payment">Add Payment</button>
      </div>
      ${renderTable({
        rows: state.payments,
        columns: [
          { label: 'Date', render: (payment) => formatDate(payment.paymentDate) },
          { label: 'Client', render: (payment) => escapeHtml(findById(state.clients, payment.clientId)?.companyName || '-') },
          { label: 'Invoice', render: (payment) => escapeHtml(findById(state.invoices, payment.invoiceId)?.invoiceNumber || '-') },
          { label: 'Received', align: 'right', render: (payment) => formatCurrencyINR(payment.amountReceived) },
          { label: 'TDS', align: 'right', render: (payment) => formatCurrencyINR(payment.tdsDeducted) },
          { label: 'Mode', render: (payment) => escapeHtml(payment.paymentMode) }
        ],
        emptyTitle: 'No payments',
        emptyMessage: 'Add a payment to update invoice status automatically.'
      })}
    </section>
  `;
}

export function bindPayments() {
  document.querySelector('[data-action="add-payment"]')?.addEventListener('click', () => {
    openModal({ title: 'Add Payment', body: renderPaymentForm() });
    bindPaymentForm();
  });
}

function renderPaymentForm() {
  const state = getState();
  return `
    <form id="paymentForm" class="form-grid">
      ${inputField({ label: 'Payment Date', name: 'paymentDate', value: new Date().toISOString().slice(0, 10), type: 'date', required: true })}
      <label class="field"><span>Client *</span><select name="clientId" required><option value="">Select</option>${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })))}</select></label>
      <label class="field"><span>Project</span><select name="projectId"><option value="">Select</option>${optionList(state.projects.map((project) => ({ id: project.id, name: project.title })))}</select></label>
      <label class="field"><span>Invoice</span><select name="invoiceId"><option value="">Select</option>${optionList(state.invoices.map((invoice) => ({ id: invoice.id, name: invoice.invoiceNumber })))}</select></label>
      ${inputField({ label: 'Amount Received', name: 'amountReceived', value: 0, type: 'number', step: '0.01', min: '0', required: true })}
      ${inputField({ label: 'TDS Deducted', name: 'tdsDeducted', value: 0, type: 'number', step: '0.01', min: '0' })}
      ${selectField({ label: 'Payment Mode', name: 'paymentMode', options: PAYMENT_MODES, value: 'Bank Transfer' })}
      <label class="field"><span>Bank Account</span><select name="bankAccountId"><option value="">Select</option>${optionList(state.bankAccounts.map((account) => ({ id: account.id, name: account.bankName })))}</select></label>
      ${inputField({ label: 'Transaction ID', name: 'transactionId' })}
      ${textareaField({ label: 'Notes', name: 'notes', className: 'full-span' })}
      ${formActions('Add Payment')}
    </form>
  `;
}

function bindPaymentForm() {
  document.getElementById('paymentForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = getState();
    const data = readForm(event.currentTarget);
    const invoice = findById(state.invoices, data.invoiceId);
    if (invoice) {
      const due = getInvoiceDueAmount(invoice, state);
      const incoming = toNumber(data.amountReceived) + toNumber(data.tdsDeducted);
      if (!validatePaymentAmount(incoming, due) && !window.confirm('Payment is greater than current due. Continue?')) return;
    }

    addItem('payments', {
      id: uid('payment'),
      paymentDate: data.paymentDate,
      clientId: data.clientId,
      projectId: data.projectId,
      invoiceId: data.invoiceId,
      amountReceived: toNumber(data.amountReceived),
      tdsDeducted: toNumber(data.tdsDeducted),
      paymentMode: data.paymentMode,
      bankAccountId: data.bankAccountId,
      transactionId: data.transactionId,
      notes: data.notes
    });
    syncInvoiceStatuses();
    showToast('Payment added and invoice status updated.');
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function syncInvoiceStatuses() {
  const state = getState();
  state.invoices = state.invoices.map((invoice) => {
    const client = findById(state.clients, invoice.clientId);
    const total = calculateInvoiceTotals(invoice, invoice.items || [], state.settings, client).totalAmount;
    const paid = state.payments
      .filter((payment) => payment.invoiceId === invoice.id)
      .reduce((sum, payment) => sum + toNumber(payment.amountReceived) + toNumber(payment.tdsDeducted), 0);
    const status = paid <= 0 ? 'Sent' : paid < total ? 'Partially Paid' : 'Paid';
    return { ...invoice, status };
  });
  setState(state);
}

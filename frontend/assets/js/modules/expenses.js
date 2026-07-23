import { renderTable } from '../components/table.js';
import { checkboxField, inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { PAYMENT_MODES } from '../constants.js';
import { addItem, getState } from '../state.js';
import { calculateExpenseImpact } from '../utils/finance.js';
import { escapeHtml, findById, getMonthKey, optionList, readForm, showToast, toNumber, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate } from '../utils/formatters.js';
import { validateExpense } from '../utils/validators.js';

export function renderExpenses() {
  const state = getState();
  const month = new URLSearchParams(location.hash.split('?')[1] || '').get('month') || '';
  const expenses = month ? state.expenses.filter((expense) => getMonthKey(expense.expenseDate) === month) : state.expenses;

  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Expenses</h2>
          <p>Track vendor invoices, GST input credit, RCM, and client/project expense linkage.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-expense">Add Expense</button>
      </div>
      <div class="section-toolbar compact">
        <h3>Expense List</h3>
        <label class="field small-field"><span>Filter Month</span><input type="month" id="expenseMonthFilter" value="${month}"></label>
      </div>
      ${renderTable({
        rows: expenses,
        columns: [
          { label: 'Date', render: (expense) => formatDate(expense.expenseDate) },
          { label: 'Vendor', render: (expense) => escapeHtml(expense.vendor) },
          { label: 'Category', render: (expense) => escapeHtml(findById(state.masters.expenseCategories, expense.categoryId)?.name || '-') },
          { label: 'Before GST', align: 'right', render: (expense) => formatCurrencyINR(expense.amountBeforeGst) },
          { label: 'GST', align: 'right', render: (expense) => formatCurrencyINR(expense.gstAmount) },
          { label: 'Total', align: 'right', render: (expense) => formatCurrencyINR(expense.totalAmount) },
          { label: 'ITC', align: 'center', render: (expense) => expense.itcEligible ? 'Eligible' : 'No' }
        ],
        emptyTitle: 'No expenses',
        emptyMessage: 'Add expenses to calculate input GST and profit impact.'
      })}
    </section>
  `;
}

export function bindExpenses() {
  document.getElementById('expenseMonthFilter')?.addEventListener('change', (event) => {
    window.location.hash = event.target.value ? `#/expenses?month=${event.target.value}` : '#/expenses';
  });

  document.querySelector('[data-action="add-expense"]')?.addEventListener('click', () => {
    openModal({ title: 'Add Expense', body: renderExpenseForm() });
    bindExpenseForm();
  });
}

function renderExpenseForm() {
  const state = getState();
  return `
    <form id="expenseForm" class="form-grid">
      ${inputField({ label: 'Expense Date', name: 'expenseDate', value: new Date().toISOString().slice(0, 10), type: 'date', required: true })}
      ${inputField({ label: 'Vendor', name: 'vendor', required: true })}
      <label class="field"><span>Expense Category</span><select name="categoryId"><option value="">Select</option>${optionList(state.masters.expenseCategories.map((cat) => ({ id: cat.id, name: cat.name })))}</select></label>
      <label class="field"><span>Client</span><select name="clientId"><option value="">Select</option>${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })))}</select></label>
      <label class="field"><span>Project</span><select name="projectId"><option value="">Select</option>${optionList(state.projects.map((project) => ({ id: project.id, name: project.title })))}</select></label>
      ${inputField({ label: 'Amount Before GST', name: 'amountBeforeGst', value: 0, type: 'number', step: '0.01', min: '0', required: true })}
      ${inputField({ label: 'GST Rate', name: 'gstRate', value: 18, type: 'number', step: '0.01', min: '0' })}
      ${inputField({ label: 'Invoice Number', name: 'invoiceNumber' })}
      ${inputField({ label: 'Vendor GSTIN', name: 'vendorGstin' })}
      ${selectField({ label: 'Payment Mode', name: 'paymentMode', options: PAYMENT_MODES, value: 'Bank Transfer' })}
      <label class="field"><span>Bank Account</span><select name="bankAccountId"><option value="">Select</option>${optionList(state.bankAccounts.map((account) => ({ id: account.id, name: account.bankName })))}</select></label>
      ${inputField({ label: 'Attachment URL', name: 'attachmentUrl' })}
      ${checkboxField({ label: 'ITC Eligible', name: 'itcEligible', checked: true })}
      ${checkboxField({ label: 'RCM Applicable', name: 'rcmApplicable' })}
      ${textareaField({ label: 'Notes', name: 'notes', className: 'full-span' })}
      ${formActions('Add Expense')}
    </form>
  `;
}

function bindExpenseForm() {
  document.getElementById('expenseForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);
    const gstAmount = toNumber(data.amountBeforeGst) * toNumber(data.gstRate) / 100;
    const expense = {
      id: uid('expense'),
      expenseDate: data.expenseDate,
      vendor: data.vendor,
      categoryId: data.categoryId,
      clientId: data.clientId,
      projectId: data.projectId,
      amountBeforeGst: toNumber(data.amountBeforeGst),
      gstRate: toNumber(data.gstRate),
      gstAmount,
      totalAmount: toNumber(data.amountBeforeGst) + gstAmount,
      invoiceNumber: data.invoiceNumber,
      vendorGstin: String(data.vendorGstin || '').toUpperCase(),
      paymentMode: data.paymentMode,
      bankAccountId: data.bankAccountId,
      itcEligible: Boolean(data.itcEligible),
      rcmApplicable: Boolean(data.rcmApplicable),
      attachmentUrl: data.attachmentUrl,
      notes: data.notes
    };
    const errors = validateExpense(expense);
    if (errors.length) {
      window.alert(errors.join('\n'));
      return;
    }
    const impact = calculateExpenseImpact(expense);
    addItem('expenses', expense);
    showToast(`Expense added. Profit expense: ${formatCurrencyINR(impact.expenseAmount)}.`);
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

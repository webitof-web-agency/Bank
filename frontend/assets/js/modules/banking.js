import { renderTable } from '../components/table.js';
import { checkboxField, inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { TRANSACTION_TYPES } from '../constants.js';
import { addItem, getState } from '../state.js';
import { escapeHtml, findById, optionList, readForm, showToast, toNumber, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate } from '../utils/formatters.js';
import { reconcileBankTransactions, applyReconciliation } from '../utils/automation.js';

export function renderBanking() {
  const state = getState();
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <h2>Bank Accounts</h2>
        <button class="btn btn-primary" type="button" data-action="add-bank-account">Add Bank Account</button>
      </div>
      ${renderTable({
        rows: state.bankAccounts,
        columns: [
          { label: 'Bank', render: (account) => escapeHtml(account.bankName) },
          { label: 'Holder', render: (account) => escapeHtml(account.accountHolderName) },
          { label: 'Account', render: (account) => escapeHtml(account.accountNumber) },
          { label: 'IFSC', render: (account) => escapeHtml(account.ifsc) },
          { label: 'Opening', render: (account) => formatCurrencyINR(account.openingBalance) },
          { label: 'Primary', render: (account) => account.isPrimary ? 'Yes' : 'No' }
        ],
        emptyTitle: 'No bank accounts',
        emptyMessage: 'Add a bank account to link payments and expenses.'
      })}
    </section>
    <section class="page-section">
      <div class="section-toolbar">
        <h2>Bank Transactions</h2>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" type="button" data-action="reconcile-csv">Reconcile Statement (CSV)</button>
          <button class="btn btn-primary" type="button" data-action="add-bank-transaction">Add Transaction</button>
        </div>
      </div>
      ${renderTable({
        rows: state.bankTransactions,
        columns: [
          { label: 'Date', render: (txn) => formatDate(txn.date) },
          { label: 'Bank', render: (txn) => escapeHtml(findById(state.bankAccounts, txn.bankAccountId)?.bankName || '-') },
          { label: 'Type', render: (txn) => escapeHtml(txn.transactionType) },
          { label: 'Amount', render: (txn) => formatCurrencyINR(txn.amount) },
          { label: 'Notes', render: (txn) => escapeHtml(txn.notes || '-') }
        ],
        emptyTitle: 'No bank transactions',
        emptyMessage: 'Add transactions to track bank movement.'
      })}
    </section>
  `;
}

export function bindBanking() {
  document.querySelector('[data-action="add-bank-account"]')?.addEventListener('click', () => {
    openModal({ title: 'Add Bank Account', body: renderBankAccountForm() });
    bindBankAccountForm();
  });

  document.querySelector('[data-action="add-bank-transaction"]')?.addEventListener('click', () => {
    openModal({ title: 'Add Bank Transaction', body: renderBankTransactionForm() });
    bindBankTransactionForm();
  });

  document.querySelector('[data-action="reconcile-csv"]')?.addEventListener('click', () => {
    openReconciliationModal();
  });
}

function renderBankAccountForm() {
  return `
    <form id="bankAccountForm" class="form-grid">
      ${inputField({ label: 'Bank Name', name: 'bankName', required: true })}
      ${inputField({ label: 'Account Holder Name', name: 'accountHolderName', required: true })}
      ${inputField({ label: 'Account Number', name: 'accountNumber' })}
      ${inputField({ label: 'IFSC', name: 'ifsc' })}
      ${inputField({ label: 'Branch', name: 'branch' })}
      ${inputField({ label: 'Account Type', name: 'accountType', value: 'Current' })}
      ${inputField({ label: 'UPI ID', name: 'upiId' })}
      ${inputField({ label: 'Opening Balance', name: 'openingBalance', value: 0, type: 'number', step: '0.01' })}
      ${checkboxField({ label: 'Primary Account', name: 'isPrimary' })}
      ${formActions('Add Bank Account')}
    </form>
  `;
}

function renderBankTransactionForm() {
  const state = getState();
  return `
    <form id="bankTransactionForm" class="form-grid">
      ${inputField({ label: 'Date', name: 'date', value: new Date().toISOString().slice(0, 10), type: 'date', required: true })}
      <label class="field"><span>Bank Account</span><select name="bankAccountId"><option value="">Select</option>${optionList(state.bankAccounts.map((account) => ({ id: account.id, name: account.bankName })))}</select></label>
      ${selectField({ label: 'Transaction Type', name: 'transactionType', options: TRANSACTION_TYPES, value: 'Credit' })}
      ${inputField({ label: 'Amount', name: 'amount', value: 0, type: 'number', step: '0.01', min: '0' })}
      <label class="field"><span>Linked Client</span><select name="linkedClientId"><option value="">Select</option>${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })))}</select></label>
      <label class="field"><span>Linked Project</span><select name="linkedProjectId"><option value="">Select</option>${optionList(state.projects.map((project) => ({ id: project.id, name: project.title })))}</select></label>
      <label class="field"><span>Linked Invoice</span><select name="linkedInvoiceId"><option value="">Select</option>${optionList(state.invoices.map((invoice) => ({ id: invoice.id, name: invoice.invoiceNumber })))}</select></label>
      <label class="field"><span>Linked Expense</span><select name="linkedExpenseId"><option value="">Select</option>${optionList(state.expenses.map((expense) => ({ id: expense.id, name: `${expense.vendor} ${expense.invoiceNumber || ''}` })))}</select></label>
      ${textareaField({ label: 'Notes', name: 'notes', className: 'full-span' })}
      ${formActions('Add Transaction')}
    </form>
  `;
}

function bindBankAccountForm() {
  document.getElementById('bankAccountForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);
    addItem('bankAccounts', {
      id: uid('bank'),
      bankName: data.bankName,
      accountHolderName: data.accountHolderName,
      accountNumber: data.accountNumber,
      ifsc: String(data.ifsc || '').toUpperCase(),
      branch: data.branch,
      accountType: data.accountType,
      upiId: data.upiId,
      openingBalance: toNumber(data.openingBalance),
      isPrimary: Boolean(data.isPrimary)
    });
    showToast('Bank account added.');
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function bindBankTransactionForm() {
  document.getElementById('bankTransactionForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);
    addItem('bankTransactions', {
      id: uid('txn'),
      date: data.date,
      bankAccountId: data.bankAccountId,
      transactionType: data.transactionType,
      amount: toNumber(data.amount),
      linkedClientId: data.linkedClientId,
      linkedProjectId: data.linkedProjectId,
      linkedInvoiceId: data.linkedInvoiceId,
      linkedExpenseId: data.linkedExpenseId,
      notes: data.notes
    });
    showToast('Bank transaction added.');
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function openReconciliationModal() {
  const state = getState();
  const body = `
    <form id="reconcileForm" class="stacked-form">
      <div class="form-grid">
        <label class="field full-span">
          <span>Target Bank Account *</span>
          <select name="bankAccountId" required>
            <option value="">Select Account</option>
            ${optionList(state.bankAccounts.map((account) => ({ id: account.id, name: account.bankName })))}
          </select>
        </label>
        <label class="field full-span">
          <span>Bank Statement CSV Rows *</span>
          <span style="font-size: 11px; color: var(--color-muted); display: block; margin-top: 2px;">Format: Date (YYYY-MM-DD), Description/UTR, Credit Amount. Put one transaction per line.</span>
          <textarea name="csvContent" placeholder="2026-06-15, UTR-12345, 35000\n2026-06-18, UTR-99999, 15000" required style="font-family: monospace; font-size: 12px; min-height: 120px;"></textarea>
        </label>
      </div>
      <div id="reconciliationReview" style="margin-top: 16px;"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="scan-csv">Scan & Match Invoices</button>
        <button class="btn btn-primary" type="submit" id="btnApplyReconcile" disabled>Confirm Reconciliation (0)</button>
      </div>
    </form>
  `;

  openModal({
    title: 'Bank Statement Reconciliation (CSV)',
    body
  });

  const form = document.getElementById('reconcileForm');
  let matchedEntries = [];

  form.querySelector('[data-action="scan-csv"]')?.addEventListener('click', () => {
    const bankAccountId = form.querySelector('[name="bankAccountId"]').value;
    const csvContent = form.querySelector('[name="csvContent"]').value;
    if (!bankAccountId || !csvContent) {
      window.alert('Please select a bank account and paste CSV content.');
      return;
    }

    matchedEntries = reconcileBankTransactions(csvContent, bankAccountId);
    const reviewDiv = document.getElementById('reconciliationReview');
    const submitBtn = document.getElementById('btnApplyReconcile');

    if (!matchedEntries.length) {
      reviewDiv.innerHTML = `
        <div class="empty-state" style="min-height: 100px;">
          <h3>No matching unpaid invoices found</h3>
          <p>Double-check the credit amount, invoice balances, or transaction format.</p>
        </div>
      `;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Confirm Reconciliation (0)';
      return;
    }

    // Show matches in a clean table
    let rowsHtml = matchedEntries.map((match) => `
      <tr>
        <td>${escapeHtml(match.client?.companyName || match.client?.name)}</td>
        <td><strong>${escapeHtml(match.invoice.invoiceNumber)}</strong></td>
        <td>${escapeHtml(match.transaction.date)}</td>
        <td><code>${escapeHtml(match.transaction.description)}</code></td>
        <td style="color: var(--color-success); font-weight: 600;">₹${match.transaction.amount}</td>
      </tr>
    `).join('');

    reviewDiv.innerHTML = `
      <div class="table-wrap" style="margin-bottom: 16px; max-height: 250px; overflow-y: auto;">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Invoice</th>
              <th>Statement Date</th>
              <th>UTR/Description</th>
              <th>Matched Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    submitBtn.disabled = false;
    submitBtn.textContent = `Confirm Reconciliation (${matchedEntries.length})`;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const bankAccountId = form.querySelector('[name="bankAccountId"]').value;
    if (!matchedEntries.length) return;

    applyReconciliation(matchedEntries, bankAccountId);
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

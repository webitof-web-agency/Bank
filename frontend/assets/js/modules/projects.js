import { summaryGrid } from '../components/cards.js';
import { renderTable } from '../components/table.js';
import { inputField, selectField, textareaField, formActions } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { BILLING_TYPES, PROJECT_STATUSES } from '../constants.js';
import { addItem, deleteItem, getItem, getState, updateItem } from '../state.js';
import { calculateProjectSummary } from '../utils/finance.js';
import { escapeHtml, findById, optionList, readForm, showToast, toNumber, uid } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate, formatStatus } from '../utils/formatters.js';

export function renderProjects(params = {}) {
  const state = getState();
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Projects</h2>
          <p>Track project value, delivery status, client linkage, and profitability.</p>
        </div>
        <button class="btn btn-primary" type="button" data-action="add-project">Add Project</button>
      </div>
      ${summaryGrid([
        { label: 'Projects', value: state.projects.length },
        { label: 'Active', value: state.projects.filter((p) => p.status === 'Active').length },
        { label: 'Completed', value: state.projects.filter((p) => p.status === 'Completed').length },
        { label: 'Total Value', value: formatCurrencyINR(state.projects.reduce((sum, p) => sum + toNumber(p.value), 0)) }
      ])}
      ${renderTable({
        rows: state.projects,
        columns: [
          { label: 'Project', render: (project) => `<strong>${escapeHtml(project.title)}</strong><small>${escapeHtml(project.projectType || '')}</small>` },
          { label: 'Client', render: (project) => escapeHtml(findById(state.clients, project.clientId)?.companyName || '-') },
          { label: 'Value', render: (project) => formatCurrencyINR(project.value) },
          { label: 'Deadline', render: (project) => formatDate(project.deadline) },
          { label: 'Status', render: (project) => formatStatus(project.status) }
        ],
        rowActions: [
          { label: 'Summary', action: 'project-summary', icon: 'Sum' },
          { label: 'Edit', action: 'edit-project', icon: 'Edit' },
          { label: 'Delete', action: 'delete-project', icon: 'Del', className: 'danger' }
        ],
        emptyTitle: 'No projects',
        emptyMessage: 'Create a project and link it with clients, invoices, expenses, AMC, and renewals.'
      })}
      <div id="projectSummaryTarget"></div>
    </section>
  `;
}

export function bindProjects(params = {}) {
  if (params.mode === 'add') openProjectModal();
  if (params.mode === 'edit') openProjectModal(params.id);

  document.querySelector('[data-action="add-project"]')?.addEventListener('click', () => openProjectModal());

  document.querySelectorAll('[data-action="edit-project"]').forEach((button) => {
    button.addEventListener('click', () => openProjectModal(button.dataset.id));
  });
  document.querySelectorAll('[data-action="delete-project"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm('Delete this project?')) return;
      deleteItem('projects', button.dataset.id);
      showToast('Project deleted.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });
  document.querySelectorAll('[data-action="project-summary"]').forEach((button) => {
    button.addEventListener('click', () => {
      const state = getState();
      const project = getItem('projects', button.dataset.id);
      const summary = calculateProjectSummary(button.dataset.id, state);
      document.getElementById('projectSummaryTarget').innerHTML = `
        <section class="inline-summary">
          <h3>${escapeHtml(project.title)} Summary</h3>
          ${summaryGrid([
            { label: 'Invoice Total', value: formatCurrencyINR(summary.invoiceTotal) },
            { label: 'Revenue', value: formatCurrencyINR(summary.taxableRevenue) },
            { label: 'Output GST', value: formatCurrencyINR(summary.gstOutput) },
            { label: 'Outsourcing', value: formatCurrencyINR(summary.outsourcingExpense || 0) },
            { label: 'Commission', value: formatCurrencyINR(summary.commissionExpense || 0) },
            { label: 'Expense', value: formatCurrencyINR(summary.expenseAmount) },
            { label: 'Input GST', value: formatCurrencyINR(summary.inputGst) },
            { label: 'Profit', value: formatCurrencyINR(summary.profit), tone: summary.profit >= 0 ? 'success' : 'danger' }
          ])}
        </section>
      `;
    });
  });
}

function renderProjectForm(id = '') {
  const state = getState();
  const project = id ? getItem('projects', id) : {};
  if (id && !project) return '<section class="page-section"><h2>Project not found</h2></section>';

  return `
      <form id="projectForm" class="form-grid">
        <h3 class="form-section-title">Project Definition</h3>
        ${inputField({ label: 'Project Title', name: 'title', value: project.title, required: true, className: 'span-6' })}
        <div class="field span-6">
          <select name="clientId" id="f-clientId" required>
            <option value="" disabled hidden ${project.clientId ? '' : 'selected'}>Select Client</option>
            ${optionList(state.clients.map((client) => ({ id: client.id, name: client.companyName || client.name })), project.clientId)}
          </select>
          <label for="f-clientId">Client *</label>
        </div>
        ${inputField({ label: 'Project Type', name: 'projectType', value: project.projectType || 'Website Development', className: 'span-6' })}
        ${selectField({ label: 'Status', name: 'status', options: PROJECT_STATUSES, value: project.status || 'Active', className: 'span-3' })}
        ${selectField({ label: 'Billing Type', name: 'billingType', options: BILLING_TYPES, value: project.billingType || 'Fixed', className: 'span-3' })}
        
        <h3 class="form-section-title">Financial Details</h3>
        ${inputField({ label: 'Project Value', name: 'value', value: project.value || 0, type: 'number', step: '0.01', className: 'span-6' })}
        ${inputField({ label: 'Project Cost Estimate', name: 'costEstimate', value: project.costEstimate || 0, type: 'number', step: '0.01', className: 'span-6' })}
        
        <h3 class="form-section-title">Timeline & Notes</h3>
        ${inputField({ label: 'Start Date', name: 'startDate', value: project.startDate, type: 'date', className: 'span-6' })}
        ${inputField({ label: 'Deadline', name: 'deadline', value: project.deadline, type: 'date', className: 'span-6' })}
        ${textareaField({ label: 'Notes', name: 'notes', value: project.notes, rows: 2, className: 'span-12' })}
        ${formActions(id ? 'Update Project' : 'Save Project')}
      </form>
  `;
}

function openProjectModal(id = '') {
  openModal({
    title: id ? 'Edit Project' : 'Add Project',
    body: renderProjectForm(id)
  });
  bindProjectForm(id);
}

function bindProjectForm(id = '') {
  const form = document.getElementById('projectForm');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = normalizeProject(readForm(form), id);
    if (!data.title || !data.clientId) {
      window.alert('Project title and client are required.');
      return;
    }
    if (id) {
      updateItem('projects', id, data);
      showToast('Project updated.');
    } else {
      addItem('projects', data);
      showToast('Project added.');
    }
    closeModal();
    window.location.hash = '#/projects';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function normalizeProject(data, existingId = '') {
  return {
    id: existingId || uid('project'),
    title: data.title,
    clientId: data.clientId,
    projectType: data.projectType,
    value: toNumber(data.value),
    startDate: data.startDate,
    deadline: data.deadline,
    status: data.status || 'Active',
    billingType: data.billingType || 'Fixed',
    costEstimate: toNumber(data.costEstimate),
    notes: data.notes
  };
}

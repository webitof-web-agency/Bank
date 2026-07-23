import { renderTable } from '../components/table.js';
import { checkboxField, inputField, formActions, selectField } from '../components/formFields.js';
import { closeModal, openModal } from '../components/modal.js';
import { RENEWAL_CATEGORIES } from '../constants.js';
import { getState, setState } from '../state.js';
import { escapeHtml, readForm, showToast, toNumber, uid } from '../utils/helpers.js';

const MASTER_TABS = [
  { key: 'services', label: 'Services', route: '#/masters/services' },
  { key: 'expenses', label: 'Expense Categories', route: '#/masters/expenses' },
  { key: 'vendors', label: 'Vendors', route: '#/masters/vendors' },
  { key: 'renewal-providers', label: 'Renewal Providers', route: '#/masters/renewal-providers' },
  { key: 'amc-types', label: 'AMC Types', route: '#/masters/amc-types' },
  { key: 'billing-cycles', label: 'Billing Cycles', route: '#/masters/billing-cycles' },
  { key: 'tax-rates', label: 'Tax Rates', route: '#/masters/tax-rates' },
  { key: 'terms', label: 'Invoice Terms', route: '#/masters/terms' }
];

export function renderMasters(params = {}) {
  const active = params.section || 'services';
  return `
    <section class="page-section">
      <div class="section-toolbar">
        <div>
          <h2>Masters</h2>
          <p>Maintain reusable business masters for invoices, expenses, vendors, taxes, and terms.</p>
        </div>
      </div>
      <nav class="tabs">
        ${MASTER_TABS.map((tab) => `<a class="tab ${tab.key === active ? 'active' : ''}" href="${tab.route}">${tab.label}</a>`).join('')}
      </nav>
      ${renderMasterSection(active)}
    </section>
  `;
}

export function bindMasters(params = {}) {
  const active = params.section || 'services';
  document.querySelector('[data-action="add-master-record"]')?.addEventListener('click', () => {
    openModal({ title: `Add ${masterTitle(active)}`, body: renderMasterForm(active) });
    bindMasterForm(active);
  });
}

function bindMasterForm(active) {
  const form = document.getElementById('masterForm');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = getState();
    const data = readForm(form);

    if (active === 'services') {
      state.masters.services.push({
        id: uid('svc'),
        name: data.name,
        category: data.category,
        sac: data.sac,
        gstRate: toNumber(data.gstRate),
        unit: data.unit,
        defaultPrice: toNumber(data.defaultPrice),
        isRecurring: Boolean(data.isRecurring),
        isAmcService: Boolean(data.isAmcService),
        isActive: Boolean(data.isActive)
      });
    }
    if (active === 'expenses') {
      state.masters.expenseCategories.push({
        id: uid('exp-cat'),
        name: data.name,
        group: data.group,
        defaultGstRate: toNumber(data.defaultGstRate),
        itcEligible: Boolean(data.itcEligible),
        isActive: Boolean(data.isActive)
      });
    }
    if (active === 'vendors') {
      state.masters.vendors = state.masters.vendors || [];
      state.masters.vendors.push({
        id: uid('vendor'),
        name: data.name,
        gstin: String(data.gstin || '').toUpperCase(),
        state: data.state,
        isActive: Boolean(data.isActive)
      });
    }
    if (active === 'renewal-providers') {
      state.masters.renewalProviders = state.masters.renewalProviders || [];
      state.masters.renewalProviders.push({
        id: uid('provider'),
        name: data.name,
        type: data.type,
        isActive: Boolean(data.isActive)
      });
    }
    if (active === 'amc-types') {
      state.masters.amcTypes = state.masters.amcTypes || [];
      state.masters.amcTypes.push({
        id: uid('amc-type'),
        name: data.name,
        isActive: Boolean(data.isActive)
      });
    }
    if (active === 'billing-cycles') {
      state.masters.billingCycles = state.masters.billingCycles || [];
      state.masters.billingCycles.push({
        id: uid('cycle'),
        name: data.name,
        months: toNumber(data.months),
        isActive: Boolean(data.isActive)
      });
    }
    if (active === 'tax-rates') {
      state.masters.taxRates.push({
        id: uid('tax'),
        label: data.label,
        rate: toNumber(data.rate),
        isActive: Boolean(data.isActive)
      });
    }
    if (active === 'terms') {
      state.masters.invoiceTerms.push({
        id: uid('term'),
        title: data.title,
        text: data.text,
        isDefault: Boolean(data.isDefault)
      });
    }

    setState(state);
    showToast('Master record added.');
    closeModal();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function renderMasterSection(active) {
  const state = getState();
  if (active === 'expenses') {
    return `
      ${renderMasterToolbar(active)}
      ${renderTable({
        rows: state.masters.expenseCategories,
        columns: [
          { label: 'Name', render: (item) => escapeHtml(item.name) },
          { label: 'Group', render: (item) => escapeHtml(item.group) },
          { label: 'GST', render: (item) => `${item.defaultGstRate}%` },
          { label: 'ITC', render: (item) => item.itcEligible ? 'Yes' : 'No' },
          { label: 'Active', render: (item) => item.isActive ? 'Yes' : 'No' }
        ]
      })}
    `;
  }

  if (active === 'vendors') {
    return `
      ${renderMasterToolbar(active)}
      ${renderTable({
        rows: state.masters.vendors,
        columns: [
          { label: 'Vendor', render: (item) => escapeHtml(item.name) },
          { label: 'GSTIN', render: (item) => escapeHtml(item.gstin || '-') },
          { label: 'State', render: (item) => escapeHtml(item.state || '-') },
          { label: 'Active', render: (item) => item.isActive ? 'Yes' : 'No' }
        ]
      })}
    `;
  }

  if (active === 'tax-rates') {
    return `
      ${renderMasterToolbar(active)}
      ${renderTable({
        rows: state.masters.taxRates,
        columns: [
          { label: 'Label', render: (item) => escapeHtml(item.label) },
          { label: 'Rate', render: (item) => `${item.rate}%` },
          { label: 'Active', render: (item) => item.isActive ? 'Yes' : 'No' }
        ]
      })}
    `;
  }

  if (active === 'renewal-providers') {
    const providers = state.masters.renewalProviders || [];
    return `
      ${renderMasterToolbar(active)}
      ${renderTable({
        rows: providers,
        columns: [
          { label: 'Provider', render: (item) => escapeHtml(item.name) },
          { label: 'Type', render: (item) => escapeHtml(item.type || '-') },
          { label: 'Active', render: (item) => item.isActive ? 'Yes' : 'No' }
        ],
        emptyTitle: 'No providers',
        emptyMessage: 'Add providers for domain, hosting, and software renewals.'
      })}
    `;
  }

  if (active === 'amc-types') {
    const amcTypes = state.masters.amcTypes || [];
    return `
      ${renderMasterToolbar(active)}
      ${renderTable({
        rows: amcTypes,
        columns: [
          { label: 'AMC Type', render: (item) => escapeHtml(item.name) },
          { label: 'Active', render: (item) => item.isActive ? 'Yes' : 'No' }
        ],
        emptyTitle: 'No AMC types',
        emptyMessage: 'Add reusable AMC types for AMC records.'
      })}
    `;
  }

  if (active === 'billing-cycles') {
    const billingCycles = state.masters.billingCycles || [];
    return `
      ${renderMasterToolbar(active)}
      ${renderTable({
        rows: billingCycles,
        columns: [
          { label: 'Cycle', render: (item) => escapeHtml(item.name) },
          { label: 'Months', render: (item) => escapeHtml(item.months || '-') },
          { label: 'Active', render: (item) => item.isActive ? 'Yes' : 'No' }
        ],
        emptyTitle: 'No billing cycles',
        emptyMessage: 'Add reusable billing cycles for AMC billing.'
      })}
    `;
  }

  if (active === 'terms') {
    return `
      ${renderMasterToolbar(active)}
      ${renderTable({
        rows: state.masters.invoiceTerms,
        columns: [
          { label: 'Title', render: (item) => escapeHtml(item.title) },
          { label: 'Text', render: (item) => escapeHtml(item.text) },
          { label: 'Default', render: (item) => item.isDefault ? 'Yes' : 'No' }
        ]
      })}
    `;
  }

  return `
    ${renderMasterToolbar(active)}
    ${renderTable({
      rows: state.masters.services,
      columns: [
        { label: 'Service', render: (item) => escapeHtml(item.name) },
        { label: 'Category', render: (item) => escapeHtml(item.category) },
        { label: 'SAC / HSN', render: (item) => escapeHtml(item.sac) },
        { label: 'GST', render: (item) => `${item.gstRate}%` },
        { label: 'Price', render: (item) => `INR ${item.defaultPrice}` },
        { label: 'AMC', render: (item) => item.isAmcService ? 'Yes' : 'No' },
        { label: 'Active', render: (item) => item.isActive ? 'Yes' : 'No' }
      ]
    })}
  `;
}

function renderMasterToolbar(active) {
  return `
    <div class="section-toolbar compact">
      <h3>${masterTitle(active)}</h3>
      <button class="btn btn-primary" type="button" data-action="add-master-record">Add ${masterTitle(active)}</button>
    </div>
  `;
}

function masterTitle(active) {
  const titles = {
    services: 'Service',
    expenses: 'Expense Category',
    vendors: 'Vendor',
    'renewal-providers': 'Renewal Provider',
    'amc-types': 'AMC Type',
    'billing-cycles': 'Billing Cycle',
    'tax-rates': 'Tax Rate',
    terms: 'Invoice Term'
  };
  return titles[active] || 'Record';
}

function renderMasterForm(active) {
  if (active === 'expenses') {
    return `
      <form id="masterForm" class="form-grid">
        ${inputField({ label: 'Category Name', name: 'name', required: true })}
        ${inputField({ label: 'Group', name: 'group', value: 'Direct Cost' })}
        ${inputField({ label: 'Default GST Rate', name: 'defaultGstRate', value: 18, type: 'number', step: '0.01' })}
        ${checkboxField({ label: 'ITC Eligible', name: 'itcEligible', checked: true })}
        ${checkboxField({ label: 'Active', name: 'isActive', checked: true })}
        ${formActions('Add Category')}
      </form>
    `;
  }

  if (active === 'vendors') {
    return `
      <form id="masterForm" class="form-grid">
        ${inputField({ label: 'Vendor Name', name: 'name', required: true })}
        ${inputField({ label: 'GSTIN', name: 'gstin' })}
        ${inputField({ label: 'State', name: 'state' })}
        ${checkboxField({ label: 'Active', name: 'isActive', checked: true })}
        ${formActions('Add Vendor')}
      </form>
    `;
  }

  if (active === 'renewal-providers') {
    return `
      <form id="masterForm" class="form-grid">
        ${inputField({ label: 'Provider Name', name: 'name', required: true })}
        ${selectField({ label: 'Provider Type', name: 'type', options: RENEWAL_CATEGORIES, value: 'Domain' })}
        ${checkboxField({ label: 'Active', name: 'isActive', checked: true })}
        ${formActions('Add Provider')}
      </form>
    `;
  }

  if (active === 'amc-types') {
    return `
      <form id="masterForm" class="form-grid">
        ${inputField({ label: 'AMC Type', name: 'name', required: true })}
        ${checkboxField({ label: 'Active', name: 'isActive', checked: true })}
        ${formActions('Add AMC Type')}
      </form>
    `;
  }

  if (active === 'billing-cycles') {
    return `
      <form id="masterForm" class="form-grid">
        ${inputField({ label: 'Cycle Name', name: 'name', value: 'Monthly', required: true })}
        ${inputField({ label: 'Months', name: 'months', value: 1, type: 'number', min: '1' })}
        ${checkboxField({ label: 'Active', name: 'isActive', checked: true })}
        ${formActions('Add Billing Cycle')}
      </form>
    `;
  }

  if (active === 'tax-rates') {
    return `
      <form id="masterForm" class="form-grid">
        ${inputField({ label: 'Label', name: 'label', required: true })}
        ${inputField({ label: 'Rate', name: 'rate', value: 18, type: 'number', step: '0.01' })}
        ${checkboxField({ label: 'Active', name: 'isActive', checked: true })}
        ${formActions('Add Tax Rate')}
      </form>
    `;
  }

  if (active === 'terms') {
    return `
      <form id="masterForm" class="form-grid">
        ${inputField({ label: 'Title', name: 'title', required: true })}
        <label class="field full-span"><span>Terms Text</span><textarea name="text" rows="4"></textarea></label>
        ${checkboxField({ label: 'Default Term', name: 'isDefault' })}
        ${formActions('Add Term')}
      </form>
    `;
  }

  return `
    <form id="masterForm" class="form-grid">
      ${inputField({ label: 'Service Name', name: 'name', required: true })}
      ${inputField({ label: 'Service Category', name: 'category', value: 'Development' })}
      ${inputField({ label: 'SAC / HSN Code', name: 'sac', value: '998314' })}
      ${inputField({ label: 'Default GST Rate', name: 'gstRate', value: 18, type: 'number', step: '0.01' })}
      ${inputField({ label: 'Unit', name: 'unit', value: 'Project' })}
      ${inputField({ label: 'Default Price', name: 'defaultPrice', value: 0, type: 'number', step: '0.01' })}
      ${checkboxField({ label: 'Recurring', name: 'isRecurring' })}
      ${checkboxField({ label: 'AMC Service', name: 'isAmcService' })}
      ${checkboxField({ label: 'Active', name: 'isActive', checked: true })}
      ${formActions('Add Service')}
    </form>
  `;
}

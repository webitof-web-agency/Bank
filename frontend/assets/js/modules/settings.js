import { inputField, textareaField, formActions, checkboxField, selectField } from '../components/formFields.js';
import { GST_TAX_HEADS, INVOICE_TYPES, TDS_SECTIONS } from '../constants.js';
import { INDIAN_STATES } from '../data/states.js';
import { getState, setState } from '../state.js';
import { getGstStateCode } from '../utils/gst.js';
import { readForm, showToast, toNumber } from '../utils/helpers.js';

export function renderSettings() {
  const state = getState();
  const settings = state.settings;
  const company = settings.company || {};
  const gst = {
    autoDetectTax: true,
    enableCgst: true,
    enableSgst: true,
    enableUtgst: true,
    enableIgst: true,
    enableCess: false,
    ...(settings.gst || {})
  };
  return `
    <section class="page-section wide">
      <div class="section-toolbar">
        <div>
          <h2>Settings</h2>
          <p>Company, GST, invoice, bank, SMTP, email template, role, and branding settings.</p>
        </div>
      </div>
      <form id="settingsForm" class="stacked-form">
        <h3>Company Details</h3>
        <div class="form-grid">
          ${inputField({ label: 'Company Name', name: 'company.name', value: company.name, className: 'span-6' })}
          ${inputField({ label: 'Legal Name', name: 'company.legalName', value: company.legalName, className: 'span-6' })}
          ${inputField({ label: 'Logo URL', name: 'company.logoUrl', value: company.logoUrl, className: 'span-6' })}
          ${textareaField({ label: 'Registered Address', name: 'company.address', value: company.address, rows: 2, className: 'span-6' })}
          ${inputField({ label: 'City', name: 'company.city', value: company.city, className: 'span-4' })}
          ${selectField({ label: 'State', name: 'company.state', options: INDIAN_STATES, value: company.state || 'Chhattisgarh', className: 'span-4' })}
          ${inputField({ label: 'State Code', name: 'company.stateCode', value: company.stateCode || getGstStateCode(company.state, company.gstin), className: 'span-4' })}
          ${inputField({ label: 'Country', name: 'company.country', value: company.country || 'India', className: 'span-3' })}
          ${inputField({ label: 'Pincode', name: 'company.pincode', value: company.pincode, className: 'span-3' })}
          ${inputField({ label: 'GSTIN', name: 'company.gstin', value: company.gstin, className: 'span-3' })}
          ${inputField({ label: 'PAN', name: 'company.pan', value: company.pan, className: 'span-3' })}
          ${inputField({ label: 'CIN', name: 'company.cin', value: company.cin, className: 'span-4' })}
          ${inputField({ label: 'Udyam Registration', name: 'company.udyam', value: company.udyam, className: 'span-4' })}
          ${inputField({ label: 'ISO Certificate', name: 'company.iso', value: company.iso, className: 'span-4' })}
          ${inputField({ label: 'Email', name: 'company.email', value: company.email, type: 'email', className: 'span-4' })}
          ${inputField({ label: 'Phone', name: 'company.phone', value: company.phone, className: 'span-4' })}
          ${inputField({ label: 'Website', name: 'company.website', value: company.website, className: 'span-4' })}
        </div>

        <h3>Logo & Branding</h3>
        <div class="form-grid">
          ${inputField({ label: 'Primary Color', name: 'branding.primaryColor', value: settings.branding.primaryColor, type: 'color', className: 'span-6' })}
          ${inputField({ label: 'Accent Color', name: 'branding.accentColor', value: settings.branding.accentColor, type: 'color', className: 'span-6' })}
        </div>

        <h3>GST Settings</h3>
        <div class="form-grid">
          ${inputField({ label: 'Default GST Rate', name: 'gst.defaultRate', value: gst.defaultRate, type: 'number', step: '0.01', className: 'span-3' })}
          ${inputField({ label: 'CGST Rate', name: 'gst.cgstRate', value: gst.cgstRate ?? 9, type: 'number', step: '0.01', className: 'span-3' })}
          ${inputField({ label: 'SGST Rate', name: 'gst.sgstRate', value: gst.sgstRate ?? 9, type: 'number', step: '0.01', className: 'span-3' })}
          ${inputField({ label: 'IGST Rate', name: 'gst.igstRate', value: gst.igstRate ?? gst.defaultRate, type: 'number', step: '0.01', className: 'span-3' })}
          ${selectField({ label: 'Default Export Treatment', name: 'gst.defaultExportTreatment', options: INVOICE_TYPES.filter((item) => item.includes('Export')), value: gst.defaultExportTreatment || 'Export without payment of IGST under LUT', className: 'span-6' })}
          ${checkboxField({ label: 'GST Registered', name: 'gst.gstRegistered', checked: gst.gstRegistered, className: 'span-3' })}
          ${checkboxField({ label: 'Auto Detect GST Type', name: 'gst.autoDetectTax', checked: gst.autoDetectTax, className: 'span-3' })}
          ${checkboxField({ label: 'LUT Enabled for Exports/SEZ', name: 'gst.lutEnabled', checked: gst.lutEnabled, className: 'span-3' })}
          ${checkboxField({ label: 'Enable CGST', name: 'gst.enableCgst', checked: gst.enableCgst, className: 'span-3' })}
          ${checkboxField({ label: 'Enable SGST', name: 'gst.enableSgst', checked: gst.enableSgst, className: 'span-3' })}
          ${checkboxField({ label: 'Enable UTGST', name: 'gst.enableUtgst', checked: gst.enableUtgst, className: 'span-3' })}
          ${checkboxField({ label: 'Enable IGST', name: 'gst.enableIgst', checked: gst.enableIgst, className: 'span-3' })}
          ${checkboxField({ label: 'Enable CESS', name: 'gst.enableCess', checked: gst.enableCess, className: 'span-3' })}
          <div class="settings-note full-span">
            GST heads configured: ${GST_TAX_HEADS.join(', ')}. Invoice tax is auto-selected from company state, client place of supply, country, and invoice type.
          </div>
        </div>

        <h3>TDS & Compliance Settings</h3>
        <div class="form-grid">
          ${selectField({ label: 'Default Commission TDS Section', name: 'tds.commissionSection', options: TDS_SECTIONS, value: settings.tds?.commissionSection || '194H', className: 'span-4' })}
          ${inputField({ label: 'TDS 194H Rate', name: 'tds.commissionRate', value: settings.tds?.commissionRate ?? 2, type: 'number', step: '0.01', className: 'span-4' })}
          ${inputField({ label: 'Commission TDS Threshold', name: 'tds.commissionThreshold', value: settings.tds?.commissionThreshold ?? 15000, type: 'number', step: '0.01', className: 'span-4' })}
          ${textareaField({ label: 'Compliance Note', name: 'complianceNote', value: settings.complianceNote || '', rows: 2, className: 'span-12' })}
        </div>

        <h3>Invoice Settings</h3>
        <div class="form-grid">
          ${inputField({ label: 'Invoice Prefix', name: 'invoice.prefix', value: settings.invoice.prefix, className: 'span-3' })}
          ${inputField({ label: 'Next Sequence', name: 'invoice.nextSequence', value: settings.invoice.nextSequence, type: 'number', className: 'span-3' })}
          ${inputField({ label: 'Default Due Days', name: 'invoice.defaultDueDays', value: settings.invoice.defaultDueDays, type: 'number', className: 'span-3' })}
          ${inputField({ label: 'Signature Name', name: 'invoice.signatureName', value: settings.invoice.signatureName, className: 'span-3' })}
          ${textareaField({ label: 'Invoice Terms', name: 'invoice.terms', value: settings.invoice.terms, rows: 2, className: 'span-12' })}
        </div>

        <h3>Bank Details</h3>
        <div class="form-grid">
          ${inputField({ label: 'Bank Name', name: 'bank.bankName', value: settings.bank.bankName, className: 'span-6' })}
          ${inputField({ label: 'Account Holder', name: 'bank.accountHolder', value: settings.bank.accountHolder, className: 'span-6' })}
          ${inputField({ label: 'Account Number', name: 'bank.accountNumber', value: settings.bank.accountNumber, className: 'span-4' })}
          ${inputField({ label: 'IFSC', name: 'bank.ifsc', value: settings.bank.ifsc, className: 'span-4' })}
          ${inputField({ label: 'Branch', name: 'bank.branch', value: settings.bank.branch, className: 'span-4' })}
          ${inputField({ label: 'UPI ID', name: 'bank.upiId', value: settings.bank.upiId, className: 'span-12' })}
        </div>

        <h3>SMTP Settings</h3>
        <div class="form-grid">
          ${inputField({ label: 'SMTP Host', name: 'smtp.host', value: settings.smtp.host, className: 'span-3' })}
          ${inputField({ label: 'SMTP Port', name: 'smtp.port', value: settings.smtp.port, className: 'span-3' })}
          ${inputField({ label: 'SMTP Username', name: 'smtp.username', value: settings.smtp.username, className: 'span-3' })}
          ${inputField({ label: 'From Email', name: 'smtp.fromEmail', value: settings.smtp.fromEmail, className: 'span-3' })}
        </div>

        <h3>Email Templates</h3>
        <div class="form-grid">
          ${textareaField({ label: 'Invoice Email', name: 'emailTemplates.invoice', value: settings.emailTemplates.invoice, rows: 3, className: 'span-6' })}
          ${textareaField({ label: 'Payment Reminder', name: 'emailTemplates.paymentReminder', value: settings.emailTemplates.paymentReminder, rows: 3, className: 'span-6' })}
        </div>

        <h3>Roles & Permissions</h3>
        <div class="form-grid">
          ${textareaField({ label: 'Admin Permissions', name: 'roles.admin', value: settings.roles.admin.join(', '), rows: 2, className: 'span-4' })}
          ${textareaField({ label: 'Accountant Permissions', name: 'roles.accountant', value: settings.roles.accountant.join(', '), rows: 2, className: 'span-4' })}
          ${textareaField({ label: 'Sales Permissions', name: 'roles.sales', value: settings.roles.sales.join(', '), rows: 2, className: 'span-4' })}
        </div>
        ${formActions('Save Settings')}
      </form>
    </section>
  `;
}

export function bindSettings() {
  document.getElementById('settingsForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = getState();
    const data = readForm(event.currentTarget);
    Object.entries(data).forEach(([path, value]) => setDeep(state.settings, path, normalizeSettingValue(path, value)));
    state.settings.company.stateCode = getGstStateCode(state.settings.company.state, state.settings.company.gstin)
      || state.settings.company.stateCode;
    setState(state);
    showToast('Settings saved.');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function setDeep(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    cursor[part] = cursor[part] || {};
    cursor = cursor[part];
  });
  cursor[parts.at(-1)] = value;
}

function normalizeSettingValue(path, value) {
  if (path.includes('Rate') || path.includes('Sequence') || path.includes('DueDays') || path.includes('Threshold')) return toNumber(value);
  if (path.startsWith('roles.')) return String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (path.startsWith('gst.') && (path.endsWith('Enabled') || path.includes('enable') || path.endsWith('Registered') || path.endsWith('autoDetectTax'))) {
    return Boolean(value);
  }
  return value;
}

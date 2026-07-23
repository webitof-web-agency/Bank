import { calculateInvoiceTotals } from '../utils/finance.js';
import { escapeHtml, findById } from '../utils/helpers.js';
import { formatCurrencyINR, formatDate } from '../utils/formatters.js';

export function renderInvoicePreview(invoice, state) {
  if (!invoice) {
    return '<div class="empty-state"><h3>Invoice not found</h3></div>';
  }

  const client = findById(state.clients, invoice.clientId) || {};
  const project = findById(state.projects, invoice.projectId) || {};
  const totals = calculateInvoiceTotals(invoice, invoice.items || [], state.settings, client);
  const company = state.settings.company;
  const bank = state.settings.bank;
  const companyLegalIds = [
    company.gstin ? `GSTIN: ${escapeHtml(company.gstin)}` : '',
    company.pan ? `PAN: ${escapeHtml(company.pan)}` : '',
    company.cin ? `CIN: ${escapeHtml(company.cin)}` : '',
    company.udyam ? `Udyam: ${escapeHtml(company.udyam)}` : '',
    company.iso ? `ISO: ${escapeHtml(company.iso)}` : ''
  ].filter(Boolean).join(' | ');

  return `
    <section class="invoice-toolbar no-print">
      <a class="btn btn-secondary" href="#/invoices">Back</a>
      <button class="btn btn-primary" type="button" data-action="print-invoice">Print Invoice</button>
      <button class="btn btn-secondary" type="button" data-action="download-pdf-placeholder">Download PDF</button>
    </section>
    <article class="invoice-preview">
      <header class="invoice-header">
        <div class="invoice-company">
          <img src="${escapeHtml(company.logoUrl)}" alt="${escapeHtml(company.name)} logo">
          <div>
            <h2>${escapeHtml(company.legalName || company.name)}</h2>
            <p>${escapeHtml(company.address)}, ${escapeHtml(company.city)}, ${escapeHtml(company.state)} ${escapeHtml(company.pincode)}</p>
            <p>State Code: ${escapeHtml(company.stateCode || totals.companyStateCode || '-')}</p>
            <p>${companyLegalIds}</p>
            <p>${escapeHtml(company.email)} | ${escapeHtml(company.phone)}</p>
          </div>
        </div>
        <div class="invoice-meta">
          <h1>Tax Invoice</h1>
          <p><strong>No:</strong> ${escapeHtml(invoice.invoiceNumber)}</p>
          <p><strong>Date:</strong> ${formatDate(invoice.invoiceDate)}</p>
          <p><strong>Due:</strong> ${formatDate(invoice.dueDate)}</p>
          <p><strong>Status:</strong> ${escapeHtml(invoice.status)}</p>
        </div>
      </header>

      <section class="invoice-parties">
        <div>
          <h3>Bill To</h3>
          <p><strong>${escapeHtml(client.companyName || client.name)}</strong></p>
          <p>${escapeHtml(client.billingAddress || '')}</p>
          <p>${escapeHtml(client.state || '')}, ${escapeHtml(client.country || '')}</p>
          <p>State Code: ${escapeHtml(client.stateCode || totals.placeOfSupplyStateCode || '-')}</p>
          <p>GST Type: ${escapeHtml(client.gstRegistrationType || 'Unregistered')}</p>
          <p>GSTIN: ${escapeHtml(client.gstin || 'Unregistered')}</p>
        </div>
        <div>
          <h3>Invoice Details</h3>
          <p><strong>Project:</strong> ${escapeHtml(project.title || '-')}</p>
          <p><strong>Place of Supply:</strong> ${escapeHtml(totals.placeOfSupply || invoice.placeOfSupply || client.state || '-')}</p>
          <p><strong>Supply Type:</strong> ${escapeHtml(totals.supplyType || '-')}</p>
          <p><strong>GST Head:</strong> ${escapeHtml(formatGstType(totals.gstType))}</p>
          <p><strong>Invoice Type:</strong> ${escapeHtml(invoice.invoiceType)}</p>
          <p><strong>Amount Type:</strong> ${escapeHtml(invoice.amountType)}</p>
        </div>
      </section>

      <div class="invoice-table-wrap">
        <table class="invoice-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Service</th>
              <th>SAC / HSN</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Taxable</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>UTGST</th>
              <th>IGST</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${totals.items.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>
                  <strong>${escapeHtml(item.serviceName)}</strong>
                  <span>${escapeHtml(item.description || '')}</span>
                </td>
                <td>${escapeHtml(item.hsnSac || '')}</td>
                <td>${escapeHtml(item.qty)}</td>
                <td>${formatCurrencyINR(item.rate)}</td>
                <td>${formatCurrencyINR(item.taxableAmount)}</td>
                <td>${formatCurrencyINR(item.cgst)}</td>
                <td>${formatCurrencyINR(item.sgst)}</td>
                <td>${formatCurrencyINR(item.utgst)}</td>
                <td>${formatCurrencyINR(item.igst)}</td>
                <td>${formatCurrencyINR(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <section class="invoice-bottom">
        <div class="invoice-notes">
          <h3>Bank Details</h3>
          <p><strong>${escapeHtml(bank.bankName)}</strong></p>
          <p>A/C: ${escapeHtml(bank.accountNumber)} | IFSC: ${escapeHtml(bank.ifsc)}</p>
          <p>UPI: ${escapeHtml(bank.upiId)}</p>
          <h3>Terms</h3>
          <p>${escapeHtml(state.settings.invoice.terms)}</p>
        </div>
        <div class="invoice-totals">
          <p><span>Taxable Value</span><strong>${formatCurrencyINR(totals.taxableAmount)}</strong></p>
          <p><span>CGST</span><strong>${formatCurrencyINR(totals.cgst)}</strong></p>
          <p><span>SGST</span><strong>${formatCurrencyINR(totals.sgst)}</strong></p>
          <p><span>UTGST</span><strong>${formatCurrencyINR(totals.utgst)}</strong></p>
          <p><span>IGST</span><strong>${formatCurrencyINR(totals.igst)}</strong></p>
          <p><span>Total GST</span><strong>${formatCurrencyINR(totals.gstAmount)}</strong></p>
          <p class="grand-total"><span>Invoice Total</span><strong>${formatCurrencyINR(totals.totalAmount)}</strong></p>
        </div>
      </section>

      <footer class="invoice-signature">
        <div>
          <span>For ${escapeHtml(company.legalName || company.name)}</span>
          <strong>${escapeHtml(state.settings.invoice.signatureName)}</strong>
        </div>
      </footer>
    </article>
  `;
}

function formatGstType(gstType = '') {
  return String(gstType || 'NONE').replaceAll('_', ' + ');
}

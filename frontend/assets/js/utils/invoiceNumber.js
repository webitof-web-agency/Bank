import { getFinancialYear } from './helpers.js';

export function generateInvoiceNumber(settings, sequence, invoiceDate) {
  const prefix = settings?.invoice?.prefix || 'WEB';
  const financialYear = getFinancialYear(invoiceDate);
  return `${prefix}/${financialYear}/${String(sequence).padStart(3, '0')}`;
}

export function getNextInvoiceSequence(state) {
  const settingSequence = Number(state?.settings?.invoice?.nextSequence || 1);
  const maxExisting = (state?.invoices || []).reduce((max, invoice) => {
    const number = String(invoice.invoiceNumber || '').split('/').pop();
    const parsed = Number(number);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return Math.max(settingSequence, maxExisting + 1);
}

import { toNumber } from './helpers.js';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function validateRequired(data, fields) {
  return fields
    .filter((field) => !String(data[field] ?? '').trim())
    .map((field) => `${field} is required.`);
}

export function validateGstin(gstin) {
  if (!gstin) return true;
  return GSTIN_REGEX.test(String(gstin).trim().toUpperCase());
}

export function validatePan(pan) {
  if (!pan) return true;
  return PAN_REGEX.test(String(pan).trim().toUpperCase());
}

export function validateInvoice(invoice, items = []) {
  const errors = [];
  if (!invoice.clientId) errors.push('Client is required.');
  if (!items.length) errors.push('At least one invoice item is required.');
  if (invoice.invoiceDate && invoice.dueDate && invoice.dueDate < invoice.invoiceDate) {
    errors.push('Due date cannot be before invoice date.');
  }
  items.forEach((item, index) => {
    if (!item.description && !item.serviceName) errors.push(`Item ${index + 1} needs a service or description.`);
    if (toNumber(item.qty) <= 0) errors.push(`Item ${index + 1} quantity must be greater than zero.`);
    if (toNumber(item.rate) < 0) errors.push(`Item ${index + 1} rate cannot be negative.`);
    if (toNumber(item.gstRate) < 0) errors.push(`Item ${index + 1} GST rate cannot be negative.`);
  });
  return errors;
}

export function validateExpense(expense) {
  const errors = [];
  if (toNumber(expense.amountBeforeGst) < 0) errors.push('Expense amount cannot be negative.');
  if (toNumber(expense.gstRate) < 0) errors.push('GST rate cannot be negative.');
  return errors;
}

export function validatePaymentAmount(amount, dueAmount) {
  return toNumber(amount) <= toNumber(dueAmount);
}

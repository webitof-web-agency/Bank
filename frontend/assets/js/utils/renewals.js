import { findById, round2, today, toNumber } from './helpers.js';

export const RENEWAL_WARNING_DAYS = 30;

export function addYears(dateString, years = 1) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  date.setFullYear(date.getFullYear() + Math.max(0, toNumber(years, 1)));
  return date.toISOString().slice(0, 10);
}

export function daysUntil(dateString, fromDate = today()) {
  if (!dateString) return null;
  const target = new Date(dateString);
  const base = new Date(fromDate);
  if (Number.isNaN(target.getTime()) || Number.isNaN(base.getTime())) return null;
  return Math.ceil((target - base) / (1000 * 60 * 60 * 24));
}

export function getRenewalDate(record = {}) {
  return record.renewalDate || record.expiryDate || record.endDate || record.nextInvoiceDate || '';
}

export function getRenewalCategory(record = {}) {
  if (record.recordType === 'AMC' || record.amcType) return 'AMC';
  return record.category || record.renewalType || 'Renewal';
}

export function getRenewalTitle(record = {}) {
  return record.domainName
    || record.hostingName
    || record.softwareName
    || record.amcType
    || record.renewalType
    || record.provider
    || 'Renewal';
}

export function getRenewalProvider(record = {}) {
  return record.providerName || record.provider || record.domainProvider || record.hostingProvider || '-';
}

export function getRenewalAmount(record = {}) {
  return round2(record.renewalPrice ?? record.renewalCost ?? record.amcAmount ?? record.clientCharge ?? 0);
}

export function getComputedRenewalStatus(record = {}, compareDate = today()) {
  if (record.status === 'Cancelled') return 'Cancelled';
  const renewalDate = getRenewalDate(record);
  const remainingDays = daysUntil(renewalDate, compareDate);
  if (remainingDays === null) return record.status || 'Pending';
  if (remainingDays < 0) return 'Expired';
  if (remainingDays <= RENEWAL_WARNING_DAYS) return 'Due Soon';
  return record.status || 'Pending';
}

export function getRenewalTimelineItems(clientId, state) {
  const renewals = (state.renewals || []).filter((item) => String(item.clientId) === String(clientId));
  const amcs = (state.amcs || []).filter((item) => String(item.clientId) === String(clientId));
  const invoices = (state.invoices || []).filter((item) => item.sourceRenewalId || item.sourceAmcId);
  const expenses = (state.expenses || []).filter((item) => item.sourceRenewalId || item.sourceAmcId);

  const renewalEvents = renewals.flatMap((item) => {
    const category = getRenewalCategory(item);
    const title = getRenewalTitle(item);
    const provider = getRenewalProvider(item);
    return [
      item.purchaseDate ? {
        date: item.purchaseDate,
        title: `${category} purchased`,
        detail: `${title} via ${provider}`,
        amount: item.purchasePrice || item.renewalCost || 0
      } : null,
      getRenewalDate(item) ? {
        date: getRenewalDate(item),
        title: `${category} renewal due`,
        detail: `${title} renewal ${getComputedRenewalStatus(item).toLowerCase()}`,
        amount: getRenewalAmount(item)
      } : null
    ].filter(Boolean);
  });

  const amcEvents = amcs.flatMap((item) => [
    item.startDate ? {
      date: item.startDate,
      title: 'AMC started',
      detail: `${item.amcType || 'AMC'} ${item.billingCycle || ''}`,
      amount: item.amcAmount || 0
    } : null,
    item.nextInvoiceDate ? {
      date: item.nextInvoiceDate,
      title: 'AMC invoice due',
      detail: `${item.amcType || 'AMC'} next billing`,
      amount: item.amcAmount || 0
    } : null,
    item.endDate ? {
      date: item.endDate,
      title: 'AMC ends',
      detail: `${item.amcType || 'AMC'} ${getComputedRenewalStatus(item).toLowerCase()}`,
      amount: item.amcAmount || 0
    } : null
  ].filter(Boolean));

  const financeEvents = [
    ...invoices.filter((invoice) => String(findById(renewals, invoice.sourceRenewalId)?.clientId || invoice.clientId) === String(clientId)).map((invoice) => ({
      date: invoice.invoiceDate,
      title: 'Auto invoice created',
      detail: invoice.invoiceNumber,
      amount: invoice.items?.[0]?.total || invoice.items?.[0]?.rate || 0
    })),
    ...expenses.filter((expense) => String(findById(renewals, expense.sourceRenewalId)?.clientId || expense.clientId) === String(clientId)).map((expense) => ({
      date: expense.expenseDate,
      title: 'Auto expense created',
      detail: expense.vendor || expense.invoiceNumber || 'Expense',
      amount: expense.totalAmount || expense.amountBeforeGst || 0
    }))
  ];

  return [...renewalEvents, ...amcEvents, ...financeEvents]
    .filter((item) => item.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function collectRenewalRows(state) {
  const renewals = (state.renewals || []).map((item) => ({ ...item, recordType: 'Renewal' }));
  const amcs = (state.amcs || []).map((item) => ({
    ...item,
    recordType: 'AMC',
    category: 'AMC',
    renewalDate: item.nextInvoiceDate || item.endDate,
    renewalPrice: item.amcAmount
  }));
  return [...renewals, ...amcs].sort((a, b) => String(getRenewalDate(a)).localeCompare(String(getRenewalDate(b))));
}

export function getRenewalDashboard(state) {
  const rows = collectRenewalRows(state).filter((item) => getRenewalDate(item) && item.status !== 'Cancelled');
  const expired = rows.filter((item) => daysUntil(getRenewalDate(item)) < 0);
  const nearby = rows.filter((item) => {
    const remaining = daysUntil(getRenewalDate(item));
    return remaining !== null && remaining >= 0 && remaining <= RENEWAL_WARNING_DAYS;
  });
  const future = rows.filter((item) => {
    const remaining = daysUntil(getRenewalDate(item));
    return remaining !== null && remaining > RENEWAL_WARNING_DAYS;
  });

  return { expired, nearby, future, rows };
}

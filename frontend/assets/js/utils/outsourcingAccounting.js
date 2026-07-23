import { DEFAULT_GST_RATE } from '../constants.js';
import { findById, round2, sumBy, toNumber, today } from './helpers.js';

export function isVendorGstRegistered(vendor = {}) {
  return Boolean(vendor?.gstRegistered || vendor?.gstin);
}

export function calculateOutsourcingExpense(expense = {}, vendor = {}, settings = {}) {
  const baseAmount = round2(expense.baseAmount ?? expense.amountBeforeGst);
  const vendorRegistered = isVendorGstRegistered(vendor) || Boolean(expense.vendorGstRegistered);
  const gstApplicable = Boolean(expense.gstApplicable) && vendorRegistered;
  const gstRate = gstApplicable ? toNumber(expense.gstRate, settings?.gst?.defaultRate ?? DEFAULT_GST_RATE) : 0;
  const gstAmount = round2(baseAmount * gstRate / 100);
  const itcEligible = gstApplicable && expense.itcEligible !== false;

  return {
    baseAmount,
    gstApplicable,
    gstRate,
    gstAmount,
    totalAmount: round2(baseAmount + gstAmount),
    itcEligible,
    inputGst: itcEligible ? gstAmount : 0,
    expenseImpact: itcEligible ? baseAmount : round2(baseAmount + gstAmount)
  };
}

export function calculateLeadCommission(commission = {}, partner = {}, settings = {}) {
  const commissionBaseAmount = round2(commission.commissionBaseAmount);
  const commissionType = commission.commissionType || 'Percentage';
  const commissionPercentage = toNumber(commission.commissionPercentage);
  const fixedAmount = toNumber(commission.fixedAmount || commission.commissionAmount);
  const commissionAmount = commissionType === 'Fixed'
    ? round2(fixedAmount)
    : round2(commissionBaseAmount * commissionPercentage / 100);
  const gstRegistered = isVendorGstRegistered(partner) || Boolean(commission.gstRegistered);
  const gstRate = gstRegistered ? toNumber(commission.gstRate, settings?.gst?.defaultRate ?? DEFAULT_GST_RATE) : 0;
  const gstAmount = round2(commissionAmount * gstRate / 100);
  const grossPayable = round2(commissionAmount + gstAmount);
  const defaultTdsRate = settings?.tds?.commissionRate ?? 2;
  const threshold = toNumber(settings?.tds?.commissionThreshold, 0);
  const tdsApplicable = Boolean(commission.tdsApplicable ?? partner?.tdsApplicable) && commissionAmount >= threshold;
  const tdsRate = tdsApplicable ? toNumber(commission.tdsRate, defaultTdsRate) : 0;
  // TDS is legally deducted on the commission base amount, not on GST.
  const tdsAmount = round2(commissionAmount * tdsRate / 100);
  const netPayable = round2(grossPayable - tdsAmount);

  return {
    commissionBaseAmount,
    commissionType,
    commissionPercentage,
    commissionAmount,
    gstRegistered,
    gstRate,
    gstAmount,
    grossPayable,
    tdsApplicable,
    tdsSection: commission.tdsSection || partner?.defaultTdsSection || settings?.tds?.commissionSection || '194H',
    tdsRate,
    tdsAmount,
    netPayable,
    inputGst: gstRegistered && commission.itcEligible !== false ? gstAmount : 0,
    expenseImpact: commissionAmount
  };
}

export function getProjectTaxableValue(projectId, state) {
  return sumBy((state.invoices || []).filter((invoice) => String(invoice.projectId) === String(projectId)), (invoice) => (
    sumBy(invoice.items || [], (item) => item.taxableAmount || (toNumber(item.qty || 1) * toNumber(item.rate) - toNumber(item.discount)))
  ));
}

export function collectTdsRows(state = {}) {
  return (state.leadCommissions || [])
    .map((commission) => {
      const partner = findById(state.masters?.vendors || [], commission.partnerId) || {};
      const calculated = calculateLeadCommission(commission, partner, state.settings);
      if (!calculated.tdsApplicable || calculated.tdsAmount <= 0) return null;
      return {
        id: commission.id,
        vendorId: commission.partnerId,
        vendorName: partner.name || commission.partnerName || '-',
        pan: partner.pan || commission.partnerPan || '',
        section: calculated.tdsSection,
        baseAmount: calculated.commissionAmount,
        tdsRate: calculated.tdsRate,
        tdsAmount: calculated.tdsAmount,
        deductionDate: commission.commissionDate || commission.createdAt || today(),
        paymentDate: commission.paymentDate || '',
        depositStatus: commission.tdsDepositStatus || 'Not Deposited',
        challanNumber: commission.challanNumber || '',
        projectId: commission.projectId,
        sourceType: 'Lead Commission',
        sourceId: commission.id
      };
    })
    .filter(Boolean);
}

export function collectItcRows(state = {}) {
  const outsourceRows = (state.outsourcingExpenses || []).map((expense) => {
    const vendor = findById(state.masters?.vendors || [], expense.vendorId) || {};
    const calculated = calculateOutsourcingExpense(expense, vendor, state.settings);
    if (!calculated.itcEligible || calculated.gstAmount <= 0) return null;
    return {
      id: expense.id,
      vendorName: vendor.name || expense.vendorName || '-',
      gstin: vendor.gstin || expense.vendorGstin || '',
      invoiceNumber: expense.vendorInvoiceNumber || expense.id,
      invoiceDate: expense.expenseDate,
      taxableValue: calculated.baseAmount,
      cgst: round2(calculated.gstAmount / 2),
      sgst: round2(calculated.gstAmount / 2),
      igst: 0,
      totalGst: calculated.gstAmount,
      itcEligible: true,
      projectId: expense.projectId,
      remarks: expense.notes || 'Outsourcing vendor invoice'
    };
  });

  const commissionRows = (state.leadCommissions || []).map((commission) => {
    const partner = findById(state.masters?.vendors || [], commission.partnerId) || {};
    const calculated = calculateLeadCommission(commission, partner, state.settings);
    if (!calculated.gstRegistered || calculated.gstAmount <= 0) return null;
    return {
      id: commission.id,
      vendorName: partner.name || commission.partnerName || '-',
      gstin: partner.gstin || '',
      invoiceNumber: commission.invoiceNumber || commission.id,
      invoiceDate: commission.commissionDate || commission.createdAt || today(),
      taxableValue: calculated.commissionAmount,
      cgst: round2(calculated.gstAmount / 2),
      sgst: round2(calculated.gstAmount / 2),
      igst: 0,
      totalGst: calculated.gstAmount,
      itcEligible: true,
      projectId: commission.projectId,
      remarks: commission.notes || 'Referral partner commission invoice'
    };
  });

  return [...outsourceRows, ...commissionRows].filter(Boolean);
}

export function getPendingVendorPayables(state = {}) {
  const outsource = (state.outsourcingExpenses || []).filter((expense) => expense.paymentStatus !== 'Paid');
  const commissions = (state.leadCommissions || []).filter((commission) => commission.paymentStatus !== 'Paid');
  return { outsource, commissions };
}

import { calculateInvoiceTotals, calculateExpenseImpact, getInvoicePaidAmount } from './finance.js';
import { calculateLeadCommission, calculateOutsourcingExpense } from './outsourcingAccounting.js';
import { findById, round2, sumBy, toNumber } from './helpers.js';

export function calculateProjectProfitability(projectId, state = {}) {
  const invoices = (state.invoices || []).filter((invoice) => String(invoice.projectId) === String(projectId) && invoice.status !== 'Cancelled');
  const invoiceTotals = invoices.map((invoice) => calculateInvoiceTotals(
    invoice,
    invoice.items || [],
    state.settings,
    findById(state.clients || [], invoice.clientId)
  ));
  const outsourcingRows = (state.outsourcingExpenses || []).filter((expense) => String(expense.projectId) === String(projectId));
  const commissionRows = (state.leadCommissions || []).filter((commission) => String(commission.projectId) === String(projectId));
  const otherExpenses = (state.expenses || []).filter((expense) => String(expense.projectId) === String(projectId));

  const outsourcingImpacts = outsourcingRows.map((expense) => calculateOutsourcingExpense(
    expense,
    findById(state.masters?.vendors || [], expense.vendorId),
    state.settings
  ));
  const commissionImpacts = commissionRows.map((commission) => calculateLeadCommission(
    commission,
    findById(state.masters?.vendors || [], commission.partnerId),
    state.settings
  ));
  const otherExpenseImpacts = otherExpenses.map(calculateExpenseImpact);

  const salesTaxableValue = sumBy(invoiceTotals, (total) => total.taxableAmount);
  const gstCollected = sumBy(invoiceTotals, (total) => total.gstAmount);
  const totalInvoiceAmount = sumBy(invoiceTotals, (total) => total.totalAmount);
  const amountReceived = sumBy(invoices, (invoice) => getInvoicePaidAmount(invoice.id, state));
  const outsourcingBaseCost = sumBy(outsourcingImpacts, (impact) => impact.baseAmount);
  const commissionBaseCost = sumBy(commissionImpacts, (impact) => impact.commissionAmount);
  const otherBaseExpenses = sumBy(otherExpenseImpacts, (impact) => impact.expenseAmount);
  const vendorGstPaid = sumBy(outsourcingImpacts, (impact) => impact.gstAmount) + sumBy(commissionImpacts, (impact) => impact.gstAmount);
  const itcEligibleGst = sumBy(outsourcingImpacts, (impact) => impact.inputGst) + sumBy(commissionImpacts, (impact) => impact.inputGst) + sumBy(otherExpenseImpacts, (impact) => impact.inputGst);
  const tdsDeducted = sumBy(commissionImpacts, (impact) => impact.tdsAmount);
  const grossProfit = round2(salesTaxableValue - outsourcingBaseCost - commissionBaseCost - otherBaseExpenses);
  const profitPercent = salesTaxableValue > 0 ? round2(grossProfit * 100 / salesTaxableValue) : 0;

  return {
    projectId,
    salesTaxableValue,
    gstCollected,
    totalInvoiceAmount,
    amountReceived,
    pendingAmount: round2(totalInvoiceAmount - amountReceived),
    outsourcingBaseCost,
    commissionBaseCost,
    otherBaseExpenses,
    vendorGstPaid: round2(vendorGstPaid),
    itcEligibleGst: round2(itcEligibleGst),
    tdsDeducted: round2(tdsDeducted),
    grossProfit,
    profitPercent,
    outsourcingRows,
    commissionRows,
    otherExpenses
  };
}

export function calculatePortfolioProfitability(state = {}) {
  return (state.projects || []).map((project) => ({
    project,
    summary: calculateProjectProfitability(project.id, state)
  }));
}

export function calculateProjectPayableStatus(projectId, state = {}) {
  const summary = calculateProjectProfitability(projectId, state);
  const pendingOutsource = sumBy(summary.outsourcingRows.filter((item) => item.paymentStatus !== 'Paid'), (item) => toNumber(item.totalAmount || item.baseAmount));
  const pendingCommission = sumBy(summary.commissionRows.filter((item) => item.paymentStatus !== 'Paid'), (item) => toNumber(item.netPayable || item.grossPayable || item.commissionAmount));
  return {
    pendingClientReceivable: summary.pendingAmount,
    pendingVendorPayable: round2(pendingOutsource),
    pendingCommissionPayable: round2(pendingCommission)
  };
}

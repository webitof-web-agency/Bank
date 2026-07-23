import { GST_TYPES } from '../constants.js';
import { calculateExclusiveTax, calculateGstBreakdown, calculateInclusiveTax, getDefaultInvoiceTypeForClient } from './gst.js';
import { findById, getMonthKey, isDateWithinDays, round2, sumBy, toNumber } from './helpers.js';
import { getRenewalDate } from './renewals.js';
import { calculateLeadCommission, calculateOutsourcingExpense } from './outsourcingAccounting.js';

export function calculateInvoiceTotals(invoice, invoiceItems = [], companySettings = {}, client = {}) {
  const companyState = companySettings?.company?.state || companySettings?.state || 'Chhattisgarh';
  const companyCountry = companySettings?.company?.country || 'India';
  const companyGstin = companySettings?.company?.gstin || '';
  const gstRegistered = companySettings?.gst?.gstRegistered !== false;
  const lutEnabled = companySettings?.gst?.lutEnabled !== false;
  const autoDetectTax = companySettings?.gst?.autoDetectTax !== false;
  const amountType = invoice?.amountType || 'GST Extra';
  const placeOfSupply = invoice?.placeOfSupply || client?.placeOfSupply || client?.state || companyState;
  const invoiceType = autoDetectTax && invoice?.invoiceType === 'Regular'
    ? getDefaultInvoiceTypeForClient(client, companySettings)
    : invoice?.invoiceType || 'Regular';
  let invoiceContext = null;
  const rows = invoiceItems.map((item) => {
    const grossLineAmount = round2(toNumber(item.qty || 1) * toNumber(item.rate) - toNumber(item.discount));
    const rate = toNumber(item.gstRate);
    const previewGst = calculateGstBreakdown({
      taxableAmount: 0,
      gstRate: rate,
      companyState,
      companyCountry,
      companyGstin,
      clientState: client?.state,
      clientCountry: client?.country,
      clientGstin: client?.gstin,
      placeOfSupply,
      invoiceType,
      gstRegistered,
      lutEnabled
    });
    invoiceContext = invoiceContext || previewGst;
    const gstType = previewGst.gstType;
    const taxHeadEnabled = isTaxHeadEnabled(companySettings, gstType);
    const effectiveRate = gstType === GST_TYPES.NONE || !taxHeadEnabled ? 0 : rate;
    const baseTax = amountType === 'GST Inclusive'
      ? calculateInclusiveTax(grossLineAmount, effectiveRate)
      : calculateExclusiveTax(grossLineAmount, effectiveRate);
    const gst = calculateGstBreakdown({
      taxableAmount: baseTax.taxableAmount,
      gstRate: taxHeadEnabled ? rate : 0,
      companyState,
      companyCountry,
      companyGstin,
      clientState: client?.state,
      clientCountry: client?.country,
      clientGstin: client?.gstin,
      placeOfSupply,
      invoiceType,
      gstRegistered,
      lutEnabled
    });
    if (!taxHeadEnabled) {
      gst.gstType = GST_TYPES.NONE;
      gst.supplyType = `${previewGst.supplyType} - tax head disabled`;
      gst.reason = 'Matching GST head is disabled in GST settings.';
    }
    invoiceContext = gst;

    return {
      ...item,
      taxableAmount: gst.taxableAmount,
      cgst: gst.cgst,
      sgst: gst.sgst,
      utgst: gst.utgst,
      igst: gst.igst,
      gstAmount: gst.gstAmount,
      total: amountType === 'GST Inclusive' ? grossLineAmount : gst.totalAmount
    };
  });
  const context = invoiceContext || calculateGstBreakdown({
    taxableAmount: 0,
    gstRate: 0,
    companyState,
    companyCountry,
    companyGstin,
    clientState: client?.state,
    clientCountry: client?.country,
    clientGstin: client?.gstin,
    placeOfSupply,
    invoiceType,
    gstRegistered,
    lutEnabled
  });

  return {
    gstType: context.gstType,
    supplyType: context.supplyType,
    placeOfSupply: context.placeOfSupply,
    placeOfSupplyStateCode: context.placeOfSupplyStateCode,
    companyStateCode: context.companyStateCode,
    gstReason: context.reason,
    items: rows,
    taxableAmount: sumBy(rows, (item) => item.taxableAmount),
    cgst: sumBy(rows, (item) => item.cgst),
    sgst: sumBy(rows, (item) => item.sgst),
    utgst: sumBy(rows, (item) => item.utgst),
    igst: sumBy(rows, (item) => item.igst),
    gstAmount: sumBy(rows, (item) => item.gstAmount),
    totalAmount: sumBy(rows, (item) => item.total)
  };
}

export function getInvoicePaidAmount(invoiceId, state) {
  return sumBy(state.payments || [], (payment) => (
    String(payment.invoiceId) === String(invoiceId)
      ? toNumber(payment.amountReceived) + toNumber(payment.tdsDeducted)
      : 0
  ));
}

export function getInvoiceDueAmount(invoice, state) {
  const client = findById(state.clients, invoice.clientId);
  const totals = calculateInvoiceTotals(invoice, invoice.items || [], state.settings, client);
  return round2(totals.totalAmount - getInvoicePaidAmount(invoice.id, state));
}

export function calculateExpenseImpact(expense) {
  const amountBeforeGst = toNumber(expense.amountBeforeGst);
  const gstAmount = toNumber(expense.gstAmount);
  const totalAmount = toNumber(expense.totalAmount) || round2(amountBeforeGst + gstAmount);
  const inputGst = expense.itcEligible ? gstAmount : 0;
  const expenseAmount = expense.itcEligible ? amountBeforeGst : totalAmount;

  return {
    expenseAmount: round2(expenseAmount),
    inputGst: round2(inputGst),
    totalCashOut: round2(totalAmount)
  };
}

export function calculateClientSummary(clientId, state) {
  const invoices = (state.invoices || []).filter((invoice) => String(invoice.clientId) === String(clientId));
  const projects = (state.projects || []).filter((project) => String(project.clientId) === String(clientId));
  const payments = (state.payments || []).filter((payment) => String(payment.clientId) === String(clientId));
  const expenses = (state.expenses || []).filter((expense) => String(expense.clientId) === String(clientId));
  const outsourcingExpenses = (state.outsourcingExpenses || []).filter((expense) => String(expense.clientId) === String(clientId));
  const leadCommissions = (state.leadCommissions || []).filter((commission) => String(commission.clientId) === String(clientId));
  const amcs = (state.amcs || []).filter((amc) => String(amc.clientId) === String(clientId));
  const renewals = (state.renewals || []).filter((renewal) => String(renewal.clientId) === String(clientId));

  const invoiceTotals = invoices.map((invoice) => calculateInvoiceTotals(
    invoice,
    invoice.items || [],
    state.settings,
    findById(state.clients, invoice.clientId)
  ));
  const expenseImpacts = expenses.map(calculateExpenseImpact);
  const outsourcingImpacts = outsourcingExpenses.map((expense) => calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings));
  const commissionImpacts = leadCommissions.map((commission) => calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings));

  const totalTaxable = sumBy(invoiceTotals, (total) => total.taxableAmount);
  const totalExpense = sumBy(expenseImpacts, (impact) => impact.expenseAmount)
    + sumBy(outsourcingImpacts, (impact) => impact.expenseImpact)
    + sumBy(commissionImpacts, (impact) => impact.expenseImpact);

  return {
    totalProjects: projects.length,
    activeProjects: projects.filter((project) => project.status === 'Active').length,
    completedProjects: projects.filter((project) => project.status === 'Completed').length,
    totalInvoiceAmount: sumBy(invoiceTotals, (total) => total.totalAmount),
    totalTaxableAmount: totalTaxable,
    totalGstCharged: sumBy(invoiceTotals, (total) => total.gstAmount),
    totalReceived: sumBy(payments, (payment) => toNumber(payment.amountReceived) + toNumber(payment.tdsDeducted)),
    totalDue: sumBy(invoices, (invoice) => getInvoiceDueAmount(invoice, state)),
    totalClientExpenses: totalExpense,
    totalEligibleItc: sumBy(expenseImpacts, (impact) => impact.inputGst) + sumBy(outsourcingImpacts, (impact) => impact.inputGst) + sumBy(commissionImpacts, (impact) => impact.inputGst),
    totalProfitLoss: round2(totalTaxable - totalExpense),
    amcActive: amcs.filter((amc) => amc.status === 'Active').length,
    amcExpired: amcs.filter((amc) => amc.status === 'Expired').length,
    pendingRenewals: renewals.filter((renewal) => renewal.status === 'Pending').length
  };
}

export function calculateProjectSummary(projectId, state) {
  const invoices = (state.invoices || []).filter((invoice) => String(invoice.projectId) === String(projectId));
  const expenses = (state.expenses || []).filter((expense) => String(expense.projectId) === String(projectId));
  const outsourcingExpenses = (state.outsourcingExpenses || []).filter((expense) => String(expense.projectId) === String(projectId));
  const leadCommissions = (state.leadCommissions || []).filter((commission) => String(commission.projectId) === String(projectId));
  const invoiceTotals = invoices.map((invoice) => calculateInvoiceTotals(
    invoice,
    invoice.items || [],
    state.settings,
    findById(state.clients, invoice.clientId)
  ));
  const expenseImpacts = expenses.map(calculateExpenseImpact);
  const outsourcingImpacts = outsourcingExpenses.map((expense) => calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings));
  const commissionImpacts = leadCommissions.map((commission) => calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings));
  const totalExpense = sumBy(expenseImpacts, (impact) => impact.expenseAmount)
    + sumBy(outsourcingImpacts, (impact) => impact.expenseImpact)
    + sumBy(commissionImpacts, (impact) => impact.expenseImpact);
  const totalInputGst = sumBy(expenseImpacts, (impact) => impact.inputGst)
    + sumBy(outsourcingImpacts, (impact) => impact.inputGst)
    + sumBy(commissionImpacts, (impact) => impact.inputGst);

  return {
    invoiceTotal: sumBy(invoiceTotals, (total) => total.totalAmount),
    taxableRevenue: sumBy(invoiceTotals, (total) => total.taxableAmount),
    gstOutput: sumBy(invoiceTotals, (total) => total.gstAmount),
    expenseAmount: totalExpense,
    outsourcingExpense: sumBy(outsourcingImpacts, (impact) => impact.expenseImpact),
    commissionExpense: sumBy(commissionImpacts, (impact) => impact.expenseImpact),
    inputGst: totalInputGst,
    profit: round2(sumBy(invoiceTotals, (total) => total.taxableAmount) - totalExpense)
  };
}

export function calculateProfitLoss(state) {
  const invoiceTotals = (state.invoices || [])
    .filter((invoice) => invoice.status !== 'Cancelled')
    .map((invoice) => calculateInvoiceTotals(invoice, invoice.items || [], state.settings, findById(state.clients, invoice.clientId)));
  const expenseImpacts = (state.expenses || []).map(calculateExpenseImpact);
  const outsourcingImpacts = (state.outsourcingExpenses || []).map((expense) => calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings));
  const commissionImpacts = (state.leadCommissions || []).map((commission) => calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings));
  const revenue = sumBy(invoiceTotals, (total) => total.taxableAmount);
  const expense = sumBy(expenseImpacts, (impact) => impact.expenseAmount)
    + sumBy(outsourcingImpacts, (impact) => impact.expenseImpact)
    + sumBy(commissionImpacts, (impact) => impact.expenseImpact);

  return {
    revenue,
    expense,
    profit: round2(revenue - expense)
  };
}

export function calculateGstSummary(state) {
  const invoiceTotals = (state.invoices || [])
    .filter((invoice) => invoice.status !== 'Cancelled')
    .map((invoice) => calculateInvoiceTotals(invoice, invoice.items || [], state.settings, findById(state.clients, invoice.clientId)));
  const expenses = (state.expenses || []).map(calculateExpenseImpact);
  const outsourcing = (state.outsourcingExpenses || []).map((expense) => calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings));
  const commissions = (state.leadCommissions || []).map((commission) => calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings));
  const outputGst = sumBy(invoiceTotals, (total) => total.gstAmount);
  const inputGst = sumBy(expenses, (impact) => impact.inputGst) + sumBy(outsourcing, (impact) => impact.inputGst) + sumBy(commissions, (impact) => impact.inputGst);

  return {
    outputGst,
    inputGst,
    netGstPayable: round2(outputGst - inputGst),
    cgst: sumBy(invoiceTotals, (total) => total.cgst),
    sgst: sumBy(invoiceTotals, (total) => total.sgst),
    utgst: sumBy(invoiceTotals, (total) => total.utgst),
    igst: sumBy(invoiceTotals, (total) => total.igst)
  };
}

export function calculateLedgerSummary(state) {
  return (state.clients || []).map((client) => ({
    client,
    summary: calculateClientSummary(client.id, state)
  }));
}

export function calculateBalanceSheet(state) {
  const invoiceReceivable = sumBy(state.invoices || [], (invoice) => getInvoiceDueAmount(invoice, state));
  const bankOpening = sumBy(state.bankAccounts || [], (account) => account.openingBalance);
  const bankCredits = sumBy(state.bankTransactions || [], (txn) => txn.transactionType === 'Credit' ? txn.amount : 0);
  const bankDebits = sumBy(state.bankTransactions || [], (txn) => txn.transactionType === 'Debit' ? txn.amount : 0);
  const gst = calculateGstSummary(state);
  const profitLoss = calculateProfitLoss(state);

  return {
    assets: round2(invoiceReceivable + bankOpening + bankCredits - bankDebits),
    receivables: invoiceReceivable,
    bankBalance: round2(bankOpening + bankCredits - bankDebits),
    gstLiability: gst.netGstPayable,
    retainedEarnings: profitLoss.profit
  };
}

export function calculateDashboardMetrics(state) {
  const month = getMonthKey();
  const monthlyInvoices = (state.invoices || []).filter((invoice) => getMonthKey(invoice.invoiceDate) === month);
  const monthlyExpenses = (state.expenses || []).filter((expense) => getMonthKey(expense.expenseDate) === month);
  const monthlyOutsourcing = (state.outsourcingExpenses || []).filter((expense) => getMonthKey(expense.expenseDate) === month);
  const monthlyCommissions = (state.leadCommissions || []).filter((commission) => getMonthKey(commission.commissionDate || commission.createdAt) === month);
  const monthlySales = sumBy(monthlyInvoices, (invoice) => {
    const total = calculateInvoiceTotals(invoice, invoice.items || [], state.settings, findById(state.clients, invoice.clientId));
    return total.taxableAmount;
  });
  const monthlyExpense = sumBy(monthlyExpenses.map(calculateExpenseImpact), (impact) => impact.expenseAmount)
    + sumBy(monthlyOutsourcing.map((expense) => calculateOutsourcingExpense(expense, findById(state.masters?.vendors || [], expense.vendorId), state.settings)), (impact) => impact.expenseImpact)
    + sumBy(monthlyCommissions.map((commission) => calculateLeadCommission(commission, findById(state.masters?.vendors || [], commission.partnerId), state.settings)), (impact) => impact.expenseImpact);
  const gst = calculateGstSummary(state);

  return {
    totalClients: (state.clients || []).length,
    activeProjects: (state.projects || []).filter((project) => project.status === 'Active').length,
    monthlySales,
    monthlyExpense,
    monthlyProfit: round2(monthlySales - monthlyExpense),
    totalDue: sumBy(state.invoices || [], (invoice) => getInvoiceDueAmount(invoice, state)),
    gstPayable: gst.netGstPayable,
    amcExpiringSoon: (state.amcs || []).filter((amc) => isDateWithinDays(amc.endDate, 30)).length,
    renewalsExpiringSoon: (state.renewals || []).filter((renewal) => isDateWithinDays(getRenewalDate(renewal), 30)).length,
    pendingInvoices: (state.invoices || []).filter((invoice) => ['Sent', 'Partially Paid', 'Overdue'].includes(invoice.status)).length
  };
}

function isTaxHeadEnabled(settings = {}, gstType = GST_TYPES.NONE) {
  const gst = settings?.gst || {};
  if (gstType === GST_TYPES.IGST) return gst.enableIgst !== false;
  if (gstType === GST_TYPES.CGST_SGST) return gst.enableCgst !== false && gst.enableSgst !== false;
  if (gstType === GST_TYPES.CGST_UTGST) return gst.enableCgst !== false && gst.enableUtgst !== false;
  return true;
}

export function calculateDetailedProfitLoss(state) {
  const settings = state.settings || {};
  const invoices = state.invoices || [];
  const expenses = state.expenses || [];
  const outsourcingExpenses = state.outsourcingExpenses || [];
  const leadCommissions = state.leadCommissions || [];
  const clients = state.clients || [];
  const vendors = state.masters?.vendors || [];
  const categories = state.masters?.expenseCategories || [];

  // 1. Service Revenues (Sales)
  const salesRevenue = sumBy(
    invoices.filter((inv) => inv.status !== 'Cancelled'),
    (inv) => {
      const client = findById(clients, inv.clientId);
      return calculateInvoiceTotals(inv, inv.items || [], settings, client).taxableAmount;
    }
  );

  // 2. Direct Costs
  const outsourcingCost = sumBy(
    outsourcingExpenses,
    (exp) => {
      const vendor = findById(vendors, exp.vendorId);
      return calculateOutsourcingExpense(exp, vendor, settings).expenseImpact;
    }
  );

  const commissionCost = sumBy(
    leadCommissions,
    (comm) => {
      const partner = findById(vendors, comm.partnerId);
      return calculateLeadCommission(comm, partner, settings).expenseImpact;
    }
  );

  const totalDirectCosts = round2(outsourcingCost + commissionCost);
  const grossProfit = round2(salesRevenue - totalDirectCosts);

  // 3. Indirect General Expenses
  const groupedExpenses = {};
  expenses.forEach((exp) => {
    const impact = calculateExpenseImpact(exp);
    const category = findById(categories, exp.categoryId);
    const catName = category?.name || exp.categoryName || 'General Expenses';
    groupedExpenses[catName] = (groupedExpenses[catName] || 0) + impact.expenseAmount;
  });

  const indirectExpensesList = Object.keys(groupedExpenses).map((catName) => ({
    categoryName: catName,
    amount: round2(groupedExpenses[catName])
  }));

  const totalIndirectExpenses = round2(sumBy(indirectExpensesList, (item) => item.amount));
  const netProfit = round2(grossProfit - totalIndirectExpenses);

  return {
    salesRevenue: round2(salesRevenue),
    outsourcingCost: round2(outsourcingCost),
    commissionCost: round2(commissionCost),
    totalDirectCosts,
    grossProfit,
    indirectExpensesList,
    totalIndirectExpenses,
    netProfit
  };
}

export function calculateDetailedBalanceSheet(state) {
  const settings = state.settings || {};
  const invoices = state.invoices || [];
  const payments = state.payments || [];
  const expenses = state.expenses || [];
  const outsourcingExpenses = state.outsourcingExpenses || [];
  const leadCommissions = state.leadCommissions || [];
  const bankAccounts = state.bankAccounts || [];
  const bankTransactions = state.bankTransactions || [];
  const vendors = state.masters?.vendors || [];

  // Assets: Receivables (Sundry Debtors)
  const receivables = sumBy(invoices, (inv) => getInvoiceDueAmount(inv, state));

  // Assets: Bank Balances
  const bankDetails = bankAccounts.map((account) => {
    const opening = toNumber(account.openingBalance);
    const txns = bankTransactions.filter((t) => String(t.bankAccountId) === String(account.id));
    const credits = sumBy(txns, (t) => t.transactionType === 'Credit' ? toNumber(t.amount) : 0);
    const debits = sumBy(txns, (t) => t.transactionType === 'Debit' ? toNumber(t.amount) : 0);
    const balance = round2(opening + credits - debits);
    return {
      id: account.id,
      bankName: account.bankName,
      accountNumber: account.accountNumber || '-',
      balance
    };
  });
  const totalBankBalance = round2(sumBy(bankDetails, (b) => b.balance));

  // Assets & Liabilities: GST
  const gst = calculateGstSummary(state);
  const gstLiability = gst.netGstPayable > 0 ? gst.netGstPayable : 0;
  const gstItcReceivable = gst.netGstPayable < 0 ? -gst.netGstPayable : 0;

  // Liabilities: Sundry Creditors (Payables)
  const pendingOutsource = outsourcingExpenses
    .filter((exp) => exp.paymentStatus !== 'Paid')
    .map((exp) => {
      const vendor = findById(vendors, exp.vendorId);
      return calculateOutsourcingExpense(exp, vendor, settings).totalAmount;
    });
  const totalOutsourcePayable = sumBy(pendingOutsource, (val) => val);

  const pendingCommissions = leadCommissions
    .filter((comm) => comm.paymentStatus !== 'Paid')
    .map((comm) => {
      const partner = findById(vendors, comm.partnerId);
      return calculateLeadCommission(comm, partner, settings).netPayable;
    });
  const totalCommissionPayable = sumBy(pendingCommissions, (val) => val);

  const sundryCreditors = round2(totalOutsourcePayable + totalCommissionPayable);

  // Liabilities: TDS Payable (Not deposited yet)
  const tdsPayable = sumBy(
    leadCommissions.filter((comm) => comm.tdsDepositStatus !== 'Deposited'),
    (comm) => {
      const partner = findById(vendors, comm.partnerId);
      return calculateLeadCommission(comm, partner, settings).tdsAmount;
    }
  );

  const totalAssets = round2(receivables + totalBankBalance + gstItcReceivable);
  const totalLiabilities = round2(sundryCreditors + gstLiability + tdsPayable);

  // Equity
  const pl = calculateDetailedProfitLoss(state);
  const retainedEarnings = pl.netProfit;
  const proprietorCapital = round2(totalAssets - totalLiabilities - retainedEarnings);
  const totalEquity = round2(proprietorCapital + retainedEarnings);

  return {
    receivables: round2(receivables),
    bankDetails,
    totalBankBalance,
    gstLiability: round2(gstLiability),
    gstItcReceivable: round2(gstItcReceivable),
    sundryCreditors,
    tdsPayable: round2(tdsPayable),
    totalAssets,
    totalLiabilities,
    retainedEarnings,
    proprietorCapital,
    totalEquity,
    totalLiabilitiesAndEquity: round2(totalLiabilities + totalEquity)
  };
}

export function calculateMonthlyTrends(state) {
  const settings = state.settings || {};
  const invoices = state.invoices || [];
  const expenses = state.expenses || [];
  const outsourcingExpenses = state.outsourcingExpenses || [];
  const leadCommissions = state.leadCommissions || [];
  const clients = state.clients || [];
  const vendors = state.masters?.vendors || [];
  const bankAccounts = state.bankAccounts || [];
  const bankTransactions = state.bankTransactions || [];

  // Generate the last 6 months keys
  const months = [];
  const todayDate = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleString('default', { month: 'short' });
    months.push({ monthKey, monthLabel });
  }

  // Calculate starting bank balance at the beginning of the 6-month window
  const firstMonthKey = months[0].monthKey;
  const startYear = parseInt(firstMonthKey.split('-')[0]);
  const startMonth = parseInt(firstMonthKey.split('-')[1]);
  const windowStartDate = new Date(startYear, startMonth - 1, 1);

  const bankOpening = sumBy(bankAccounts, (acc) => toNumber(acc.openingBalance));
  const priorCredits = sumBy(
    bankTransactions.filter((t) => new Date(t.date) < windowStartDate),
    (t) => t.transactionType === 'Credit' ? toNumber(t.amount) : 0
  );
  const priorDebits = sumBy(
    bankTransactions.filter((t) => new Date(t.date) < windowStartDate),
    (t) => t.transactionType === 'Debit' ? toNumber(t.amount) : 0
  );
  let runningCash = bankOpening + priorCredits - priorDebits;

  // Process month-by-month
  return months.map(({ monthKey, monthLabel }) => {
    // 1. Invoices
    const monthInvoices = invoices.filter((inv) => inv.status !== 'Cancelled' && inv.invoiceDate && inv.invoiceDate.startsWith(monthKey));
    const sales = sumBy(monthInvoices, (inv) => {
      const client = findById(clients, inv.clientId);
      return calculateInvoiceTotals(inv, inv.items || [], settings, client).taxableAmount;
    });

    // 2. Expenses (General + Outsourcing + Commissions)
    const monthExpenses = expenses.filter((exp) => exp.expenseDate && exp.expenseDate.startsWith(monthKey));
    const monthOutsource = outsourcingExpenses.filter((exp) => exp.expenseDate && exp.expenseDate.startsWith(monthKey));
    const monthCommissions = leadCommissions.filter((comm) => {
      const d = comm.commissionDate || comm.createdAt;
      return d && d.startsWith(monthKey);
    });

    const expAmt = sumBy(monthExpenses.map(calculateExpenseImpact), (i) => i.expenseAmount);
    const outAmt = sumBy(monthOutsource, (exp) => {
      const vendor = findById(vendors, exp.vendorId);
      return calculateOutsourcingExpense(exp, vendor, settings).expenseImpact;
    });
    const commAmt = sumBy(monthCommissions, (comm) => {
      const partner = findById(vendors, comm.partnerId);
      return calculateLeadCommission(comm, partner, settings).expenseImpact;
    });
    const totalExpenses = round2(expAmt + outAmt + commAmt);

    // 3. Cash Flow Movement (Transactions in this month)
    const monthTxns = bankTransactions.filter((t) => t.date && t.date.startsWith(monthKey));
    const credits = sumBy(monthTxns, (t) => t.transactionType === 'Credit' ? toNumber(t.amount) : 0);
    const debits = sumBy(monthTxns, (t) => t.transactionType === 'Debit' ? toNumber(t.amount) : 0);
    runningCash = round2(runningCash + credits - debits);

    return {
      monthLabel,
      monthKey,
      sales: round2(sales),
      expenses: totalExpenses,
      cumulativeCash: runningCash
    };
  });
}

export function calculateExpenseCategoryDistribution(state) {
  const pl = calculateDetailedProfitLoss(state);
  const categories = [];

  if (pl.outsourcingCost > 0) {
    categories.push({ name: 'Outsourcing Payouts', amount: pl.outsourcingCost, colorClass: 'outsourcing' });
  }
  if (pl.commissionCost > 0) {
    categories.push({ name: 'Lead Commissions', amount: pl.commissionCost, colorClass: 'commission' });
  }

  pl.indirectExpensesList.forEach((item) => {
    if (item.amount > 0) {
      categories.push({ name: item.categoryName, amount: item.amount, colorClass: 'direct' });
    }
  });

  return categories;
}


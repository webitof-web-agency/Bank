import { getState, setState, addItem, updateItem } from '../state.js';
import { calculateInvoiceTotals, getInvoicePaidAmount } from './finance.js';
import { generateInvoiceNumber, getNextInvoiceSequence } from './invoiceNumber.js';
import { addDays, findById, today, uid, round2, showToast, toNumber } from './helpers.js';
import { getPlaceOfSupplyForClient, getDefaultInvoiceTypeForClient } from './gst.js';

// State Code Mapping for GSTIN parsing
const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
};

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  if (isNaN(d.getTime())) return today();
  return d.toISOString().slice(0, 10);
}

// 1. Check and Generate Recurring Invoices
export function checkAndGenerateRecurringInvoices() {
  const state = getState();
  if (!state || !state.invoices) return;

  const invoices = state.invoices;
  let stateChanged = false;
  const todayStr = today();

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    if (inv.isRecurring && inv.recurringInterval && inv.recurringInterval !== 'None') {
      let monthsToAdd = 0;
      if (inv.recurringInterval === 'Monthly') monthsToAdd = 1;
      else if (inv.recurringInterval === 'Quarterly') monthsToAdd = 3;
      else if (inv.recurringInterval === 'Yearly') monthsToAdd = 12;

      const nextDate = addMonths(inv.invoiceDate, monthsToAdd);
      
      if (todayStr >= nextDate) {
        // Generate new invoice
        const client = findById(state.clients, inv.clientId);
        const sequence = getNextInvoiceSequence(state);
        const nextInvoiceDate = nextDate;
        const newDueDate = addDays(nextInvoiceDate, state.settings.invoice.defaultDueDays);
        const newInvoiceNum = generateInvoiceNumber(state.settings, sequence, nextInvoiceDate);

        // Copy item IDs but generate new ones
        const newItems = inv.items.map(item => ({
          ...item,
          id: uid('item')
        }));

        const invoiceBase = {
          invoiceNumber: newInvoiceNum,
          invoiceDate: nextInvoiceDate,
          dueDate: newDueDate,
          clientId: inv.clientId,
          projectId: inv.projectId,
          placeOfSupply: inv.placeOfSupply,
          invoiceType: inv.invoiceType,
          amountType: inv.amountType
        };

        const totals = calculateInvoiceTotals(invoiceBase, newItems, state.settings, client);

        const newInvoice = {
          id: uid('invoice'),
          ...invoiceBase,
          status: 'Sent',
          notes: `Auto-generated recurring invoice from ${inv.invoiceNumber}`,
          items: totals.items,
          isRecurring: true,
          recurringInterval: inv.recurringInterval,
          recurringSourceId: inv.id
        };

        // Turn off recurring trigger on the old invoice
        inv.isRecurring = false;

        state.invoices.push(newInvoice);
        state.settings.invoice.nextSequence = sequence + 1;
        stateChanged = true;

        showToast(`Auto-generated recurring invoice ${newInvoiceNum} for ${client?.companyName || client?.name}.`);
      }
    }
  }

  if (stateChanged) {
    setState(state);
  }
}

// 2. Automated Payment Reminders
export function checkPaymentDueReminders() {
  const state = getState();
  if (!state || !state.invoices) return;

  state.sentReminders = state.sentReminders || [];
  const todayStr = today();
  let stateChanged = false;

  state.invoices.forEach((inv) => {
    if (inv.status === 'Sent' || inv.status === 'Partially Paid') {
      const client = findById(state.clients, inv.clientId);
      if (!client || !client.email) return;

      const dueDays = Math.round((new Date(inv.dueDate) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
      let type = '';

      if (dueDays === 3) type = 'due-soon';
      else if (dueDays === 0) type = 'due-today';
      else if (dueDays === -5) type = 'overdue';

      if (type) {
        // Prevent duplicate sending on the same day
        const alreadySent = state.sentReminders.some(
          (rem) => rem.invoiceId === inv.id && rem.date === todayStr && rem.type === type
        );

        if (!alreadySent) {
          // Simulate email send
          console.log(`[AUTOMATION] Email sent to ${client.email} for Invoice ${inv.invoiceNumber} (${type})`);
          showToast(`Reminder email sent to ${client.companyName || client.name} for Invoice ${inv.invoiceNumber}.`);

          state.sentReminders.push({
            invoiceId: inv.id,
            date: todayStr,
            type
          });
          stateChanged = true;
        }
      }
    }
  });

  if (stateChanged) {
    setState(state);
  }
}

// 3. GSTIN Auto-fill & Parse
export function parseGstinData(gstin) {
  const cleanGstin = String(gstin).trim().toUpperCase();
  if (cleanGstin.length < 15) return null;

  const stateCode = cleanGstin.slice(0, 2);
  const pan = cleanGstin.slice(2, 12);
  const state = GST_STATE_CODES[stateCode] || '';

  // Return parsed info plus simulated registration details
  return {
    state,
    stateCode,
    pan,
    legalName: `Simulated company for ${pan}`
  };
}

// 4. Reconcile Bank Transactions (CSV parser and matcher)
export function reconcileBankTransactions(csvText, bankAccountId) {
  const state = getState();
  const lines = csvText.split(/\r?\n/).map(line => line.split(','));
  const matches = [];

  // Parse lines to detect credit deposits
  // Expected Columns: Date, Description/UTR, Credit Amount
  lines.forEach((cols) => {
    if (cols.length < 3) return;
    const date = cols[0].trim();
    const desc = cols[1].trim();
    const creditVal = toNumber(cols[2]);

    if (creditVal <= 0 || isNaN(creditVal)) return;

    // Search invoices for exact matching unpaid balance
    state.invoices.forEach((inv) => {
      if (inv.status !== 'Paid') {
        const client = findById(state.clients, inv.clientId);
        const totals = calculateInvoiceTotals(inv, inv.items || [], state.settings, client);
        const paid = getInvoicePaidAmount(inv.id, state);
        const unpaid = round2(totals.totalAmount - paid);

        if (unpaid === creditVal) {
          matches.push({
            invoice: inv,
            client,
            transaction: {
              date,
              description: desc,
              amount: creditVal
            }
          });
        }
      }
    });
  });

  return matches;
}

// Apply confirmed matches to state
export function applyReconciliation(matches, bankAccountId) {
  const state = getState();
  let changeCount = 0;

  matches.forEach((match) => {
    const inv = state.invoices.find(i => i.id === match.invoice.id);
    if (!inv) return;

    const paymentId = uid('payment');
    const payment = {
      id: paymentId,
      paymentDate: today(),
      clientId: inv.clientId,
      projectId: inv.projectId,
      invoiceId: inv.id,
      amountReceived: match.transaction.amount,
      tdsDeducted: 0,
      paymentMode: 'Bank Transfer',
      bankAccountId: bankAccountId,
      transactionId: match.transaction.description, // UTR number
      notes: `Reconciled via CSV import. Statement Date: ${match.transaction.date}`
    };

    const txnId = uid('txn');
    const bankTxn = {
      id: txnId,
      date: today(),
      bankAccountId: bankAccountId,
      transactionType: 'Credit',
      amount: match.transaction.amount,
      linkedClientId: inv.clientId,
      linkedProjectId: inv.projectId,
      linkedInvoiceId: inv.id,
      notes: `Matched transaction UTR ${match.transaction.description} from statement.`
    };

    // Add payment and bank transaction
    state.payments.push(payment);
    state.bankTransactions.push(bankTxn);

    // Update invoice status to Paid
    inv.status = 'Paid';
    changeCount++;
  });

  if (changeCount > 0) {
    setState(state);
    showToast(`Successfully reconciled ${changeCount} transactions.`);
  }

  return changeCount;
}

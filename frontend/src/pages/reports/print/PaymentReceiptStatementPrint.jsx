import { TwoColumnBalancePrint } from './TwoColumnBalancePrint';
import { formatDMY, formatMoneyLegacy } from './printStyles';

// Legacy "Statement of Receipt And Payment Account" (ReportData 'INCOME AND
// EXPENSES'): rows come sorted from the backend, Profit & Loss A/c last on the
// expenditure side.
export function PaymentReceiptStatementPrint({ data, filters, headerActions }) {
  const receipts = Array.isArray(data?.receipts) ? data.receipts : [];
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const receiptTotal = data?.receiptTotal ?? receipts.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const paymentTotal = data?.paymentTotal ?? payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const asOn = formatDMY(data?.asOnDate || filters?.dateTo) || formatDMY(new Date());

  return (
    <TwoColumnBalancePrint
      headerActions={headerActions}
      title={`Statement of Receipt And Payment Account as on ${asOn}`}
      meta="Page 1 of 1"
      leftHeading="INCOME"
      rightHeading="EXPENDITURE"
      leftRows={receipts.map((row) => ({ label: row.ledgerName, amount: row.amount }))}
      rightRows={payments.map((row) => ({ label: row.ledgerName, amount: row.amount }))}
      leftTotalLabel="INCOME TOTAL :"
      rightTotalLabel="EXPENSES TOTAL :"
      leftTotal={receiptTotal}
      rightTotal={paymentTotal}
      format={formatMoneyLegacy}
      showSignatures
    />
  );
}

export default PaymentReceiptStatementPrint;

import { TwoColumnBalancePrint } from './TwoColumnBalancePrint';
import { formatDMY, formatMoney } from './printStyles';

function groupByParticulars(rows, field) {
  const totals = new Map();
  rows.forEach((row) => {
    const amount = Number(row[field] || 0);
    if (!amount) return;
    const label = row.particulars || 'Voucher';
    totals.set(label, (totals.get(label) || 0) + amount);
  });
  return [...totals.entries()].map(([label, amount]) => ({ label, amount }));
}

export function CashBookPrint({ data, filters, headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const txRows = rows.filter((row) => row.voucherNo !== 'OPENING');
  const openingRow = rows.find((row) => row.voucherNo === 'OPENING');

  const incomeRows = groupByParticulars(txRows, 'receipt');
  const expenseRows = groupByParticulars(txRows, 'payment');
  const totalIncome = incomeRows.reduce((sum, row) => sum + row.amount, 0);
  const totalExpense = expenseRows.reduce((sum, row) => sum + row.amount, 0);
  const openingCash = Number(openingRow?.balance || 0);
  const closingCash = rows.length ? Number(rows[rows.length - 1].balance || 0) : openingCash;
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());

  return (
    <TwoColumnBalancePrint
      headerActions={headerActions}
      title={`CASHBOOK AS ON ${asOn}`}
      leftHeading="INCOME (CREDIT)"
      rightHeading="EXPENSES (DEBIT)"
      leftRows={incomeRows}
      rightRows={expenseRows}
      leftTotalLabel="Total Income :"
      rightTotalLabel="Total Expenses :"
      leftTotal={totalIncome}
      rightTotal={totalExpense}
      footerExtra={
        <div className="mt-3 flex justify-between text-[12px] font-bold">
          <span>Opening Cash-In-Hand : {formatMoney(openingCash)}</span>
          <span>Closing Cash-In-Hand : {formatMoney(closingCash)}</span>
        </div>
      }
    />
  );
}

export default CashBookPrint;

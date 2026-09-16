import { TwoColumnBalancePrint } from './TwoColumnBalancePrint';
import { formatDMY, formatMoney } from './printStyles';

export function VoucherSummaryPrint({ data, filters, headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const creditRows = rows.filter((row) => Number(row.credit || 0) > 0);
  const debitRows = rows.filter((row) => Number(row.debit || 0) > 0);
  const totalCredit = creditRows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const totalDebit = debitRows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());

  return (
    <TwoColumnBalancePrint
      headerActions={headerActions}
      title={`Summary of Voucher's as on ${asOn}`}
      meta="Page 1 of 1"
      leftHeading="INCOME (CREDIT)"
      rightHeading="EXPENSES (DEBIT)"
      leftRows={creditRows.map((row) => ({ label: `${row.voucherCategory} (${row.count})`, amount: row.credit }))}
      rightRows={debitRows.map((row) => ({ label: `${row.voucherCategory} (${row.count})`, amount: row.debit }))}
      leftTotalLabel="Total Income :"
      rightTotalLabel="Total Expenses :"
      leftTotal={totalCredit}
      rightTotal={totalDebit}
      footerExtra={
        <div className="mt-3 text-right text-[12px] font-bold">
          Grand Total : {formatMoney(totalCredit + totalDebit)}
        </div>
      }
    />
  );
}

export default VoucherSummaryPrint;

import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, hasAmount } from './printStyles';
import { ShadowBox, CashTotalsFooter, dottedRow, bookHead, bookNum, bookText, bookDivider } from './LegacyBookParts';

// Legacy CrVchSummry.rpt, drawn with the same parts as the Cash Book and Day
// Book: INCOME / EXPENSES shadow labels over the Credit / Debit columns, one
// dotted row per voucher type (Credit | Total Vouchers | Type Of Vouchers |
// Debit) with column dividers, a totals row, then the Cash Book's boxed
// Total / Cash-In-Hand / Grand Total footer.
export function VoucherSummaryPrint({ data, filters, headerActions }) {
  const rows = (Array.isArray(data?.rows) ? data.rows : [])
    .filter((row) => hasAmount(row.credit, row.debit));
  const totalIncome = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const totalExpenses = rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const totalVouchers = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const openingCash = Number(data?.openingCash || 0);
  const closingCash = Number(data?.closingCash || 0);
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());
  const amount = (value) => (hasAmount(value) ? formatMoney(value) : '');

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title={`SUMMARY OF VOUCHER'S AS ON ${asOn}`} meta="Page 1 of 1" />

      <div className="mb-1 grid grid-cols-[9rem_7rem_1fr_9rem] items-end">
        <ShadowBox>Income</ShadowBox>
        <span className="col-span-2" />
        <ShadowBox>Expenses</ShadowBox>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black">
          <colgroup>
            <col className="w-[9rem]" />
            <col className="w-[7rem]" />
            <col />
            <col className="w-[9rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-black">
              <th className={bookHead}>Credit</th>
              <th className={`${bookHead} ${bookDivider}`}>Total Vouchers</th>
              <th className={`${bookHead} ${bookDivider} text-left`}>Type Of Vouchers</th>
              <th className={`${bookHead} ${bookDivider}`}>Debit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.voucherType} className={dottedRow}>
                <td className={bookNum}>{amount(row.credit)}</td>
                <td className={`${bookDivider} px-2 py-0.5 text-center text-[11px]`}>{row.count}</td>
                <td className={`${bookText} ${bookDivider}`}>{row.voucherType}</td>
                <td className={`${bookNum} ${bookDivider}`}>{amount(row.debit)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className={dottedRow}>
                <td colSpan={4} className="p-3 text-center text-[11px]">&nbsp;</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-black font-bold">
              <td className={bookNum}>{formatMoney(totalIncome)}</td>
              <td className={`${bookDivider} px-2 py-0.5 text-center text-[11px]`}>{totalVouchers}</td>
              <td className={`${bookDivider} px-2 py-0.5 text-center text-[11px]`}>&lt;= Total =&gt;</td>
              <td className={`${bookNum} ${bookDivider}`}>{formatMoney(totalExpenses)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <CashTotalsFooter
        formatMoney={formatMoney}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        openingCash={openingCash}
        closingCash={closingCash}
      />
    </PrintShell>
  );
}

export default VoucherSummaryPrint;

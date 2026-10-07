import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, hasAmount } from './printStyles';
import { ShadowBox, CashTotalsFooter, dottedRow } from './LegacyBookParts';

// Legacy CrCashBook.rpt look: INCOME / EXPENSES shadow labels over the
// CREDIT (Cash | Transfer | Total) and DEBIT (Cash | Transfer | Total) blocks
// either side of Particulars, dotted rows, a "<= Total =>" row, then boxed
// Total Income + Opening Cash-In-Hand = Grand Total against Total Expenses +
// Closing Cash-In-Hand = Grand Total.
export function CashBookPrint({ data, filters, headerActions }) {
  const rows = (Array.isArray(data?.rows) ? data.rows : [])
    .filter((row) => hasAmount(row.crCash, row.crTransfer, row.drCash, row.drTransfer));
  const sum = (field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  const crCash = sum('crCash');
  const crTransfer = sum('crTransfer');
  const drCash = sum('drCash');
  const drTransfer = sum('drTransfer');
  const totalIncome = crCash + crTransfer;
  const totalExpenses = drCash + drTransfer;
  const openingCash = Number(data?.openingCash || 0);
  const closingCash = Number(data?.closingCash || 0);
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());
  const amount = (value) => (hasAmount(value) ? formatMoney(value) : '');

  const num = 'px-2 py-0.5 text-right font-mono text-[11px]';
  const head = 'px-2 py-0.5 text-center text-[11px] font-bold';
  const divider = 'border-l border-black';

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title={`CASHBOOK AS ON ${asOn}`} meta="Page 1 of 1" />

      <div className="mb-1 flex items-end justify-between">
        <ShadowBox className="w-[36%]">Income</ShadowBox>
        <ShadowBox className="w-[36%]">Expenses</ShadowBox>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black">
          <colgroup>
            <col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[10%]" />
            <col />
            <col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-black">
              <th className={head} colSpan={3}>CREDIT</th>
              <th className={`${head} ${divider} text-left`} rowSpan={2}>Particulars</th>
              <th className={`${head} ${divider}`} colSpan={3}>DEBIT</th>
            </tr>
            <tr className="border-b border-black">
              <th className={head}>Cash</th>
              <th className={head}>Transfer</th>
              <th className={head}>Total</th>
              <th className={`${head} ${divider}`}>Cash</th>
              <th className={head}>Transfer</th>
              <th className={head}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ledgerCode} className={dottedRow}>
                <td className={num}>{amount(row.crCash)}</td>
                <td className={num}>{amount(row.crTransfer)}</td>
                <td className={num}>{amount(row.crCash + row.crTransfer)}</td>
                <td className={`${divider} px-2 py-0.5 text-left text-[11px]`}>{row.ledgerName}</td>
                <td className={`${num} ${divider}`}>{amount(row.drCash)}</td>
                <td className={num}>{amount(row.drTransfer)}</td>
                <td className={num}>{amount(row.drCash + row.drTransfer)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className={dottedRow}>
                <td colSpan={7} className="p-3 text-center text-[11px]">&nbsp;</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-black">
              <td className={num}>{formatMoney(crCash)}</td>
              <td className={num}>{formatMoney(crTransfer)}</td>
              <td className={num}>{formatMoney(totalIncome)}</td>
              <td className={`${divider} px-2 py-0.5 text-center text-[11px] font-bold`}>&lt;= Total =&gt;</td>
              <td className={`${num} ${divider}`}>{formatMoney(drCash)}</td>
              <td className={num}>{formatMoney(drTransfer)}</td>
              <td className={num}>{formatMoney(totalExpenses)}</td>
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

export default CashBookPrint;

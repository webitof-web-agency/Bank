import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, hasAmount } from './printStyles';
import { ShadowBox, dottedRow } from './LegacyBookParts';

// Legacy CrDayBook.rpt look — same family as the Cash Book: INCOME / EXPENSES
// shadow labels over the Credit / Debit columns, one dotted-separated row per
// voucher (Vch.No | Particulars: bold transaction heading when it changes,
// then cheque line / account / narration | Credit | Debit), column totals,
// then the boxed Total Income + B/F Cash-In-Hand = Grand Total against Total
// Expenses + C/F Cash-In-Hand = Grand Total.
export function DayBookPrint({ data, filters, headerActions }) {
  const vouchers = (Array.isArray(data?.vouchers) ? data.vouchers : [])
    .filter((voucher) => hasAmount(voucher.credit, voucher.debit));
  const totalIncome = vouchers.reduce((sum, v) => sum + Number(v.credit || 0), 0);
  const totalExpenses = vouchers.reduce((sum, v) => sum + Number(v.debit || 0), 0);
  const openingCash = Number(data?.openingCash || 0);
  const closingCash = Number(data?.closingCash || 0);
  const amount = (value) => (hasAmount(value) ? formatMoney(value) : '');

  const head = 'px-2 py-0.5 text-center text-[11px] font-bold';
  const num = 'px-2 py-0.5 text-right align-middle font-mono text-[11px]';
  const divider = 'border-l border-black';
  const box = 'border border-black px-2 py-0.5 text-[11px] font-bold';

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title={`DAYBOOK AS ON ${formatDMY(filters?.date) || formatDMY(new Date())}`} meta="" />

      <div className="mb-1 grid grid-cols-[4.5rem_1fr_8rem_8rem] items-end gap-x-1">
        <span className="col-span-2 pl-6 text-[11px]">Page 1 of 1</span>
        <ShadowBox>Income</ShadowBox>
        <ShadowBox>Expenses</ShadowBox>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black">
          <colgroup>
            <col className="w-[4.5rem]" />
            <col />
            <col className="w-[8rem]" />
            <col className="w-[8rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-black bg-slate-50">
              <th className={head}>Vch.No.</th>
              <th className={`${head} ${divider} text-left`}>Particulars</th>
              <th className={`${head} ${divider}`}>Credit</th>
              <th className={`${head} ${divider}`}>Debit</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher, i) => (
              <tr key={`${voucher.voucherNo}-${i}`} className={dottedRow}>
                <td className="px-2 py-0.5 text-center align-middle text-[11px] font-bold">{voucher.voucherNo}</td>
                <td className={`${divider} px-2 py-0.5 text-left text-[11px] leading-snug`}>
                  {voucher.heading ? <div className="font-bold">{voucher.heading}</div> : null}
                  {(voucher.lines || []).map((line, j) => <div key={j}>{line}</div>)}
                </td>
                <td className={`${num} ${divider}`}>{amount(voucher.credit)}</td>
                <td className={`${num} ${divider}`}>{amount(voucher.debit)}</td>
              </tr>
            ))}
            {vouchers.length === 0 && (
              <tr className={dottedRow}>
                <td colSpan={4} className="p-3 text-center text-[11px]">&nbsp;</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[1fr_8rem_8rem] text-[11px] font-bold">
        <span />
        <span className={num}>{formatMoney(totalIncome)}</span>
        <span className={num}>{formatMoney(totalExpenses)}</span>
      </div>

      <table className="mx-auto mt-3 border-collapse border-2 border-black text-[11px]">
        <tbody>
          <tr>
            <td className={box}>Total Income :</td><td className={`${box} text-right font-mono`}>{formatMoney(totalIncome)}</td>
            <td className={box}>Total Expenses :</td><td className={`${box} text-right font-mono`}>{formatMoney(totalExpenses)}</td>
          </tr>
          <tr>
            <td className={box}>B/F Cash-In-Hand :</td><td className={`${box} text-right font-mono`}>{formatMoney(openingCash)}</td>
            <td className={box}>C/F Cash-In-Hand :</td><td className={`${box} text-right font-mono`}>{formatMoney(closingCash)}</td>
          </tr>
          <tr>
            <td className={box}>Grand Total :</td><td className={`${box} text-right font-mono`}>{formatMoney(totalIncome + openingCash)}</td>
            <td className={box}>Grand Total :</td><td className={`${box} text-right font-mono`}>{formatMoney(totalExpenses + closingCash)}</td>
          </tr>
        </tbody>
      </table>
    </PrintShell>
  );
}

export default DayBookPrint;

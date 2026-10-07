// Visual pieces shared by the legacy-style Cash Book and Day Book prints
// (CrCashBook.rpt / CrDayBook.rpt): shadowed "INCOME"/"EXPENSES" labels,
// shadowed figure boxes, and dotted row separators instead of a full grid.

// Box with the legacy drop shadow (heavier right/bottom edge).
export function ShadowBox({ children, className = '' }) {
  return (
    <div className={`border border-black border-b-[3px] border-r-[3px] bg-white px-3 py-0.5 text-center text-[11px] font-bold uppercase ${className}`}>
      {children}
    </div>
  );
}

// Right-aligned money figure in a box; `strong` gets the drop shadow (Grand Total).
export function FigureBox({ children, strong = false }) {
  return (
    <div className={`border border-black bg-white px-2 py-0.5 text-right font-mono text-[12px] font-bold ${strong ? 'border-b-[3px] border-r-[3px]' : ''}`}>
      {children}
    </div>
  );
}

// Row separator used between detail rows.
export const dottedRow = 'border-b border-dotted border-slate-500';

// Shared cell styles so every legacy book print reads the same.
export const bookHead = 'px-2 py-0.5 text-center text-[11px] font-bold';
export const bookNum = 'px-2 py-0.5 text-right align-middle font-mono text-[11px]';
export const bookText = 'px-2 py-0.5 text-left text-[11px]';
export const bookDivider = 'border-l border-black';

// Footer used by the Cash Book and Voucher Summary: Total Income + Opening
// Cash-In-Hand = Grand Total against Total Expenses + Closing Cash-In-Hand =
// Grand Total, with "<= GRAND TOTAL =>" between the two grand totals.
export function CashTotalsFooter({ formatMoney, totalIncome, totalExpenses, openingCash, closingCash }) {
  return (
    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-4 whitespace-nowrap text-[11px] font-bold">
      <div className="grid grid-cols-[9rem_1fr] items-center gap-x-2 gap-y-1 pl-[6%]">
        <FigureBox>{formatMoney(totalIncome)}</FigureBox><span>&lt;= Total Income</span>
        <FigureBox>{formatMoney(openingCash)}</FigureBox><span>&lt;= Opening Cash-In-Hand</span>
        <FigureBox strong>{formatMoney(totalIncome + openingCash)}</FigureBox><span />
      </div>
      <div className="self-end pb-1">&lt;= GRAND TOTAL =&gt;</div>
      <div className="grid grid-cols-[1fr_9rem] items-center gap-x-2 gap-y-1 text-right">
        <span>Total Expenses =&gt;</span><FigureBox>{formatMoney(totalExpenses)}</FigureBox>
        <span>Closing Cash-In-Hand =&gt;</span><FigureBox>{formatMoney(closingCash)}</FigureBox>
        <span /><FigureBox strong>{formatMoney(totalExpenses + closingCash)}</FigureBox>
      </div>
    </div>
  );
}

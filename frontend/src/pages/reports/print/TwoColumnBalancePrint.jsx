import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, table, th, td, tdText } from './printStyles';

export function TwoColumnBalancePrint({
  title,
  meta,
  leftHeading,
  rightHeading,
  leftRows = [],
  rightRows = [],
  leftTotalLabel,
  rightTotalLabel,
  leftTotal,
  rightTotal,
  extraFooterLine,
  footerExtra,
  showSignatures = false,
  headerActions
}) {
  const rowCount = Math.max(leftRows.length, rightRows.length, 1);
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    left: leftRows[i] || null,
    right: rightRows[i] || null
  }));

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title={title} meta={meta} />

      <div className="overflow-x-auto">
      <table className={table}>
        <thead>
          <tr>
            <th className={`${th} text-left`}>{leftHeading}</th>
            <th className={th}>BALANCE</th>
            <th className={`${th} text-left`}>{rightHeading}</th>
            <th className={th}>BALANCE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className={tdText}>{row.left?.label || ''}</td>
              <td className={td}>{row.left ? formatMoney(row.left.amount) : ''}</td>
              <td className={tdText}>{row.right?.label || ''}</td>
              <td className={td}>{row.right ? formatMoney(row.right.amount) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className={tdText}>{leftTotalLabel}</td>
            <td className={td}>{formatMoney(leftTotal)}</td>
            <td className={tdText}>{rightTotalLabel}</td>
            <td className={td}>{formatMoney(rightTotal)}</td>
          </tr>
        </tfoot>
      </table>
      </div>

      {extraFooterLine ? <p className="mt-2 text-[12px] font-bold">{extraFooterLine}</p> : null}

      {footerExtra}

      {showSignatures ? (
        <div className="mt-14 flex justify-between text-[12px] font-bold">
          <span>Signature</span>
          <span>Computer Clerk</span>
          <span>Manager</span>
          <span>Chairman</span>
        </div>
      ) : null}
    </PrintShell>
  );
}

export default TwoColumnBalancePrint;

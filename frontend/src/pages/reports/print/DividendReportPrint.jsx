import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, th, td, tdText, tdCenter, table, formatDMY } from './printStyles';

export function DividendReportPrint({ data, filters, branches = [], headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const branchByCode = new Map(branches.map((b) => [b.code, b]));
  const firstRow = rows[0];
  const impliedRate = firstRow && Number(firstRow.shareTotal) ? (Number(firstRow.dividendTotal) / Number(firstRow.shareTotal)) * 100 : 0;
  const rate = Number(impliedRate.toFixed(2));
  const totals = rows.reduce(
    (acc, row) => ({
      share: acc.share + Number(row.shareTotal ?? row.share ?? 0),
      dividend: acc.dividend + Number(row.dividendTotal ?? row.dividendAmount ?? 0)
    }),
    { share: 0, dividend: 0 }
  );

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead
        title="Statement of dividend paid to member's (Branchwise summary Based on Opening Balance)"
        meta={`Date : ${formatDMY(new Date())}`}
      />

      <div className="overflow-x-auto">
      <table className={table}>
        <thead>
          <tr>
            <th className={th}>S.No.</th>
            <th className={th}>CODE</th>
            <th className={`${th} text-left`}>BRANCH</th>
            <th className={th}>MEMBER'S SHARE</th>
            <th className={th}>DIVIDEND AMT. AS ON {rate}%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const branchRow = branchByCode.get(row.branch);
            return (
              <tr key={row.branch || i}>
                <td className={tdCenter}>{i + 1}</td>
                <td className={tdCenter}>{row.branch || ''}</td>
                <td className={tdText}>{branchRow?.place || branchRow?.label || row.branch}</td>
                <td className={td}>{formatMoney(row.shareTotal ?? row.share)}</td>
                <td className={td}>{formatMoney(row.dividendTotal ?? row.dividendAmount)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="border border-black p-4 text-center text-[12px]">No dividend records found.</td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="font-bold">
              <td className={tdText} colSpan={3}></td>
              <td className={td}>{formatMoney(totals.share)}</td>
              <td className={td}>{formatMoney(totals.dividend)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      </div>

      <div className="mt-4 flex justify-between text-[12px] font-semibold">
        <span>SANCTION AMOUNT Rs. {formatMoney(totals.share)}</span>
        <span>TOWARDS Rs. {formatMoney(totals.dividend)}</span>
      </div>
      <p className="mt-1 text-right text-[12px] font-semibold">PAID ONLY.</p>

      <p className="mt-6 text-[12px]">Note : Please retuen this sheet after payment.</p>
      <p className="mt-10 text-right text-[12px] font-bold">Chairman/Vice Chairman</p>
    </PrintShell>
  );
}

export default DividendReportPrint;

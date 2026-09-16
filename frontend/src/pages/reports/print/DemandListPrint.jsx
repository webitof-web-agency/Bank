import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, th, td, tdText, tdCenter, table } from './printStyles';

export function DemandListPrint({ data, filters, branches = [], headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const branchRow = branches.find((b) => b.code === filters?.branchCode);
  const branchLabel = branchRow ? `${branchRow.label || branchRow.place || ''}` : 'All Branches';
  const monthNumber = Number(filters?.month || rows[0]?.month || 0);
  const year = filters?.year || (filters?.date ? filters.date.slice(0, 4) : '');
  const monthName = monthNumber >= 1 && monthNumber <= 12
    ? new Date(2000, monthNumber - 1, 1).toLocaleString('en-US', { month: 'long' }) + (year ? ` ${year}` : '')
    : '';

  const totals = rows.reduce(
    (acc, row) => ({
      cd: acc.cd + Number(row.cd || 0),
      ssa: acc.ssa + Number(row.ssa || 0),
      regularLoan: acc.regularLoan + Number(row.regularLoan || 0),
      loanAgainstDeposit: acc.loanAgainstDeposit + Number(row.loanAgainstDeposit || 0),
      other: acc.other + Number(row.other || 0),
      total: acc.total + Number(row.total || 0)
    }),
    { cd: 0, ssa: 0, regularLoan: 0, loanAgainstDeposit: 0, other: 0, total: 0 }
  );

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title={`DEMAND LIST FOR THE MONTH ${monthName.toUpperCase()}`} />

      <div className="mb-3 text-[12px]">
        <p>To,</p>
        <p>The Branch Manager,</p>
        <p>Jila Sahakari Kendriya Bank Maryadit,</p>
        <p>Branch : {branchLabel}</p>
      </div>

      <div className="overflow-x-auto">
      <table className={table}>
        <thead>
          <tr>
            <th className={th}>SNo</th>
            <th className={th}>Code</th>
            <th className={`${th} text-left`}>Member's Name</th>
            <th className={th}>Designation</th>
            <th className={th}>Contribution</th>
            <th className={th}>SSA</th>
            <th className={th}>Loan</th>
            <th className={th}>D.Loan</th>
            <th className={th}>Other</th>
            <th className={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.memberCode}-${i}`}>
              <td className={tdCenter}>{i + 1}</td>
              <td className={tdCenter}>{row.memberCode}</td>
              <td className={tdText}>{row.memberName}</td>
              <td className={tdText}>{row.designation}</td>
              <td className={td}>{formatMoney(row.cd)}</td>
              <td className={td}>{formatMoney(row.ssa)}</td>
              <td className={td}>{formatMoney(row.regularLoan)}</td>
              <td className={td}>{formatMoney(row.loanAgainstDeposit)}</td>
              <td className={td}>{formatMoney(row.other)}</td>
              <td className={td}>{formatMoney(row.total)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="border border-black p-4 text-center text-[12px]">No demand records found.</td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="font-bold">
              <td className={tdText} colSpan={4}>Total</td>
              <td className={td}>{formatMoney(totals.cd)}</td>
              <td className={td}>{formatMoney(totals.ssa)}</td>
              <td className={td}>{formatMoney(totals.regularLoan)}</td>
              <td className={td}>{formatMoney(totals.loanAgainstDeposit)}</td>
              <td className={td}>{formatMoney(totals.other)}</td>
              <td className={td}>{formatMoney(totals.total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      </div>

      <div className="mt-14 flex justify-between text-[12px] font-bold">
        <span>Signature</span>
        <span>Computer Clerk</span>
        <span>Manager</span>
      </div>
    </PrintShell>
  );
}

export default DemandListPrint;

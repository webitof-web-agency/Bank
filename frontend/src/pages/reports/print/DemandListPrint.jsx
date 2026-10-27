import { PrintShell, PrintLetterhead } from './PrintShell';
import { SignatureRow } from './LegacyBookParts';
import { formatMoney, hasAmount, th, td, tdText, tdCenter, table } from './printStyles';

// Amount cells: one line, never spilling over the cell border.
const money = `${td} whitespace-nowrap`;
// The grand totals run to 12 characters: a size smaller, so they stay inside
// their cells.
const totalMoney = `${money} !px-1 !text-[9.5px]`;

export function DemandListPrint({ data, filters, branches = [], headerActions }) {
  const rows = (Array.isArray(data) ? data : [])
    .filter((row) => hasAmount(row.cd, row.ssa, row.regularLoan, row.loanAgainstDeposit, row.other, row.total));
  const branchRow = branches.find((b) => b.code === filters?.branchCode);
  const branchLabel = branchRow ? `${branchRow.label || ''}` : 'All Branches';
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
      total: acc.total + Number(row.total || 0),
      recovered: acc.recovered + Number(row.recovered || 0),
      pending: acc.pending + Number(row.pending || 0)
    }),
    { cd: 0, ssa: 0, regularLoan: 0, loanAgainstDeposit: 0, other: 0, total: 0, recovered: 0, pending: 0 }
  );

  return (
    // Landscape, as twelve columns don't fit a portrait sheet: name and
    // designation get room, amounts stay on one line (like the old list).
    <PrintShell headerActions={headerActions} landscape>
      <PrintLetterhead title={`DEMAND LIST FOR THE MONTH ${monthName.toUpperCase()}`} />

      <div className="mb-3 text-[12px]">
        <p>To,</p>
        <p>The Branch Manager,</p>
        <p>Jila Sahakari Kendriya Bank Maryadit,</p>
        <p>Branch : {branchLabel}</p>
      </div>

      <div className="overflow-x-auto">
      <table className={table}>
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '19%' }} />
          <col style={{ width: '12%' }} />
          {Array.from({ length: 8 }, (_, i) => <col key={i} style={{ width: '7.5%' }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className={`${th} whitespace-nowrap`}>SNo</th>
            <th className={`${th} whitespace-nowrap`}>Code</th>
            <th className={`${th} text-left`}>Member's Name</th>
            <th className={`${th} whitespace-nowrap`}>Designation</th>
            <th className={`${th} whitespace-nowrap`}>Contribution</th>
            <th className={`${th} whitespace-nowrap`}>SSA</th>
            <th className={`${th} whitespace-nowrap`}>Loan</th>
            <th className={`${th} whitespace-nowrap`}>D.Loan</th>
            <th className={`${th} whitespace-nowrap`}>Other</th>
            <th className={`${th} whitespace-nowrap`}>Total</th>
            <th className={`${th} whitespace-nowrap`}>Recovered</th>
            <th className={`${th} whitespace-nowrap`}>Pending</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.memberCode}-${i}`}>
              <td className={tdCenter}>{i + 1}</td>
              <td className={tdCenter}>{row.memberCode}</td>
              <td className={tdText}>{row.memberName}</td>
              <td className={tdText}>{row.designation}</td>
              <td className={money}>{formatMoney(row.cd)}</td>
              <td className={money}>{formatMoney(row.ssa)}</td>
              <td className={money}>{formatMoney(row.regularLoan)}</td>
              <td className={money}>{formatMoney(row.loanAgainstDeposit)}</td>
              <td className={money}>{formatMoney(row.other)}</td>
              <td className={money}>{formatMoney(row.total)}</td>
              <td className={money}>{formatMoney(row.recovered)}</td>
              <td className={`${money} ${Number(row.pending) > 0 ? 'font-bold text-red-700' : ''}`}>{formatMoney(row.pending)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className="border border-black p-4 text-center text-[12px]">No demand records found.</td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="font-bold">
              <td className={tdText} colSpan={4}>Total</td>
              <td className={totalMoney}>{formatMoney(totals.cd)}</td>
              <td className={totalMoney}>{formatMoney(totals.ssa)}</td>
              <td className={totalMoney}>{formatMoney(totals.regularLoan)}</td>
              <td className={totalMoney}>{formatMoney(totals.loanAgainstDeposit)}</td>
              <td className={totalMoney}>{formatMoney(totals.other)}</td>
              <td className={totalMoney}>{formatMoney(totals.total)}</td>
              <td className={totalMoney}>{formatMoney(totals.recovered)}</td>
              <td className={totalMoney}>{formatMoney(totals.pending)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      </div>

      <SignatureRow />
    </PrintShell>
  );
}

export default DemandListPrint;

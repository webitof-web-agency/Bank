import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, hasAmount, table, th, td, tdText } from './printStyles';

const GROUPS = ['share', 'specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'];
// Legacy's TOTAL box: one line per head (Share last), amount unsigned.
const TOTAL_ROWS = [
  ['specialDeposit', 'SPECIAL DEPOSIT'],
  ['compulsoryDeposit', 'COMPULSORY DEPOSIT'],
  ['loan', 'LOAN'],
  ['loanAgainstDeposit', 'LOAN AGAINST DEPOSIT'],
  ['share', 'SHARE TOTAL AMOUNT']
];

function signedTotal(rows, group) {
  return rows.reduce((sum, row) => {
    const bucket = row?.[group];
    if (!bucket) return sum;
    const signed = bucket.side === 'DR' ? -Number(bucket.amount || 0) : Number(bucket.amount || 0);
    return sum + signed;
  }, 0);
}

function cell(bucket) {
  if (!bucket) return '-';
  return `${formatMoney(bucket.amount)} ${bucket.side}`;
}

export function MembersOpeningBalancePrint({ data, filters, headerActions }) {
  const rows = (Array.isArray(data) ? data : [])
    .filter((row) => hasAmount(...GROUPS.map((g) => row?.[g]?.amount)));
  const totals = Object.fromEntries(GROUPS.map((g) => [g, signedTotal(rows, g)]));

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title={`STATEMENT OF MEMBERS OPENING BALANCE AS ON ${formatDMY(filters?.dateFrom || new Date())}`} meta="Page 1 of 1" />

      <div className="overflow-x-auto">
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Code</th>
              <th className={`${th} text-left`}>Member's Name</th>
              <th className={th}>Share</th>
              <th className={th}>Special Deposit</th>
              <th className={th}>Compulsory Deposit</th>
              <th className={th}>Loan</th>
              <th className={th}>Loan Against Deposit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.memberCode}>
                <td className={tdText}>{row.memberCode}</td>
                <td className={tdText}>{row.memberName}</td>
                <td className={td}>{cell(row.share)}</td>
                <td className={td}>{cell(row.specialDeposit)}</td>
                <td className={td}>{cell(row.compulsoryDeposit)}</td>
                <td className={td}>{cell(row.loan)}</td>
                <td className={td}>{cell(row.loanAgainstDeposit)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="border border-black p-4 text-center text-[12px]">No members found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 ml-auto w-[420px] max-w-full">
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>TOTAL</th>
                <th className={th}>BALANCE</th>
              </tr>
            </thead>
            <tbody>
              {TOTAL_ROWS.map(([g, label]) => (
                <tr key={g}>
                  <td className={`${tdText} font-bold`}>{label}</td>
                  <td className={`${td} font-bold`}>{formatMoney(Math.abs(totals[g]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PrintShell>
  );
}

export default MembersOpeningBalancePrint;

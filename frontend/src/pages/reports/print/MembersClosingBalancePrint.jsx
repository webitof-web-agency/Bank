import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, hasAmount, thTight as th, tdTight as td, tdTextTight as tdText, table as totalTable, th as totalTh, td as totalTd, tdText as totalTdText } from './printStyles';

const INTEREST_GROUPS = ['specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'];
const TOTAL_LABELS = {
  specialDeposit: 'SPECIAL DEPOSIT',
  compulsoryDeposit: 'COMPULSORY DEPOSIT',
  loan: 'LOAN',
  loanAgainstDeposit: 'LOAN AGAINST DEPOSIT'
};
const signed = (amount, side) => (side === 'DR' ? -Number(amount || 0) : Number(amount || 0));

function formatMny(val) {
  return val === 0 || val == null ? '-' : formatMoney(val);
}

// Total = balance + signed interest; a negative one (a nil balance with a
// negative legacy interest, e.g. FY 2025-26 member 1004's LAD) prints on the
// other side, as legacy shows "1.00 CR" under a DR head.
function formatTotal(bucket) {
  const total = Number(bucket?.total || 0);
  const side = total < 0 ? (bucket?.side === 'DR' ? 'CR' : 'DR') : bucket?.side;
  return `${formatMoney(Math.abs(total))}${side ? ` ${side}` : ''}`;
}

export function MembersClosingBalancePrint({ data, filters, headerActions }) {
  const rows = (Array.isArray(data) ? data : []).filter((row) => hasAmount(
    row.share?.amount,
    ...['specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'].flatMap((g) => [row[g]?.balance, row[g]?.interest])
  ));

  // Legacy's closing TOTAL box: each head's balance and interest summed over
  // (interest summed signed, as legacy does — rows print it unsigned)
  // every member (amounts unsigned), then the share total.
  const totals = Object.fromEntries(INTEREST_GROUPS.map((g) => [g, {
    balance: Math.abs(rows.reduce((sum, row) => sum + signed(row[g]?.balance, row[g]?.side), 0)),
    interest: rows.reduce((sum, row) => sum + Number(row[g]?.interest || 0), 0)
  }]));
  const shareTotal = Math.abs(rows.reduce((sum, row) => sum + signed(row.share?.amount, row.share?.side), 0));

  return (
    <PrintShell headerActions={headerActions} landscape>
      <PrintLetterhead title={`STATEMENT OF MEMBERS CLOSING BALANCE AS ON ${formatDMY(filters?.dateTo || new Date())}`} meta="Page 1 of 1" />

      <div>
        <table className="w-full border-collapse border border-black text-[9px]">
          <thead>
            <tr>
              <th className={th} rowSpan={2}>CODE</th>
              <th className={th} rowSpan={2}>MEMBER'S NAME</th>
              <th className={th} rowSpan={2}>SHARE</th>
              <th className={th} colSpan={3}>SPECIAL DEPOSIT</th>
              <th className={th} colSpan={3}>COMPULSORY DEPOSIT</th>
              <th className={th} colSpan={3}>LOAN</th>
              <th className={th} colSpan={3}>LOAN AGAINST DEPOSIT</th>
            </tr>
            <tr>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
              <th className={th}>Total</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
              <th className={th}>Total</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
              <th className={th}>Total</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
              <th className={th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.memberCode}>
                <td className={tdText}>{row.memberCode}</td>
                <td className={tdText}>{row.memberName}</td>
                <td className={td}>{formatMoney(row.share.amount)} {row.share.side}</td>
                {['specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'].flatMap((g) => ([
                  <td key={`${g}-bal`} className={td}>{formatMoney(row[g].balance)} {row[g].side}</td>,
                  <td key={`${g}-int`} className={td}>{formatMny(Math.abs(Number(row[g].interest || 0)))}</td>,
                  <td key={`${g}-tot`} className={td}>{formatTotal(row[g])}</td>
                ]))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={15} className="border border-black p-4 text-center text-[12px]">No members found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 ml-auto w-[560px] max-w-full">
          <table className={totalTable}>
            <thead>
              <tr>
                <th className={totalTh}>TOTAL</th>
                <th className={totalTh}>BALANCE</th>
                <th className={totalTh}>INTEREST</th>
              </tr>
            </thead>
            <tbody>
              {INTEREST_GROUPS.map((g) => (
                <tr key={g}>
                  <td className={`${totalTdText} font-bold`}>{TOTAL_LABELS[g]}</td>
                  <td className={`${totalTd} font-bold`}>{formatMoney(totals[g].balance)}</td>
                  <td className={`${totalTd} font-bold`}>{formatMoney(totals[g].interest)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${totalTdText} font-bold`}>SHARE TOTAL AMOUNT</td>
                <td className={`${totalTd} font-bold`}>{formatMoney(shareTotal)}</td>
                <td className={totalTd}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-1 text-[8px] text-slate-500">Intrst : = the FY's interest (legacy's own figure for a closed FY). Total = Balance + Intrst.</p>
    </PrintShell>
  );
}

export default MembersClosingBalancePrint;

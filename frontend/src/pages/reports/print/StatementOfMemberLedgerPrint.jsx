import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, hasAmount, thTight as th, tdTight as td, tdTextTight as tdText } from './printStyles';

const INTEREST_GROUPS = ['specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'];
const GROUPS = ['share', ...INTEREST_GROUPS];

function formatMny(val) {
  return val === 0 || val == null ? '-' : formatMoney(val);
}

const signedBalance = (bucket) => (bucket?.side === 'DR' ? -Number(bucket?.balance || 0) : Number(bucket?.balance || 0));
const sumOf = (rows, group, field) => rows.reduce((sum, row) => sum + Number(row[group]?.[field] || 0), 0);

// Balance with its side; a row without one (older data) prints bare.
function formatBalance(bucket) {
  return bucket?.side ? `${formatMoney(bucket.balance)} ${bucket.side}` : formatMoney(bucket?.balance);
}

export function StatementOfMemberLedgerPrint({ data, filters, headerActions }) {
  const rows = (Array.isArray(data) ? data : []).filter((row) => hasAmount(
    ...['share', 'specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit']
      .flatMap((g) => [row[g]?.credit, row[g]?.debit, row[g]?.balance, row[g]?.interest])
  ));
  // Legacy's last page: a TOTAL line of every column, then CLOSING BAL per
  // head = total balance + total interest (Share has no interest). Interest
  // arrives signed as legacy keeps it — interest paid out of a deposit or
  // collected on a loan by voucher is negative — and prints unsigned, while
  // CLOSING BAL adds it signed (FY 2025-26: Loan 129,542,408.71 - 464,221).
  const totals = Object.fromEntries(GROUPS.map((g) => {
    const balance = rows.reduce((sum, row) => sum + signedBalance(row[g]), 0);
    const interest = INTEREST_GROUPS.includes(g) ? sumOf(rows, g, 'interest') : 0;
    return [g, {
      credit: sumOf(rows, g, 'credit'),
      debit: sumOf(rows, g, 'debit'),
      balance: Math.abs(balance),
      side: balance < 0 ? 'DR' : 'CR',
      interest,
      closing: Math.abs(balance) + interest
    }];
  }));
  const dateLabel = `FROM ${formatDMY(filters?.dateFrom) || 'Start'} TO ${formatDMY(filters?.dateTo) || formatDMY(new Date())}`;

  return (
    <PrintShell headerActions={headerActions} landscape>
      <PrintLetterhead title="STATEMENT OF MEMBER LEDGER" meta="Page 1 of 1" />
      <p className="mb-2 text-center text-[12px] font-bold">{dateLabel}</p>

      <div>
        <table className="w-full border-collapse border border-black text-[9px]">
          <thead>
            <tr>
              <th className={th} rowSpan={2}>Member Name</th>
              <th className={th} colSpan={3}>Share</th>
              <th className={th} colSpan={4}>Special Deposit</th>
              <th className={th} colSpan={4}>Compulsory Deposit</th>
              <th className={th} colSpan={4}>Loan</th>
              <th className={th} colSpan={4}>Loan Against Deposit</th>
            </tr>
            <tr>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.memberCode}>
                <td className={tdText}>{row.memberName}</td>
                <td className={td}>{formatMny(row.share.credit)}</td>
                <td className={td}>{formatMny(row.share.debit)}</td>
                <td className={td}>{formatBalance(row.share)}</td>
                {['specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'].flatMap((g) => ([
                  <td key={`${g}-cr`} className={td}>{formatMny(row[g].credit)}</td>,
                  <td key={`${g}-dr`} className={td}>{formatMny(row[g].debit)}</td>,
                  <td key={`${g}-bal`} className={td}>{formatBalance(row[g])}</td>,
                  <td key={`${g}-int`} className={td}>{formatMny(Math.abs(Number(row[g].interest || 0)))}</td>
                ]))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={20} className="border border-black p-4 text-center text-[12px]">No members found.</td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-slate-50">
                <td className={tdText}>TOTAL :</td>
                <td className={td}>{formatMoney(totals.share.credit)}</td>
                <td className={td}>{formatMoney(totals.share.debit)}</td>
                <td className={td}>{formatBalance(totals.share)}</td>
                {INTEREST_GROUPS.flatMap((g) => ([
                  <td key={`${g}-cr`} className={td}>{formatMoney(totals[g].credit)}</td>,
                  <td key={`${g}-dr`} className={td}>{formatMoney(totals[g].debit)}</td>,
                  <td key={`${g}-bal`} className={td}>{formatBalance(totals[g])}</td>,
                  <td key={`${g}-int`} className={td}>{formatMoney(Math.abs(totals[g].interest))}</td>
                ]))}
              </tr>
              <tr className="font-bold">
                <td className={tdText}>CLOSING BAL :</td>
                <td className={`${td} text-[11px]`} colSpan={3}>{formatMoney(totals.share.closing)}</td>
                {INTEREST_GROUPS.map((g) => (
                  <td key={g} className={`${td} text-[11px]`} colSpan={4}>{formatMoney(totals[g].closing)}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-1 text-[8px] text-slate-500">Intrst : = Interest. Credit/Debit include the opening balance. CLOSING BAL = Balance + Intrst.</p>
    </PrintShell>
  );
}

export default StatementOfMemberLedgerPrint;

import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, hasAmount, table, th } from './printStyles';

// Compact rows (this register runs to thousands of lines): tighter padding and
// a wider Narration column so a party name stays on one line, which keeps the
// all-accounts print to far fewer A4 pages.
const td = 'border border-black px-1.5 py-0.5 text-right text-[10px] font-mono leading-tight';
const tdText = 'border border-black px-1.5 py-0.5 text-left text-[10px] leading-tight';

// Legacy layout: one block per account — "Account : name", the Op. row with
// the opening amount under Credit (CR) or Debit (DR), its vouchers, then a
// "Sub Total ==" line whose Credit/Debit include the opening and whose
// Balance is the account's closing. A blank Account prints every account.
function AccountBlock({ ledgerName, rows: allRows }) {
  // The opening row stays; voucher rows with neither credit nor debit are hidden.
  const rows = (Array.isArray(allRows) ? allRows : [])
    .filter((row) => row.voucherNo === 'OPENING' || hasAmount(row.credit, row.debit));
  const opening = rows.find((row) => row.voucherNo === 'OPENING');
  const openingCredit = opening && opening.balanceSide === 'CR' ? Number(opening.balance || 0) : 0;
  const openingDebit = opening && opening.balanceSide === 'DR' ? Number(opening.balance || 0) : 0;
  const txRows = rows.filter((row) => row.voucherNo !== 'OPENING');
  const totalCredit = openingCredit + txRows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const totalDebit = openingDebit + txRows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const last = rows[rows.length - 1];

  return (
    <tbody>
      <tr className="font-bold">
        <td className="border border-black px-1.5 py-0.5 text-[10px] leading-tight" colSpan={6}>Account : &nbsp;{ledgerName || '-'}</td>
      </tr>
      {rows.map((row, i) => {
        const isOpening = row.voucherNo === 'OPENING';
        return (
          <tr key={i}>
            <td className={`${tdText} text-center`}>{isOpening ? 'Op.' : row.voucherNo}</td>
            <td className={tdText}>{formatDMY(row.date)}</td>
            <td className={tdText}>{isOpening ? 'Opening' : row.narration}</td>
            <td className={td}>{formatMoney(isOpening ? openingCredit : row.credit)}</td>
            <td className={td}>{formatMoney(isOpening ? openingDebit : row.debit)}</td>
            <td className={td}>{formatMoney(row.balance)} {row.balanceSide}</td>
          </tr>
        );
      })}
      <tr className="font-bold">
        <td className={`${tdText} text-right`} colSpan={3}>Sub Total ==</td>
        <td className={td}>{formatMoney(totalCredit)}</td>
        <td className={td}>{formatMoney(totalDebit)}</td>
        <td className={td}>{last ? `${formatMoney(last.balance)} ${last.balanceSide}` : ''}</td>
      </tr>
    </tbody>
  );
}

export function StatementOfAccountPrint({ data, filters, headerActions }) {
  const accounts = Array.isArray(data?.accounts)
    ? data.accounts
    : [{ ledgerCode: filters?.ledgerCode || '', ledgerName: data?.ledgerName, rows: data?.rows }];
  const dateLabel = `FROM ${formatDMY(filters?.dateFrom) || 'Start'} TO ${formatDMY(filters?.dateTo) || formatDMY(new Date())}`;

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title="STATEMENT OF ACCOUNT" meta="Page 1 of 1" />
      <p className="mb-2 text-center text-[12px] font-bold">{dateLabel}</p>

      <div className="overflow-x-auto">
        <table className={table}>
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>Vch. No.</th>
              <th className={th}>Date</th>
              <th className={`${th} text-left`}>Narration</th>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
            </tr>
          </thead>
          {accounts.map((account) => (
            <AccountBlock key={account.ledgerCode || account.ledgerName} ledgerName={account.ledgerName} rows={account.rows} />
          ))}
          {accounts.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={6} className="border border-black p-4 text-center text-[12px]">No accounts with a balance or transactions in the selected period.</td>
              </tr>
            </tbody>
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

export default StatementOfAccountPrint;

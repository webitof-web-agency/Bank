import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, table, th, td, tdText } from './printStyles';

// Legacy prints the groups in this order (all of them when its Group field is
// left blank), each followed by an "<Group> Sub Total ==" line of its Credit
// and Debit totals.
const GROUP_ORDER = ['ASSET', 'EXPENSE', 'INCOME', 'LIABILITY', 'PRIMARY'];
const GROUP_LABELS = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  INCOME: 'Income',
  EXPENSE: 'Expenses',
  PRIMARY: 'Primary'
};

const sumOf = (rows, field) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);

// Legacy prints the closing balance in whole rupees with its side; a nil
// balance reads "0 CR".
function formatClosing(row) {
  const amount = Math.round(Number(row.balance || 0));
  const side = amount ? row.balanceSide : 'CR';
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount)} ${side}`;
}

export function StatementOfLedgersPrint({ data, filters, headerActions }) {
  // Every ledger of the group is listed, nil ones included, as legacy does.
  const rows = Array.isArray(data) ? data : [];
  const selectedGroup = String(filters?.group || '').toUpperCase();
  const natureOf = (row) => String(row.nature || selectedGroup || '').toUpperCase();
  const knownGroups = GROUP_ORDER.filter((nature) => rows.some((row) => natureOf(row) === nature));
  const otherRows = rows.filter((row) => !GROUP_ORDER.includes(natureOf(row)));
  const sections = knownGroups.map((nature) => ({
    key: nature,
    label: GROUP_LABELS[nature],
    rows: rows.filter((row) => natureOf(row) === nature)
  }));
  if (otherRows.length) sections.push({ key: 'OTHER', label: 'Others', rows: otherRows });

  const dateLabel = `FROM ${formatDMY(filters?.dateFrom) || 'Start'} TO ${formatDMY(filters?.dateTo) || formatDMY(new Date())}`;

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title="STATEMENT OF LEDGER'S R/D" meta="Page 1 of 1" />
      <p className="mb-2 text-center text-[12px] font-bold">{dateLabel}</p>

      <div className="overflow-x-auto">
        <table className={table}>
          <thead>
            <tr>
              <th className={`${th} text-left`}>Particulars</th>
              <th className={th}>Opening Balance</th>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Closing Balance</th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.key}>
              <tr>
                <td className="border border-black bg-slate-100 px-2 py-1 text-[11px] font-bold" colSpan={5}>{section.label}</td>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.ledgerCode}>
                  <td className={tdText}>{row.ledgerName}</td>
                  <td className={td}>{formatMoney(row.openingBalance)} {Number(row.openingBalance) ? row.openingSide : 'CR'}</td>
                  <td className={td}>{formatMoney(row.totalCr)}</td>
                  <td className={td}>{formatMoney(row.totalDr)}</td>
                  <td className={td}>{formatClosing(row)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className={`${tdText} text-right`} colSpan={2}>{section.label} Sub Total ==</td>
                <td className={td}>{formatMoney(sumOf(section.rows, 'totalCr'))}</td>
                <td className={td}>{formatMoney(sumOf(section.rows, 'totalDr'))}</td>
                <td className={td}></td>
              </tr>
            </tbody>
          ))}
          {rows.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={5} className="border border-black p-4 text-center text-[12px]">No ledgers found for this group.</td>
              </tr>
            </tbody>
          )}
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-bold">
                <td className={`${tdText} text-right`} colSpan={2}>Grand Total</td>
                <td className={td}>{formatMoney(sumOf(rows, 'totalCr'))}</td>
                <td className={td}>{formatMoney(sumOf(rows, 'totalDr'))}</td>
                <td className={td}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="mt-14 flex justify-around text-[12px] font-bold">
        <span>Signature</span>
        <span>Computer Clerk</span>
        <span>Manager</span>
      </div>
    </PrintShell>
  );
}

export default StatementOfLedgersPrint;

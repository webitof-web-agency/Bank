import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, table, th, td, tdText } from './printStyles';

function groupByVoucher(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row.voucherNo)) {
      groups.set(row.voucherNo, { voucherNo: row.voucherNo, date: row.date, lines: [], credit: 0, debit: 0 });
    }
    const group = groups.get(row.voucherNo);
    group.lines.push(row);
    group.credit += Number(row.credit || 0);
    group.debit += Number(row.debit || 0);
  });
  return [...groups.values()];
}

export function DayBookPrint({ data, filters, headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const vouchers = groupByVoucher(rows);
  const totalCredit = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const totalDebit = rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title={`DAYBOOK AS ON ${formatDMY(filters?.date) || formatDMY(new Date())}`} meta="Page 1 of 1" />

      <div className="overflow-x-auto">
      <table className={table}>
        <thead>
          <tr>
            <th className={th}>Vch.No</th>
            <th className={`${th} text-left`}>Particulars</th>
            <th className={th}>Credit</th>
            <th className={th}>Debit</th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((group) => (
            <tr key={group.voucherNo}>
              <td className={`${tdText} text-center align-top`}>{group.voucherNo}</td>
              <td className={tdText}>
                <div className="font-semibold">{group.date}</div>
                {group.lines.map((line, i) => (
                  <div key={i}>{line.ledgerCode ? `${line.ledgerCode} - ` : ''}{line.particulars}</div>
                ))}
              </td>
              <td className={`${td} align-top`}>{group.credit ? formatMoney(group.credit) : ''}</td>
              <td className={`${td} align-top`}>{group.debit ? formatMoney(group.debit) : ''}</td>
            </tr>
          ))}
          {vouchers.length === 0 && (
            <tr>
              <td colSpan={4} className="border border-black p-4 text-center text-[12px]">No entries found for the selected date.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-8 border border-black p-2 text-[12px] font-bold">
        <span>Total Credit : {formatMoney(totalCredit)}</span>
        <span>Total Debit : {formatMoney(totalDebit)}</span>
      </div>
    </PrintShell>
  );
}

export default DayBookPrint;

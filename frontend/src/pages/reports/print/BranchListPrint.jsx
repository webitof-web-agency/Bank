import { PrintShell, PrintLetterhead } from './PrintShell';
import { th, tdText, tdCenter, table, formatDMY } from './printStyles';

function groupByHeadOffice(rows) {
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const groups = new Map();
  rows.forEach((row) => {
    const hoCode = row.headOfficeCode || 'HO01';
    if (!groups.has(hoCode)) {
      const hoRow = byCode.get(hoCode);
      groups.set(hoCode, { label: hoRow?.place || hoCode, rows: [] });
    }
    groups.get(hoCode).rows.push(row);
  });
  return [...groups.values()];
}

export function BranchListPrint({ data, headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const groups = groupByHeadOffice(rows);
  let serial = 0;

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title="LIST OF BRANCH" meta={`Date : ${formatDMY(new Date())}`} />

      <div className="overflow-x-auto">
      <table className={table}>
        <thead>
          <tr>
            <th className={th}>S.No</th>
            <th className={th}>CODE</th>
            <th className={`${th} text-left`}>BRANCH</th>
            <th className={th}>PHONE</th>
            <th className={`${th} text-left`}>ADDRESS</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.label}>
            <tr>
              <td colSpan={5} className={`${tdText} font-bold bg-slate-50`}>{group.label}</td>
            </tr>
            {group.rows.map((row) => {
              serial += 1;
              return (
                <tr key={row.code}>
                  <td className={tdCenter}>{serial}</td>
                  <td className={tdCenter}>{row.code}</td>
                  <td className={tdText}>{row.place}</td>
                  <td className={tdCenter}>{row.phone}</td>
                  <td className={tdText}>{row.address}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
        {rows.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={5} className="border border-black p-4 text-center text-[12px]">No branches found.</td>
            </tr>
          </tbody>
        )}
      </table>
      </div>
    </PrintShell>
  );
}

export default BranchListPrint;

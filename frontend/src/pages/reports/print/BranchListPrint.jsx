import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatDMY } from './printStyles';

// Legacy "LIST OF BRANCH": an outer box with no inner grid, branches grouped
// under their district (bold, dashed rule above), S.No. running on across
// groups. Rows arrive sorted by district then branch from the backend.
const table = 'w-full border-collapse border border-black text-[11px] table-fixed';
const th = 'border-b border-black px-2 py-1 text-left font-bold text-[11px]';
const cell = 'px-2 py-0.5 text-[11px] align-top';

function groupByDistrict(rows) {
  const groups = [];
  rows.forEach((row, index) => {
    const district = row.district || '';
    const last = groups[groups.length - 1];
    if (last && last.district === district) last.rows.push(row);
    else groups.push({ district, firstSerial: index + 1, rows: [row] });
  });
  return groups;
}

export function BranchListPrint({ data, headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const groups = groupByDistrict(rows);

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title="LIST OF BRANCH" meta={`Date : ${formatDMY(new Date())}`} />

      <div className="overflow-x-auto">
        <table className={table}>
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '34%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>S.No.</th>
              <th className={th}>CODE</th>
              <th className={th}>BRANCH</th>
              <th className={th}>PHONE</th>
              <th className={th}>ADDRESS</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, groupIndex) => (
              <DistrictGroup key={`${group.district}-${groupIndex}`} group={group} first={groupIndex === 0} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-[12px]">No branches found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PrintShell>
  );
}

function DistrictGroup({ group, first }) {
  const rule = first ? '' : 'border-t border-dashed border-black';
  return (
    <>
      <tr>
        <td colSpan={2} className={`${cell} ${rule}`} />
        <td colSpan={3} className={`${cell} ${rule} font-bold`}>{group.district}</td>
      </tr>
      {group.rows.map((row, i) => (
        <tr key={row.code}>
          <td className={cell}>{group.firstSerial + i}</td>
          <td className={cell}>{row.code}</td>
          <td className={cell}>{row.place}</td>
          <td className={cell}>{row.phone}</td>
          <td className={cell}>{row.address}</td>
        </tr>
      ))}
    </>
  );
}

export default BranchListPrint;

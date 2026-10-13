import { PrintShell, PrintLetterhead } from './PrintShell';
import { th, tdText, tdCenter, table } from './printStyles';
import { formatDMY } from './printStyles';

export function AllMemberListPrint({ data, headerActions }) {
  // As the old software printed it: active members only (the screen above
  // still counts active and inactive).
  const rows = (Array.isArray(data) ? data : []).filter((row) => String(row.status || '').toLowerCase() === 'active');

  return (
    // Landscape, one column per field, each with its own heading.
    <PrintShell headerActions={headerActions} landscape>
      <PrintLetterhead title="ALL MEMBER'S LIST" />

      <table className={table}>
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className={th}>SN.</th>
            <th className={th}>CODE</th>
            <th className={th}>MEMBER'S NAME</th>
            <th className={th}>FATHER'S / HUSBAND'S NAME</th>
            <th className={th}>DESIGNATION</th>
            <th className={th}>BRANCH</th>
            <th className={th}>CASTE</th>
            <th className={th}>DISTRICT</th>
            <th className={`${th} text-[10px]`}>MEMBERSHIP NO.</th>
            <th className={`${th} text-[10px]`}>MEMBERSHIP DATE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.code || i}>
              <td className={tdCenter}>{i + 1}</td>
              <td className={tdCenter}>{row.code}</td>
              <td className={tdText}>{row.name}</td>
              <td className={tdText}>{row.fatherOrHusbandName}</td>
              <td className={tdText}>{row.designation}</td>
              <td className={tdText}>{row.branchName || row.branchCode}</td>
              <td className={tdText}>{row.caste}</td>
              <td className={tdText}>{row.district}</td>
              <td className={tdCenter}>{row.membershipNo}</td>
              <td className={`${tdCenter} whitespace-nowrap`}>{formatDMY(row.membershipDate)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="border border-black p-4 text-center text-[12px]">No members found.</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-2 text-right text-[11px] font-semibold">Total Active Members : {rows.length}</p>
    </PrintShell>
  );
}

export default AllMemberListPrint;

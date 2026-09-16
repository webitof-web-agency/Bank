import { PrintShell, PrintLetterhead } from './PrintShell';
import { th, tdText, tdCenter, table } from './printStyles';
import { formatDMY } from './printStyles';

export function AllMemberListPrint({ data, headerActions }) {
  const rows = Array.isArray(data) ? data : [];

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title="ALL MEMBER'S LIST" />

      <div className="overflow-x-auto">
      <table className={table}>
        <thead>
          <tr>
            <th className={th} rowSpan={2}>SN.</th>
            <th className={th} rowSpan={2}>CODE</th>
            <th className={th}>MEMBER'S NAME</th>
            <th className={th}>DESIGNATION</th>
            <th className={th}>CASTE</th>
            <th className={th}>MEMBERSHIP</th>
          </tr>
          <tr>
            <th className={th}>FATHER'S/HUSBAND NAME</th>
            <th className={th}>BRANCH</th>
            <th className={th}>DISTRICT</th>
            <th className={th}>NO. / DATE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.code || i}>
              <td className={tdCenter}>{i + 1}</td>
              <td className={tdCenter}>{row.code}</td>
              <td className={tdText}>
                <div>{row.name}</div>
                <div className="text-slate-500">{row.fatherOrHusbandName}</div>
              </td>
              <td className={tdText}>
                <div>{row.designation}</div>
                <div className="text-slate-500">{row.branchName || row.branchCode}</div>
              </td>
              <td className={tdText}>
                <div>{row.caste}</div>
                <div className="text-slate-500">{row.district}</div>
              </td>
              <td className={tdText}>
                <div>{row.membershipNo}</div>
                <div className="text-slate-500">{formatDMY(row.membershipDate)}</div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="border border-black p-4 text-center text-[12px]">No members found.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <p className="mt-2 text-right text-[11px] font-semibold">Total Members : {rows.length}</p>
    </PrintShell>
  );
}

export default AllMemberListPrint;

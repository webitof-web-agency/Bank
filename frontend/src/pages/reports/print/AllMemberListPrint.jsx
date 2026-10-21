import { PrintShell, PrintLetterhead } from './PrintShell';
import { th, tdText, tdCenter, table } from './printStyles';
import { formatDMY } from './printStyles';

// showDismembered: the Dismembered On column (dismembered and all-member
// lists); the active lists have nobody who left, so it is left out there.
export function AllMemberListPrint({ data, headerActions, title = "ALL MEMBER'S LIST", totalLabel = 'Total Members', showDismembered = false }) {
  // The backend already applies the chosen list type (all / branch-wise /
  // dismembered) and sort order, so print exactly what it returned.
  const rows = Array.isArray(data) ? data : [];

  return (
    // Landscape, one column per field, each with its own heading.
    <PrintShell headerActions={headerActions} landscape>
      <PrintLetterhead title={title} />

      <table className={table}>
        <colgroup>
          {(showDismembered
            ? ['4%', '5%', '16%', '17%', '10%', '10%', '7%', '10%', '10.5%', '10.5%']
            : ['4%', '5%', '20%', '19%', '11%', '11%', '7%', '12%', '11%']
          ).map((width, index) => <col key={index} style={{ width }} />)}
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
            <th className={`${th} text-[10px]`}>MEMBERSHIP DATE</th>
            {showDismembered ? <th className={`${th} text-[10px]`}>DISMEMBERED ON</th> : null}
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
              <td className={`${tdCenter} whitespace-nowrap`}>{formatDMY(row.membershipDate)}</td>
              {showDismembered ? <td className={`${tdCenter} whitespace-nowrap`}>{row.dismemberedDate ? formatDMY(row.dismemberedDate) : '-'}</td> : null}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showDismembered ? 10 : 9} className="border border-black p-4 text-center text-[12px]">No members found.</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-2 text-right text-[11px] font-semibold">{totalLabel} : {rows.length}</p>
    </PrintShell>
  );
}

export default AllMemberListPrint;

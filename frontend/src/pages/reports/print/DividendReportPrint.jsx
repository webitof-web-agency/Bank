import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoneyLegacy as money } from './printStyles';

// Legacy Dividend Report, matched to its FY 2024-25 exports. One "Report"
// dropdown, six layouts (opening / closing share for each):
//   Branchwise  one total per branch; opening adds the sanction footer
//   Summary     members under "BRANCH : x" with a subtotal per branch.
//               Opening runs on with one footer at the end; closing puts
//               each branch on its own sheet with "TOTAL :" and its own
//               footer (the sheet a branch returns after payment), then a
//               grand-total sheet
//   MemberWise  one row per member: branch, PF no., grade, dividend
// Legacy's look: an outer box, a rule under the header, no inner grid, dashed
// rules around subtotals and dotted lines to sign on. Rows arrive sorted.

const box = 'w-full border-collapse border border-black text-[11px] table-fixed';
const th = 'border-b border-black px-1.5 py-1 text-left align-bottom font-bold text-[10px] leading-tight';
const thRight = `${th} text-right`;
const cell = 'px-1.5 py-1.5 text-[11px] align-bottom';
const num = `${cell} text-right tabular-nums`;
const dashedTop = 'border-t border-dashed border-black';
const footerText = 'text-[11px] font-semibold';

const shareOf = (row) => Number(row.shareTotal ?? row.share ?? 0);
const dividendOf = (row) => Number(row.dividendTotal ?? row.dividendAmount ?? 0);
const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);

// 07-Oct-26, as legacy dates its branchwise sheet.
function shortDate(date = new Date()) {
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${String(date.getDate()).padStart(2, '0')}-${month}-${String(date.getFullYear()).slice(-2)}`;
}

function SignatureLine() {
  return <div className="mx-1 border-b border-dotted border-black" />;
}

// "SANCTION AMOUNT Rs. ____ TOWARDS Rs. ____ PAID ONLY." is filled in by hand,
// so the amounts stay blank exactly as legacy prints them.
function SanctionFooter({ colSpan, label = 'SANCTION AMOUNT Rs.', signedBy = 'Chairman/Vice Chairman' }) {
  return (
    <>
      <tr>
        <td colSpan={colSpan} className={`${cell} ${dashedTop} pt-4`}>
          <div className={`flex items-end gap-2 ${footerText}`}>
            <span className="whitespace-nowrap">{label}</span>
            <span className="flex-1 border-b border-dashed border-black" />
            <span className="whitespace-nowrap">TOWARDS Rs.</span>
            <span className="flex-1 border-b border-dashed border-black" />
          </div>
          <div className={`mt-4 flex items-end gap-2 ${footerText}`}>
            <span className="flex-1 border-b border-dashed border-black" />
            <span className="whitespace-nowrap">PAID ONLY.</span>
          </div>
        </td>
      </tr>
      <tr>
        <td colSpan={colSpan} className={`${cell} pb-3 pt-10`}>
          <div className={`flex items-end justify-between ${footerText}`}>
            <span>Note : Please return this sheet after payment.</span>
            <span className="font-bold">{signedBy}</span>
          </div>
        </td>
      </tr>
    </>
  );
}

function EmptyRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-4 text-center text-[12px]">No dividend records found.</td>
    </tr>
  );
}

function groupByBranch(rows) {
  const groups = [];
  rows.forEach((row, index) => {
    const last = groups[groups.length - 1];
    if (last && last.branch === row.branch) last.rows.push(row);
    else groups.push({ branch: row.branch, branchName: row.branchName || row.branch, firstSerial: index + 1, rows: [row] });
  });
  return groups;
}

function BranchwiseTable({ rows, rate, withFooter }) {
  return (
    <table className={box}>
      <colgroup>
        <col style={{ width: '8%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '40%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '24%' }} />
      </colgroup>
      <thead>
        <tr>
          <th className={th}>S.No.</th>
          <th className={thRight}>CODE</th>
          <th className={th}>BRANCH</th>
          <th className={thRight}>MEMBER'S SHARE</th>
          <th className={thRight}>DIVIDEND AMT. AS ON {rate} %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.branch || i}>
            <td className={cell}>{i + 1}</td>
            <td className={`${cell} text-right`}>{row.branch}</td>
            <td className={`${cell} font-semibold`}>{row.branchName || row.branch}</td>
            <td className={num}>{money(row.shareTotal)}</td>
            <td className={num}>{money(row.dividendTotal)}</td>
          </tr>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={5} />}
        {rows.length > 0 && (
          <tr className="font-bold">
            <td className={`${cell} ${dashedTop}`} colSpan={3} />
            <td className={`${num} ${dashedTop}`}>{money(sum(rows, shareOf))}</td>
            <td className={`${num} ${dashedTop}`}>{money(sum(rows, dividendOf))}</td>
          </tr>
        )}
        {rows.length > 0 && withFooter && <SanctionFooter colSpan={5} />}
      </tbody>
    </table>
  );
}

function SummaryColumns() {
  return (
    <colgroup>
      <col style={{ width: '7%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '35%' }} />
      <col style={{ width: '14%' }} />
      <col style={{ width: '14%' }} />
      <col style={{ width: '22%' }} />
    </colgroup>
  );
}

function SummaryHead({ rate }) {
  return (
    <thead>
      <tr>
        <th className={th}>SN.</th>
        <th className={thRight}>CODE</th>
        <th className={th}>MEMBER'S NAME</th>
        <th className={thRight}>SHARE</th>
        <th className={`${th} text-center`}>DIVIDEND AMOUNT<br />ON {rate}</th>
        <th className={th}>RECEIVER'S SIGNATURE</th>
      </tr>
    </thead>
  );
}

function BranchRows({ group, totalLabel = '' }) {
  return (
    <>
      <tr>
        <td colSpan={2} className={`${cell} pt-1 font-bold`}>BRANCH :</td>
        <td colSpan={4} className={`${cell} pt-1 font-bold`}>{group.branchName}</td>
      </tr>
      {group.rows.map((row, i) => (
        <tr key={row.memberCode}>
          <td className={cell}>{group.firstSerial + i}</td>
          <td className={`${cell} text-right`}>{row.memberCode}</td>
          <td className={cell}>{row.memberName}</td>
          <td className={num}>{money(row.share)}</td>
          <td className={num}>{money(row.dividendAmount)}</td>
          <td className={cell}><SignatureLine /></td>
        </tr>
      ))}
      <tr className="font-bold">
        <td colSpan={3} className={`${cell} ${dashedTop} text-right`}>{totalLabel}</td>
        <td className={`${num} ${dashedTop}`}>{money(sum(group.rows, shareOf))}</td>
        <td className={`${num} ${dashedTop}`}>{money(sum(group.rows, dividendOf))}</td>
        <td className={`${cell} ${dashedTop}`} />
      </tr>
    </>
  );
}

// Summary (Based on Opening): one running list, a subtotal per branch, the
// grand total and the footer once at the end.
function SummaryOpeningTable({ rows, rate }) {
  const groups = groupByBranch(rows);
  return (
    <table className={box}>
      <SummaryColumns />
      <SummaryHead rate={rate} />
      <tbody>
        {groups.map((group) => <BranchRows key={group.branch} group={group} />)}
        {rows.length === 0 && <EmptyRow colSpan={6} />}
        {rows.length > 0 && (
          <>
            <tr className="font-bold">
              <td colSpan={3} className={`${cell} ${dashedTop} text-right`}>TOTAL</td>
              <td className={`${num} ${dashedTop}`}>{money(sum(rows, shareOf))}</td>
              <td className={`${num} ${dashedTop}`}>{money(sum(rows, dividendOf))}</td>
              <td className={`${cell} ${dashedTop}`} />
            </tr>
            <SanctionFooter colSpan={6} />
          </>
        )}
      </tbody>
    </table>
  );
}

// Summary (Based on Closing): a sheet per branch, each with the letterhead,
// its TOTAL and its own footer, then a sheet with the grand total.
function SummaryClosingSheets({ rows, rate, title }) {
  const groups = groupByBranch(rows);
  if (!groups.length) {
    return (
      <>
        <PrintLetterhead title={title} />
        <table className={box}><SummaryColumns /><SummaryHead rate={rate} /><tbody><EmptyRow colSpan={6} /></tbody></table>
      </>
    );
  }
  return (
    <>
      {groups.map((group, i) => (
        <div key={group.branch}>
          <div {...(i > 0 ? { 'data-page-break-before': '' } : {})}>
            <PrintLetterhead title={title} />
          </div>
          <table className={box}>
            <SummaryColumns />
            <SummaryHead rate={rate} />
            <tbody>
              <BranchRows group={group} totalLabel="TOTAL :" />
              <SanctionFooter colSpan={6} label="SANCTIONED AMOUNT Rs." signedBy="Chairman / Vice Chairman" />
            </tbody>
          </table>
        </div>
      ))}
      <div>
        <div data-page-break-before="">
          <PrintLetterhead title={title} />
        </div>
        <table className={box}>
          <SummaryColumns />
          <SummaryHead rate={rate} />
          <tbody>
            <tr className="font-bold">
              <td colSpan={3} className={`${cell} text-right`}>GRAND TOTAL :</td>
              <td className={num}>{money(sum(rows, shareOf))}</td>
              <td className={num}>{money(sum(rows, dividendOf))}</td>
              <td className={cell} />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function MemberwiseTable({ rows, rate }) {
  return (
    <table className={box}>
      <colgroup>
        <col style={{ width: '5%' }} />
        <col style={{ width: '22%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '23%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '18%' }} />
      </colgroup>
      <thead>
        <tr>
          <th className={th}>SN.</th>
          <th className={th}>BRANCH</th>
          <th className={th}>PF</th>
          <th className={th}>MEMBER'S NAME</th>
          <th className={th}>GRADE</th>
          <th className={`${th} text-center`}>DIVIDEND ON<br />{rate} %</th>
          <th className={th}>RECEIVER'S SIGNATURE</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.memberCode || i}>
            <td className={cell}>{i + 1}</td>
            <td className={`${cell} font-semibold`}>{row.branch} - {row.branchName}</td>
            <td className={cell}>{row.pfNo}</td>
            <td className={cell}>{row.memberName}</td>
            <td className={cell}>{row.grade}</td>
            <td className={num}>{money(row.dividendAmount)}</td>
            <td className={cell}><SignatureLine /></td>
          </tr>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={7} />}
        {rows.length > 0 && (
          <>
            <tr className="font-bold">
              <td colSpan={5} className={`${cell} ${dashedTop} text-right`}>TOTAL</td>
              <td className={`${num} ${dashedTop}`}>{money(sum(rows, dividendOf))}</td>
              <td className={`${cell} ${dashedTop}`} />
            </tr>
            <SanctionFooter colSpan={7} />
          </>
        )}
      </tbody>
    </table>
  );
}

export function DividendReportPrint({ data, headerActions }) {
  const mode = data?.mode || 'branchwise-opening';
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const rate = Number(rows[0]?.dividendRate || 0).toFixed(2);
  const isClosing = mode.endsWith('-closing');
  const basis = isClosing ? 'Closing' : 'Opening';
  const isBranchwise = mode.startsWith('branchwise');
  const title = isBranchwise
    ? `Statement of dividend paid to member's (Branchwise summary Based on ${basis} Balance)`
    : `Statement of dividend paid to member's (Based on ${basis} Balance)`;

  if (mode === 'summary-closing') {
    return (
      <PrintShell headerActions={headerActions}>
        <SummaryClosingSheets rows={rows} rate={rate} title={title} />
      </PrintShell>
    );
  }

  return (
    <PrintShell headerActions={headerActions}>
      <PrintLetterhead title={title} meta={isBranchwise ? `Date : ${shortDate()}` : ''} />
      <div className="overflow-x-auto">
        {isBranchwise && <BranchwiseTable rows={rows} rate={rate} withFooter={!isClosing} />}
        {mode === 'summary-opening' && <SummaryOpeningTable rows={rows} rate={rate} />}
        {mode.startsWith('memberwise') && <MemberwiseTable rows={rows} rate={rate} />}
      </div>
    </PrintShell>
  );
}

export default DividendReportPrint;

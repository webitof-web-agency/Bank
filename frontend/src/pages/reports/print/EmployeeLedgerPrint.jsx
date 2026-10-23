import { PrintShell, PrintLetterhead } from './PrintShell';
import { SignatureRow } from './LegacyBookParts';
import { formatMoney, formatDMY, hasAmount, thTight as th, tdTight as td, tdTextTight as tdText } from './printStyles';

function sumField(rows, group, field) {
  return rows.reduce((sum, row) => sum + Number(row?.[group]?.[field] || 0), 0);
}

// Legacy CrEmpLedger.rpt layout: VOUCHER (No. / Date), then GRAIN ADVANCE
// (Credit / Debit / Balance), HOUSING LOAN and VEHICLE LOAN (each Credit /
// Debit / Balance / Intrst). The opening row repeats each Dr balance under
// Debit; interest shows in brackets when it's a receipt or a negative accrual.
const GROUPS = [
  { key: 'grainAdvance', label: 'GRAIN ADVANCE', interest: false },
  { key: 'housingLoan', label: 'HOUSING LOAN', interest: true },
  { key: 'vehicleLoan', label: 'VEHICLE LOAN', interest: true }
];
function voucherLabel(row) {
  if (row.isOpening) return 'Op.';
  return String(row.voucherNo || '');
}

export function EmployeeLedgerPrint({ data, filters, headerActions }) {
  if (!data || !data.employee) {
    return <div className="p-8 text-center text-slate-500">Select an employee to view the ledger.</div>;
  }

  const { employee } = data;
  // Rows that move nothing (no credit, debit or interest in any head) are hidden; opening stays.
  const rows = (data.rows || []).filter((r) => r.isOpening || hasAmount(
    ...GROUPS.flatMap((g) => [r[g.key]?.credit, r[g.key]?.debit, g.interest ? r[g.key]?.interest : 0])
  ));
  const txRows = rows.filter((r) => !r.isOpening);
  const openingRow = rows.find((r) => r.isOpening);
  const lastDate = txRows.length ? txRows[txRows.length - 1].date : openingRow?.date;

  // As on the member ledger: TOTAL Credit/Debit include the opening (a loan
  // opens as a Debit), TOTAL Balance is the closing balance, TOTAL Intrst the
  // period's interest (opening row included: a loan nothing moved earns
  // there; interest received is negative), CLOSING BAL = balance + interest.
  const totals = Object.fromEntries(
    GROUPS.map((group) => {
      const g = group.key;
      const movers = txRows.filter((r) => r[g]?.credit || r[g]?.debit);
      const balance = Number((movers.length ? movers[movers.length - 1] : openingRow)?.[g]?.balance || 0);
      const interest = group.interest ? sumField(rows, g, 'interest') : 0;
      return [g, {
        credit: sumField(txRows, g, 'credit'),
        debit: sumField(txRows, g, 'debit') + Number(openingRow?.[g]?.balance || 0),
        balance,
        interest,
        closing: balance + interest
      }];
    })
  );

  const formatMny = (val) => (val === 0 || val == null ? '' : formatMoney(val));
  // What accrued as is, interest received in brackets, e.g. 8,463.00 / (317.00).
  const formatInterest = (val) => {
    const amount = Number(val || 0);
    if (!amount) return '';
    return amount < 0 ? `(${formatMoney(-amount)})` : formatMoney(amount);
  };
  const cellsFor = (row, group) => {
    const cell = row[group.key] || {};
    // Opening: the Dr balance is shown under Debit as well as Balance.
    const debit = row.isOpening ? cell.balance : cell.debit;
    const cells = [
      <td key={`${group.key}-credit`} className={td}>{formatMny(cell.credit)}</td>,
      <td key={`${group.key}-debit`} className={td}>{formatMny(debit)}</td>,
      <td key={`${group.key}-balance`} className={td}>{row.isOpening || hasAmount(cell.credit, debit) ? formatMoney(cell.balance) : ''}</td>
    ];
    if (group.interest) {
      cells.push(<td key={`${group.key}-interest`} className={td}>{formatInterest(cell.interest)}</td>);
    }
    return cells;
  };

  return (
    <PrintShell headerActions={headerActions} landscape>
      <PrintLetterhead title={`EMPLOYEE LEDGER AS ON ${formatDMY(filters?.dateTo) || formatDMY(lastDate) || formatDMY(new Date())}`} meta="Page 1 of 1" />

      <div className="mb-2 border border-black text-[11px] font-semibold">
        <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 border-b border-black px-2 py-1">
          <span>EMPLOYEE CODE : {employee.code || ''}</span>
          <span>NAME : {employee.name || ''}</span>
          <span>MOBILE : {employee.mobileNo || ''}</span>
        </div>
        <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 px-2 py-1">
          <span className="col-span-1">F/H NAME : {employee.fatherName || ''}</span>
          <span>DESIGNATION : {employee.designation || ''}</span>
          <span />
        </div>
      </div>

      <div>
        <table className="w-full border-collapse border border-black text-[9px]">
          <thead>
            <tr>
              <th className={th} colSpan={2}>VOUCHER</th>
              {GROUPS.map((g) => <th key={g.key} className={th} colSpan={g.interest ? 4 : 3}>{g.label}</th>)}
            </tr>
            <tr>
              <th className={th}>No.</th>
              <th className={th}>Date</th>
              {GROUPS.map((g) => (g.interest ? ['Credit', 'Debit', 'Balance', 'Intrst'] : ['Credit', 'Debit', 'Balance']).map((label) => (
                <th key={`${g.key}-${label}`} className={th}>{label}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.isOpening ? 'font-bold' : ''}>
                <td className={`${tdText} text-center`}>{voucherLabel(r)}</td>
                <td className={`${tdText} text-center`}>{formatDMY(r.date)}</td>
                {GROUPS.map((g) => cellsFor(r, g))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className={tdText} colSpan={2}>TOTAL :</td>
              {GROUPS.map((g) => [
                <td key={`${g.key}-credit`} className={td}>{formatMoney(totals[g.key].credit)}</td>,
                <td key={`${g.key}-debit`} className={td}>{formatMoney(totals[g.key].debit)}</td>,
                <td key={`${g.key}-balance`} className={td}>{formatMoney(totals[g.key].balance)}</td>,
                g.interest ? <td key={`${g.key}-interest`} className={td}>{formatInterest(totals[g.key].interest)}</td> : null
              ])}
            </tr>
            <tr className="font-bold">
              <td className={tdText} colSpan={2}>CLOSING BAL :</td>
              {GROUPS.map((g) => <td key={g.key} className={td} colSpan={g.interest ? 4 : 3}>{formatMoney(totals[g.key].closing)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-1 text-[8px] text-slate-500">Intrst : = Interest (simple interest on each loan's balance since its previous movement; the last movement runs to the as-on date. Interest received is shown in brackets. CLOSING BAL = balance + interest)</p>

      <SignatureRow />
    </PrintShell>
  );
}

export default EmployeeLedgerPrint;

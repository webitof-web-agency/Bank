import { PrintShell, PrintLetterhead } from './PrintShell';
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
const COLUMN_COUNT = 2 + GROUPS.reduce((sum, g) => sum + (g.interest ? 4 : 3), 0);

// Legacy numbers are the voucher's own number; LGCY- only marks archive rows.
function voucherLabel(row) {
  if (row.isOpening) return 'Op.';
  return String(row.voucherNo || '').replace(/^LGCY-/, '');
}

export function EmployeeLedgerPrint({ data, filters, headerActions }) {
  if (!data || !data.employee) {
    return <div className="p-8 text-center text-slate-500">Select an employee to view the ledger.</div>;
  }

  const { employee, balances } = data;
  const groups = GROUPS.map((g) => g.key);
  // Rows that move nothing (no credit, debit or interest in any head) are hidden; opening stays.
  const rows = (data.rows || []).filter((r) => r.isOpening || hasAmount(
    ...GROUPS.flatMap((g) => [r[g.key]?.credit, r[g.key]?.debit, g.interest ? r[g.key]?.interest : 0])
  ));
  const txRows = rows.filter((r) => !r.isOpening);
  const openingRow = rows.find((r) => r.isOpening);
  const lastDate = txRows.length ? txRows[txRows.length - 1].date : openingRow?.date;

  const totals = Object.fromEntries(
    groups.map((g) => [g, { credit: sumField(txRows, g, 'credit'), debit: sumField(txRows, g, 'debit') }])
  );

  const formatMny = (val) => (val === 0 || val == null ? '' : formatMoney(val));
  const formatInterest = (val) => {
    const num = Math.round(Number(val || 0));
    if (!num) return '';
    return num < 0 ? `(${Math.abs(num)})` : String(num);
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
            {txRows.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="border border-black p-4 text-center text-[12px]">No transactions found for the selected period.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className={tdText} colSpan={2}>TOTAL :</td>
              {GROUPS.map((g) => [
                <td key={`${g.key}-credit`} className={td}>{formatMoney(totals[g.key].credit)}</td>,
                <td key={`${g.key}-debit`} className={td}>{formatMoney(totals[g.key].debit)}</td>,
                <td key={`${g.key}-balance`} className={td} colSpan={g.interest ? 2 : 1}></td>
              ])}
            </tr>
            <tr className="font-bold">
              <td className={tdText} colSpan={2}>CLOSING BAL :</td>
              {GROUPS.map((g) => <td key={g.key} className={td} colSpan={g.interest ? 4 : 3}>{formatMoney(balances?.[g.key])}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-1 text-[9px] font-semibold">Intrst : = Interest</p>

      <div className="mt-14 flex justify-between text-[12px] font-bold">
        <span>Signature</span>
        <span>Computer Clerk</span>
        <span>Manager</span>
      </div>
    </PrintShell>
  );
}

export default EmployeeLedgerPrint;

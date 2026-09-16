import { PrintShell, PrintLetterhead } from './PrintShell';
import { formatMoney, formatDMY, thTight as th, tdTight as td, tdTextTight as tdText } from './printStyles';

function sumField(rows, group, field) {
  return rows.reduce((sum, row) => sum + Number(row?.[group]?.[field] || 0), 0);
}

export function EmployeeLedgerPrint({ data, headerActions }) {
  if (!data || !data.employee) {
    return <div className="p-8 text-center text-slate-500">No employee data available.</div>;
  }

  const { employee, balances, rows = [] } = data;
  const txRows = rows.filter((r) => !r.isOpening);
  const openingRow = rows.find((r) => r.isOpening);
  const lastDate = txRows.length ? txRows[txRows.length - 1].date : openingRow?.date;

  const groups = ['housingLoan', 'vehicleLoan', 'grainAdvance'];
  const totals = Object.fromEntries(
    groups.map((g) => [g, { credit: sumField(txRows, g, 'credit'), debit: sumField(txRows, g, 'debit') }])
  );

  const formatMny = (val) => (val === 0 || val == null ? '-' : formatMoney(val));

  return (
    <PrintShell headerActions={headerActions} landscape>
      <PrintLetterhead title={`EMPLOYEE LEDGER AS ON ${formatDMY(lastDate) || formatDMY(new Date())}`} meta="Page 1 of 1" />

      <div className="mb-3 text-[12px] font-semibold">
        <p>
          EMPLOYEE CODE : {employee.code || '-'} &nbsp;&nbsp; NAME : {employee.name || '-'} &nbsp;&nbsp;
          MOBILE : {employee.mobileNo || '-'} &nbsp;&nbsp; BRANCH : {employee.branchCode || '-'}
        </p>
        <p>DESIGNATION : {employee.designation || '-'}</p>
      </div>

      <div>
        <table className="w-full border-collapse border border-black text-[9px]">
          <thead>
            <tr>
              <th className={th} rowSpan={2}>Vch. No.</th>
              <th className={th} rowSpan={2}>Date</th>
              <th className={th} colSpan={3}>HOUSING LOAN</th>
              <th className={th} colSpan={3}>VEHICLE LOAN</th>
              <th className={th} colSpan={3}>GRAIN ADVANCE</th>
            </tr>
            <tr>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.isOpening ? 'bg-slate-50 font-bold' : ''}>
                <td className={tdText}>{r.isOpening ? 'Op.' : r.voucherNo}</td>
                <td className={tdText}>{formatDMY(r.date)}</td>

                <td className={td}>{formatMny(r.housingLoan?.credit)}</td>
                <td className={td}>{formatMny(r.housingLoan?.debit)}</td>
                <td className={td}>{formatMny(r.housingLoan?.balance)}</td>

                <td className={td}>{formatMny(r.vehicleLoan?.credit)}</td>
                <td className={td}>{formatMny(r.vehicleLoan?.debit)}</td>
                <td className={td}>{formatMny(r.vehicleLoan?.balance)}</td>

                <td className={td}>{formatMny(r.grainAdvance?.credit)}</td>
                <td className={td}>{formatMny(r.grainAdvance?.debit)}</td>
                <td className={td}>{formatMny(r.grainAdvance?.balance)}</td>
              </tr>
            ))}
            {txRows.length === 0 && (
              <tr>
                <td colSpan={11} className="border border-black p-4 text-center text-[12px]">No transactions found for the selected period.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-slate-50">
              <td className={tdText} colSpan={2}>TOTAL :</td>
              <td className={td}>{formatMoney(totals.housingLoan.credit)}</td>
              <td className={td}>{formatMoney(totals.housingLoan.debit)}</td>
              <td className={td}></td>
              <td className={td}>{formatMoney(totals.vehicleLoan.credit)}</td>
              <td className={td}>{formatMoney(totals.vehicleLoan.debit)}</td>
              <td className={td}></td>
              <td className={td}>{formatMoney(totals.grainAdvance.credit)}</td>
              <td className={td}>{formatMoney(totals.grainAdvance.debit)}</td>
              <td className={td}></td>
            </tr>
            <tr className="font-bold">
              <td className={tdText} colSpan={2}>CLOSING BAL :</td>
              <td className={td} colSpan={3}>{formatMoney(balances?.housingLoan)}</td>
              <td className={td} colSpan={3}>{formatMoney(balances?.vehicleLoan)}</td>
              <td className={td} colSpan={3}>{formatMoney(balances?.grainAdvance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-14 flex justify-between text-[12px] font-bold">
        <span>Signature</span>
        <span>Computer Clerk</span>
        <span>Manager</span>
      </div>
    </PrintShell>
  );
}

export default EmployeeLedgerPrint;

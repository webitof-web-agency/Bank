import { PrintShell, PrintLetterhead } from './print/PrintShell';
import { formatMoney, formatDMY, thTight as th, tdTight as td, tdTextTight as tdText } from './print/printStyles';

function sumField(rows, group, field) {
  return rows.reduce((sum, row) => sum + Number(row?.[group]?.[field] || 0), 0);
}

export function MemberLedgerPrintTemplate({ payload, headerActions }) {
  if (!payload || !payload.member) {
    return <div className="p-8 text-center text-slate-500">No member data available.</div>;
  }

  const { member, balances, rows } = payload;
  const txRows = rows.filter((r) => !r.isOpening);
  const openingRow = rows.find((r) => r.isOpening);
  const lastDate = txRows.length ? txRows[txRows.length - 1].date : openingRow?.date;

  const groups = ['share', 'specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'];
  const interestGroups = ['specialDeposit', 'compulsoryDeposit', 'loan', 'loanAgainstDeposit'];
  const totals = Object.fromEntries(
    groups.map((g) => [g, {
      credit: sumField(txRows, g, 'credit'),
      debit: sumField(txRows, g, 'debit'),
      interest: interestGroups.includes(g) ? sumField(txRows, g, 'interest') : 0
    }])
  );

  const formatMny = (val) => (val === 0 || val == null ? '-' : formatMoney(val));

  // A row's Balance/Intrst for a group only prints when that group actually
  // moved on this voucher — a voucher with no Credit/Debit in a group carries
  // no new information about it, so the running balance isn't repeated.
  // The opening row is exempt: it's the one place the running balance is
  // meant to be established rather than restated.
  const formatCarried = (row, group, field) => {
    const g = row?.[group] || {};
    if (!row.isOpening && !g.credit && !g.debit) return '-';
    return formatMny(g[field]);
  };

  return (
    <PrintShell headerActions={headerActions} landscape>
      <PrintLetterhead title={`MEMBER LEDGER AS ON ${formatDMY(lastDate) || formatDMY(new Date())}`} meta="Page 1 of 1" />

      {/* Member Details */}
      <div className="mb-3 text-[12px] font-semibold">
        <p>
          MEMBER CODE : {member.code || '-'} &nbsp;&nbsp; NAME : {member.name || '-'} &nbsp;&nbsp;
          MOBILE : {member.mobileNo || '-'} &nbsp;&nbsp; PF. No. : {member.pfNo || '-'} &nbsp;&nbsp;
          BRANCH : {member.branchCode || '-'}
        </p>
        <p>
          F/H NAME : {member.fatherOrHusbandName || '-'} &nbsp;&nbsp; DESIGNATION : {member.designation || '-'}
        </p>
      </div>

      {/* Ledger Table — intentionally allowed to overflow wider than the page;
          every cell is forced to one line (whitespace-nowrap in printStyles),
          so a fixed/percentage column layout would just re-introduce wrapping.
          The zoom control in PrintShell is how this gets shrunk back to fit. */}
      <div>
        <table className="w-full border-collapse border border-black text-[9px]">
          <thead>
            <tr>
              <th className={th} colSpan={2}>VOUCHER</th>
              <th className={th} colSpan={3}>SHARE</th>
              <th className={th} colSpan={4}>SPECIAL DEPOSIT</th>
              <th className={th} colSpan={4}>COMPULSORY DEPOSIT</th>
              <th className={th} colSpan={4}>LOAN</th>
              <th className={th} colSpan={4}>LOAN AGAINST DEPOSIT</th>
            </tr>
            <tr>
              <th className={th}>No.</th>
              <th className={th}>Date</th>

              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>

              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>

              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>

              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>

              <th className={th}>Credit</th>
              <th className={th}>Debit</th>
              <th className={th}>Balance</th>
              <th className={th}>Intrst</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.isOpening ? 'bg-slate-50 font-bold' : ''}>
                <td className={tdText}>{r.isOpening ? 'Op.' : (r.details?.legacyVoucherNo || r.voucherNo)}</td>
                <td className={tdText}>{formatDMY(r.date)}</td>

                <td className={td}>{formatMny(r.share?.credit)}</td>
                <td className={td}>{formatMny(r.share?.debit)}</td>
                <td className={td}>{formatCarried(r, 'share', 'balance')}</td>

                <td className={td}>{formatMny(r.specialDeposit?.credit)}</td>
                <td className={td}>{formatMny(r.specialDeposit?.debit)}</td>
                <td className={td}>{formatCarried(r, 'specialDeposit', 'balance')}</td>
                <td className={td}>{formatCarried(r, 'specialDeposit', 'interest')}</td>

                <td className={td}>{formatMny(r.compulsoryDeposit?.credit)}</td>
                <td className={td}>{formatMny(r.compulsoryDeposit?.debit)}</td>
                <td className={td}>{formatCarried(r, 'compulsoryDeposit', 'balance')}</td>
                <td className={td}>{formatCarried(r, 'compulsoryDeposit', 'interest')}</td>

                <td className={td}>{formatMny(r.loan?.credit)}</td>
                <td className={td}>{formatMny(r.loan?.debit)}</td>
                <td className={td}>{formatCarried(r, 'loan', 'balance')}</td>
                <td className={td}>{formatCarried(r, 'loan', 'interest')}</td>

                <td className={td}>{formatMny(r.loanAgainstDeposit?.credit)}</td>
                <td className={td}>{formatMny(r.loanAgainstDeposit?.debit)}</td>
                <td className={td}>{formatCarried(r, 'loanAgainstDeposit', 'balance')}</td>
                <td className={td}>{formatCarried(r, 'loanAgainstDeposit', 'interest')}</td>
              </tr>
            ))}
            {txRows.length === 0 && (
              <tr>
                <td colSpan={21} className="border border-black p-4 text-center text-[12px]">No transactions found for the selected period.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-slate-50">
              <td className={tdText} colSpan={2}>TOTAL :</td>
              <td className={td}>{formatMoney(totals.share.credit)}</td>
              <td className={td}>{formatMoney(totals.share.debit)}</td>
              <td className={td}></td>
              <td className={td}>{formatMoney(totals.specialDeposit.credit)}</td>
              <td className={td}>{formatMoney(totals.specialDeposit.debit)}</td>
              <td className={td}></td>
              <td className={td}>{formatMny(totals.specialDeposit.interest)}</td>
              <td className={td}>{formatMoney(totals.compulsoryDeposit.credit)}</td>
              <td className={td}>{formatMoney(totals.compulsoryDeposit.debit)}</td>
              <td className={td}></td>
              <td className={td}>{formatMny(totals.compulsoryDeposit.interest)}</td>
              <td className={td}>{formatMoney(totals.loan.credit)}</td>
              <td className={td}>{formatMoney(totals.loan.debit)}</td>
              <td className={td}></td>
              <td className={td}>{formatMny(totals.loan.interest)}</td>
              <td className={td}>{formatMoney(totals.loanAgainstDeposit.credit)}</td>
              <td className={td}>{formatMoney(totals.loanAgainstDeposit.debit)}</td>
              <td className={td}></td>
              <td className={td}>{formatMny(totals.loanAgainstDeposit.interest)}</td>
            </tr>
            <tr className="font-bold">
              <td className={tdText} colSpan={2}>CLOSING BAL :</td>
              <td className={td} colSpan={3}>{formatMoney(balances?.share)}</td>
              <td className={td} colSpan={3}>{formatMoney(balances?.specialSaving)}</td>
              <td className={td}>{formatMny(balances?.ssaInterest)}</td>
              <td className={td} colSpan={3}>{formatMoney(balances?.compulsoryDeposit)}</td>
              <td className={td}>{formatMny(balances?.cdInterest)}</td>
              <td className={td} colSpan={3}>{formatMoney(balances?.loanOutstanding)}</td>
              <td className={td}>{formatMny(balances?.regularLoanInterest)}</td>
              <td className={td} colSpan={3}>{formatMoney(balances?.loanAgainstDeposit)}</td>
              <td className={td}>{formatMny(balances?.ladInterest)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-1 text-[8px] text-slate-500">Intrst : = Interest (per-transaction figures are simple interest on the balance since the prior transaction, at the configured rate; CLOSING BAL figures are as migrated)</p>

      <div className="mt-14 flex justify-between text-[12px] font-bold">
        <span>Signature</span>
        <span>Computer Clerk</span>
        <span>Manager</span>
      </div>
    </PrintShell>
  );
}

export default MemberLedgerPrintTemplate;

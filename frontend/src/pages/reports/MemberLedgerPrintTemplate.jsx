import React from 'react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

export function MemberLedgerPrintTemplate({ payload, headerActions }) {
  if (!payload || !payload.member) {
    return <div className="p-8 text-center text-slate-500">No member data available.</div>;
  }

  const { member, balances, rows } = payload;

  const headerStyle = "border border-black p-1 text-center font-bold text-[10px] bg-gray-100";
  const cellStyle = "border border-black p-1 text-right text-[10px] font-mono";
  const textCellStyle = "border border-black p-1 text-[10px]";

  const formatMny = (val) => val === 0 ? '-' : formatCurrency(val);

  return (
    <div className="w-full bg-white print:bg-white text-black p-4">
      {/* Header Actions for Web View */}
      <div className="flex justify-end print:hidden mb-4">
        {headerActions}
      </div>

      <div className="w-full max-w-[1100px] mx-auto print:max-w-none">
        
        {/* Report Header */}
        <div className="text-center mb-4">
          <h1 className="text-lg font-bold uppercase tracking-wider">MEMBER LEDGER REPORT</h1>
          <p className="text-xs">Generated on: {formatDateTime(new Date())}</p>
        </div>

        {/* Member Details */}
        <div className="border border-black mb-4 grid grid-cols-2 text-xs">
          <div className="p-2 border-r border-black">
            <p><strong>Member Name:</strong> {member.name || '-'}</p>
            <p><strong>PF / Code:</strong> {member.code || member.pfNo || '-'}</p>
            <p><strong>Branch:</strong> {member.branchCode || '-'}</p>
          </div>
          <div className="p-2">
            <p><strong>Membership No:</strong> {member.membershipNo || '-'}</p>
            <p><strong>Status:</strong> {member.status || '-'}</p>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-black min-w-max">
            <thead>
              <tr>
                <th className={headerStyle} rowSpan={2}>Date</th>
                <th className={headerStyle} rowSpan={2}>Voucher No</th>
                
                <th className={headerStyle} colSpan={3}>Share</th>
                <th className={headerStyle} colSpan={3}>Special Deposit</th>
                <th className={headerStyle} colSpan={3}>Compulsory Deposit</th>
                <th className={headerStyle} colSpan={3}>Regular Loan</th>
                <th className={headerStyle} colSpan={3}>Loan Against Deposit</th>
              </tr>
              <tr>
                <th className={headerStyle}>Cr</th>
                <th className={headerStyle}>Dr</th>
                <th className={headerStyle}>Bal</th>
                
                <th className={headerStyle}>Cr</th>
                <th className={headerStyle}>Dr</th>
                <th className={headerStyle}>Bal</th>

                <th className={headerStyle}>Cr</th>
                <th className={headerStyle}>Dr</th>
                <th className={headerStyle}>Bal</th>

                <th className={headerStyle}>Dr</th>
                <th className={headerStyle}>Cr</th>
                <th className={headerStyle}>Bal</th>

                <th className={headerStyle}>Dr</th>
                <th className={headerStyle}>Cr</th>
                <th className={headerStyle}>Bal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.isOpening ? 'bg-gray-50 font-bold' : ''}>
                  <td className={textCellStyle}>{r.date}</td>
                  <td className={textCellStyle}>{r.voucherNo}</td>
                  
                  {/* Share */}
                  <td className={cellStyle}>{formatMny(r.share?.credit)}</td>
                  <td className={cellStyle}>{formatMny(r.share?.debit)}</td>
                  <td className={cellStyle}>{formatMny(r.share?.balance)}</td>

                  {/* Special Deposit */}
                  <td className={cellStyle}>{formatMny(r.specialDeposit?.credit)}</td>
                  <td className={cellStyle}>{formatMny(r.specialDeposit?.debit)}</td>
                  <td className={cellStyle}>{formatMny(r.specialDeposit?.balance)}</td>

                  {/* Compulsory Deposit */}
                  <td className={cellStyle}>{formatMny(r.compulsoryDeposit?.credit)}</td>
                  <td className={cellStyle}>{formatMny(r.compulsoryDeposit?.debit)}</td>
                  <td className={cellStyle}>{formatMny(r.compulsoryDeposit?.balance)}</td>

                  {/* Regular Loan - Dr/Cr swapped since Loan is Dr balance */}
                  <td className={cellStyle}>{formatMny(r.loan?.debit)}</td>
                  <td className={cellStyle}>{formatMny(r.loan?.credit)}</td>
                  <td className={cellStyle}>{formatMny(r.loan?.balance)}</td>

                  {/* LAD */}
                  <td className={cellStyle}>{formatMny(r.loanAgainstDeposit?.debit)}</td>
                  <td className={cellStyle}>{formatMny(r.loanAgainstDeposit?.credit)}</td>
                  <td className={cellStyle}>{formatMny(r.loanAgainstDeposit?.balance)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={17} className="text-center p-4 border border-black text-sm">No transactions found for the selected period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer Summary */}
        {rows.length > 0 && (
          <div className="mt-4 grid grid-cols-5 gap-2 text-xs font-bold border border-black p-2 bg-gray-50">
            <div>Share Bal: {formatMny(balances?.share)}</div>
            <div>Spcl Dep Bal: {formatMny(balances?.specialDeposit)}</div>
            <div>CD Bal: {formatMny(balances?.compulsoryDeposit)}</div>
            <div>Loan Bal: {formatMny(balances?.loanOutstanding)}</div>
            <div>LAD Bal: {formatMny(balances?.loanAgainstDeposit)}</div>
          </div>
        )}

      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
          .print\\:max-w-none { max-width: none !important; }
        }
      `}</style>
    </div>
  );
}

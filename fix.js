const fs = require('fs');
const file = 'd:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx';
let content = fs.readFileSync(file, 'utf8');

const startStr = 'const headerCards = customHeaderCards || (isLoan ? [';
const endStr = '<div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">';

  const startIndex = content.indexOf(startStr);
  const endIndex = content.indexOf(endStr);

  if (startIndex !== -1 && endIndex !== -1) {
      const newContent = content.slice(0, startIndex) + 
`const headerCards = customHeaderCards || (isLoan ? [
    { label: 'Loan Amt', value: formatTransactionAmount(Number(details.components?.loanAmt || 0)) },
    { label: 'LAD', value: formatTransactionAmount(Number(details.components?.lad || 0)) },
    { label: 'Mode', value: formatTransactionModeLabel(record.mode) },
    { label: 'Docs', value: String(documentCount) }
  ] : isDeposit ? [
    { label: 'Amount', value: mainAmount },
    { label: 'Settlement', value: settlementLabel || '—' },
    { label: 'Mode', value: formatTransactionModeLabel(record.mode) },
    { label: 'Docs', value: String(documentCount) }
  ] : isInsurance ? [
    { label: 'Amount', value: mainAmount },
    { label: 'Policy', value: details.policyNo || '—' },
    { label: 'Claim', value: details.claimRef || '—' },
    { label: 'Docs', value: String(documentCount) }
  ] : isSsa ? [
    { label: 'Amount', value: mainAmount },
    { label: 'Paymode', value: payModeLabel },
    { label: 'Cheque', value: instrumentNoLabel },
    { label: 'SMS', value: smsLabel }
  ] : [
    { label: 'Amount', value: mainAmount },
    { label: 'Lines', value: String(recoveryLines.length || 0) },
    { label: 'Mode', value: formatTransactionModeLabel(record.mode) },
    { label: 'Instrument', value: instrumentNoLabel }
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 print:hidden">
        <button type="button" onClick={() => navigate(detailPathBase || `/app/transactions/${sectionKey}`)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">{activeItem?.label || section?.label || sectionKey} Detail</span>
      </div>

      ` + content.slice(endIndex);
      fs.writeFileSync(file, newContent, 'utf8');
      console.log('Successfully fixed corrupted block.');
  } else {
      console.log('Could not find start or end index.');
  }

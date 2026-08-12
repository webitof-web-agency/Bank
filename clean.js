const fs = require('fs');
let code = fs.readFileSync('d:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx', 'utf-8');
const lines = code.split('\n');
const fixedLines = lines.map(line => {
  if (line.includes('value={record.createdBy ||')) return '                <DetailRow label="Created By" value={record.createdBy || \\\'-\\\'} />';
  if (line.includes('value={record.approvedBy ||')) return '                <DetailRow label="Approved By" value={record.approvedBy || \\\'-\\\'} />';
  if (line.includes('value={record.branchCode ||')) return '                <DetailRow label="Branch" value={record.branchCode || \\\'-\\\'} />';
  if (line.includes('value={record.fyCode ||')) return '                <DetailRow label="FY Code" value={record.fyCode || \\\'-\\\'} />';
  if (line.includes('value={record.transactionType ||')) return '                <DetailRow label="Transaction Type" value={record.transactionType || \\\'-\\\'} />';
  if (line.includes('value={record.reversalOf ||')) return '                <DetailRow label="Reversal Of" value={record.reversalOf || \\\'-\\\'} />';
  if (line.includes('value={details.fixedSettlement ||')) return '                <DetailRow label="Fixed Settlement" value={details.fixedSettlement || \\\'-\\\'} />';
  if (line.includes('const fixedSettlementLabel = details.fixedSettlement ||')) return '    const fixedSettlementLabel = details.fixedSettlement || \\\'-\\\';';
  return line;
});
fs.writeFileSync('d:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx', fixedLines.join('\n'), 'utf-8');
console.log('Fixed gibberish');

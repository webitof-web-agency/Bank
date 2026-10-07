import { TwoColumnBalancePrint } from './TwoColumnBalancePrint';
import { formatDMY } from './printStyles';

export function BalanceSheetPrint({ data, filters, headerActions }) {
  const liabilities = (Array.isArray(data?.liabilities) ? data.liabilities : []).filter((row) => Number(row.amount) !== 0);
  const assets = (Array.isArray(data?.assets) ? data.assets : []).filter((row) => Number(row.amount) !== 0);
  const totalLiabilities = data?.totalLiabilities ?? liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalAssets = data?.totalAssets ?? assets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());

  const leftRows = liabilities.map((row) => ({ label: row.ledgerName, amount: row.amount }));
  const rightRows = assets.map((row) => ({ label: row.ledgerName, amount: row.amount }));
  // Legacy always prints the Profit & Loss A/c line (0.00 once the year is
  // closed); it sits on whichever side balances it.
  const profitLoss = data?.profitLoss;
  if (profitLoss) {
    const line = { label: `${profitLoss.ledgerName} :`, amount: profitLoss.amount, bold: true, keepZero: true };
    (profitLoss.side === 'LIABILITY' ? leftRows : rightRows).push(line);
  }

  return (
    <TwoColumnBalancePrint
      headerActions={headerActions}
      title={`BALANCE SHEET AS ON ${asOn}`}
      meta="Page 1 of 1"
      leftHeading="LIABILITIES"
      rightHeading="ASSETS"
      leftRows={leftRows}
      rightRows={rightRows}
      leftTotalLabel="LIABILITIES TOTAL :"
      rightTotalLabel="ASSETS TOTAL :"
      leftTotal={totalLiabilities}
      rightTotal={totalAssets}
      showSignatures
    />
  );
}

export default BalanceSheetPrint;

import { TwoColumnBalancePrint } from './TwoColumnBalancePrint';
import { formatDMY } from './printStyles';

export function BalanceSheetPrint({ data, filters, headerActions }) {
  const liabilities = Array.isArray(data?.liabilities) ? data.liabilities : [];
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  const totalLiabilities = data?.totalLiabilities ?? liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalAssets = data?.totalAssets ?? assets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());

  return (
    <TwoColumnBalancePrint
      headerActions={headerActions}
      title={`BALANCE SHEET AS ON ${asOn}`}
      meta="Page 1 of 1"
      leftHeading="LIABILITIES"
      rightHeading="ASSETS"
      leftRows={liabilities.map((row) => ({ label: row.ledgerName, amount: row.amount }))}
      rightRows={assets.map((row) => ({ label: row.ledgerName, amount: row.amount }))}
      leftTotalLabel="LIABILITIES TOTAL :"
      rightTotalLabel="ASSETS TOTAL :"
      leftTotal={totalLiabilities}
      rightTotal={totalAssets}
    />
  );
}

export default BalanceSheetPrint;

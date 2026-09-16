import { TwoColumnBalancePrint } from './TwoColumnBalancePrint';
import { formatDMY, formatMoney } from './printStyles';

export function TrialBalancePrint({ data, filters, headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const liabilities = rows.filter((row) => String(row.closingSide || row.balanceSide || '').toUpperCase() === 'CR');
  const assets = rows.filter((row) => String(row.closingSide || row.balanceSide || '').toUpperCase() !== 'CR');
  const balanceOf = (row) => Number(row.closing ?? row.balance ?? row.debit ?? row.credit ?? 0);
  const totalLiabilities = liabilities.reduce((sum, row) => sum + balanceOf(row), 0);
  const totalAssets = assets.reduce((sum, row) => sum + balanceOf(row), 0);
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());
  const diff = totalLiabilities - totalAssets;

  return (
    <TwoColumnBalancePrint
      headerActions={headerActions}
      title={`TRIAL BALANCE AS ON ${asOn}`}
      meta="Page 1 of 1"
      leftHeading="LIABILITIES"
      rightHeading="ASSETS"
      leftRows={liabilities.map((row) => ({ label: row.ledgerName, amount: balanceOf(row) }))}
      rightRows={assets.map((row) => ({ label: row.ledgerName, amount: balanceOf(row) }))}
      leftTotalLabel="LIABILITIES TOTAL :"
      rightTotalLabel="ASSETS TOTAL :"
      leftTotal={totalLiabilities}
      rightTotal={totalAssets}
      extraFooterLine={`Diffrence Amount :  ${formatMoney(Math.abs(diff))} ${diff >= 0 ? 'CR' : 'DR'}`}
      showSignatures
    />
  );
}

export default TrialBalancePrint;

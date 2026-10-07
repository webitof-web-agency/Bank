import { TwoColumnBalancePrint } from './TwoColumnBalancePrint';
import { formatDMY, formatMoney } from './printStyles';

// Legacy layout: Liabilities ledgers + "Adjusting Head Income" (all Income
// ledgers as one line) against Assets ledgers + "Adjusting Head Expenses" +
// "Profit & Loss A/c". Amounts use the credit-positive signedBalance, shown
// per side (a contra balance prints negative rather than switching sides).
export function TrialBalancePrint({ data, filters, headerActions }) {
  const rows = Array.isArray(data) ? data : [];
  const signed = (row) => Number(row.signedBalance ?? 0);
  const ofNature = (nature) => rows.filter((row) => String(row.nature || '').toUpperCase() === nature);
  const total = (list, sign) => list.reduce((sum, row) => sum + sign * signed(row), 0);
  const round = (value) => Number(value.toFixed(2));

  const leftRows = ofNature('LIABILITY')
    .filter((row) => signed(row) !== 0)
    .map((row) => ({ label: row.ledgerName, amount: round(signed(row)) }));
  const rightRows = ofNature('ASSET')
    .filter((row) => signed(row) !== 0)
    .map((row) => ({ label: row.ledgerName, amount: round(-signed(row)) }));

  const income = round(total(ofNature('INCOME'), 1));
  const expenses = round(total(ofNature('EXPENSE'), -1));
  const profitLoss = round(total(ofNature('PRIMARY'), 1));
  if (income) leftRows.push({ label: 'Adjusting Head Income', amount: income });
  if (expenses) rightRows.push({ label: 'Adjusting Head Expenses', amount: expenses });
  if (profitLoss > 0) leftRows.push({ label: 'Profit & Loss A/c', amount: profitLoss });
  else if (profitLoss < 0) rightRows.push({ label: 'Profit & Loss A/c', amount: -profitLoss });

  const totalLiabilities = round(leftRows.reduce((sum, row) => sum + row.amount, 0));
  const totalAssets = round(rightRows.reduce((sum, row) => sum + row.amount, 0));
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());
  const diff = round(totalLiabilities - totalAssets);

  return (
    <TwoColumnBalancePrint
      headerActions={headerActions}
      title={`TRIAL BALANCE AS ON ${asOn}`}
      meta="Page 1 of 1"
      leftHeading="LIABILITIES"
      rightHeading="ASSETS"
      leftRows={leftRows}
      rightRows={rightRows}
      leftTotalLabel="LIABILITIES TOTAL :"
      rightTotalLabel="ASSETS TOTAL :"
      leftTotal={totalLiabilities}
      rightTotal={totalAssets}
      extraFooterLine={`Diffrence Amount :  ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'CR' : 'DR'}`}
      showSignatures
    />
  );
}

export default TrialBalancePrint;

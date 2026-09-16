import { TwoColumnBalancePrint } from './TwoColumnBalancePrint';
import { formatDMY } from './printStyles';

export function ProfitLossPrint({ data, filters, headerActions }) {
  const income = Array.isArray(data?.income) ? data.income : [];
  const expense = Array.isArray(data?.expense) ? data.expense : [];
  const totalIncome = data?.totalIncome ?? income.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalExpense = data?.totalExpense ?? expense.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const asOn = formatDMY(filters?.date) || formatDMY(new Date());

  return (
    <TwoColumnBalancePrint
      headerActions={headerActions}
      title={`Statement of Income & Expenditure Account as on ${asOn}`}
      meta="Page 1 of 1"
      leftHeading="PROFIT"
      rightHeading="LOSS"
      leftRows={income.map((row) => ({ label: row.ledgerName, amount: row.amount }))}
      rightRows={expense.map((row) => ({ label: row.ledgerName, amount: row.amount }))}
      leftTotalLabel="PROFIT TOTAL :"
      rightTotalLabel="LOSS TOTAL :"
      leftTotal={totalIncome}
      rightTotal={totalExpense}
      showSignatures
    />
  );
}

export default ProfitLossPrint;

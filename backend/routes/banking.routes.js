const express = require('express');
const { requirePermission } = require('../middlewares/auth');
const banking = require('../controllers/banking.controller');

const router = express.Router();

function registerCrud(basePath, controllerGroup, readPermission, writePermission) {
  router.get(basePath, requirePermission(readPermission), controllerGroup.list);
  router.post(basePath, requirePermission(writePermission), controllerGroup.create);
  router.get(`${basePath}/:id`, requirePermission(readPermission), controllerGroup.get);
  router.put(`${basePath}/:id`, requirePermission(writePermission), controllerGroup.update);
  router.delete(`${basePath}/:id`, requirePermission(writePermission), controllerGroup.delete);
}

router.get('/dashboard', requirePermission('dashboard.read'), banking.reports.dashboard);
router.get('/meta', requirePermission('dashboard.read'), banking.reports.lookups);
router.get('/lookups', requirePermission('dashboard.read'), banking.reports.lookups);

router.get('/masters/society', requirePermission('society.read'), banking.resources.society.get);
router.put('/masters/society', requirePermission('society.write'), banking.resources.society.update);

router.get('/masters/committee', requirePermission('committee.read'), banking.resources.committee.get);
router.put('/masters/committee', requirePermission('committee.write'), banking.resources.committee.update);

registerCrud('/masters/branches', banking.resources.branches, 'branches.read', 'branches.write');
registerCrud('/masters/employees', banking.resources.employees, 'employees.read', 'employees.write');
registerCrud('/masters/members', banking.resources.members, 'members.read', 'members.write');
registerCrud('/masters/ledgers', banking.resources.ledgers, 'ledgers.read', 'ledgers.write');
registerCrud('/masters/rates', banking.resources.rates, 'rates.read', 'rates.write');
registerCrud('/masters/bank-accounts', banking.resources.bankAccounts, 'bank-accounts.read', 'bank-accounts.write');
registerCrud('/masters/demands', banking.resources.demands, 'demands.read', 'demands.write');
registerCrud('/masters/no-interest-members', banking.resources.noInterestMembers, 'no-interest-members.read', 'no-interest-members.write');
registerCrud('/masters/bank-transactions', banking.resources.bankTransactions, 'bank-transactions.read', 'bank-transactions.write');

router.get(
  '/transactions/catalog',
  requirePermission('transactions.read', 'bank-transactions.read', 'demands.read', 'no-interest-members.read'),
  banking.transactions.catalog
);
router.get('/transactions/vouchers', requirePermission('transactions.read'), banking.transactions.listVouchers);
router.post('/transactions/vouchers', requirePermission('transactions.write'), banking.transactions.createVoucher);
router.get('/transactions/vouchers/:id', requirePermission('transactions.read'), banking.transactions.getVoucher);
router.put('/transactions/vouchers/:id', requirePermission('transactions.write'), banking.transactions.updateVoucher);
router.delete('/transactions/vouchers/:id', requirePermission('transactions.write'), banking.transactions.deleteVoucher);
router.post('/transactions/vouchers/:id/reverse', requirePermission('transactions.reverse'), banking.transactions.reverseVoucher);

router.get('/transactions/bank-transactions', requirePermission('bank-transactions.read'), banking.transactions.listBankTransactions);
router.post('/transactions/bank-transactions', requirePermission('bank-transactions.write'), banking.transactions.createBankTransaction);
router.put('/transactions/bank-transactions/:id', requirePermission('bank-transactions.write'), banking.transactions.updateBankTransaction);
router.delete('/transactions/bank-transactions/:id', requirePermission('bank-transactions.write'), banking.transactions.deleteBankTransaction);

router.get('/reports/member-ledger', requirePermission('reports.read'), banking.reports.memberLedger);
router.get('/reports/member-account-status', requirePermission('reports.read'), banking.reports.memberLedger);
router.get('/reports/account-statement', requirePermission('reports.read'), banking.reports.accountStatement);
router.get('/reports/trial-balance', requirePermission('reports.read'), banking.reports.trialBalance);
router.get('/reports/balance-sheet', requirePermission('reports.read'), banking.reports.balanceSheet);
router.get('/reports/profit-loss', requirePermission('reports.read'), banking.reports.profitLoss);
router.get('/reports/cash-book', requirePermission('reports.read'), banking.reports.cashBook);
router.get('/reports/day-book', requirePermission('reports.read'), banking.reports.dayBook);
router.get('/reports/voucher-summary', requirePermission('reports.read'), banking.reports.voucherSummary);
router.get('/reports/monthly-summary', requirePermission('reports.read'), banking.reports.monthlySummary);
router.get('/reports/demand-list', requirePermission('reports.read'), banking.reports.demandList);
router.get('/reports/all-member-list', requirePermission('reports.read'), banking.reports.allMemberList);
router.get('/reports/payment-receipt-statement', requirePermission('reports.read'), banking.reports.paymentReceiptStatement);
router.get('/reports/branch-list', requirePermission('reports.read'), banking.reports.branchList);
router.get('/reports/dividend-report', requirePermission('reports.read'), banking.reports.dividendReport);

module.exports = router;

const express = require('express');
const { requirePermission } = require('../middlewares/auth');
const banking = require('../controllers/banking.controller');

const router = express.Router();

// Every route checks the exact page and action (Settings -> Roles):
// <section>.<page>.view / create / edit / delete. Listing several codes
// means any one of them is enough.
const page = (section, key) => ({
  view: `${section}.${key}.view`,
  create: `${section}.${key}.create`,
  edit: `${section}.${key}.edit`,
  delete: `${section}.${key}.delete`
});

// Forms on most pages need these dropdown lists (members, ledgers, ...), so
// any page that shows a form or report may load them.
const LOOKUP_PERMISSIONS = [
  'dashboard.read', 'transactions.read', 'reports.read', 'members.read', 'employees.read', 'ledgers.read', 'branches.read',
  'demands.read', 'no-interest-members.read', 'bank-accounts.read', 'rates.read', 'committee.read', 'society.read'
];

router.get('/dashboard', requirePermission('workspace.dashboard.view'), banking.reports.dashboard);
router.get('/meta', requirePermission(...LOOKUP_PERMISSIONS), banking.reports.lookups);
router.get('/lookups', requirePermission(...LOOKUP_PERMISSIONS), banking.reports.lookups);

const society = page('master', 'society');
router.get('/masters/society', requirePermission(society.view), banking.resources.society.get);
router.put('/masters/society', requirePermission(society.edit), banking.resources.society.update);

const committee = page('master', 'committee');
router.get('/masters/committee', requirePermission(committee.view), banking.resources.committee.get);
router.put('/masters/committee', requirePermission(committee.create, committee.edit, committee.delete), banking.resources.committee.update);

// Restoring a deleted record undoes a delete: it needs the delete permission.
function registerCrud(basePath, controllerGroup, perms) {
  router.get(basePath, requirePermission(perms.view), controllerGroup.list);
  router.post(basePath, requirePermission(perms.create), controllerGroup.create);
  router.get(`${basePath}/:id`, requirePermission(perms.view), controllerGroup.get);
  router.put(`${basePath}/:id`, requirePermission(perms.edit), controllerGroup.update);
  router.delete(`${basePath}/:id`, requirePermission(perms.delete), controllerGroup.delete);
  if (controllerGroup.restore) {
    router.post(`${basePath}/:id/restore`, requirePermission(perms.delete), controllerGroup.restore);
  }
}

const demands = page('master', 'demands');
registerCrud('/masters/branches', banking.resources.branches, page('master', 'branches'));
registerCrud('/masters/employees', banking.resources.employees, page('master', 'employees'));
registerCrud('/masters/members', banking.resources.members, page('master', 'members'));
registerCrud('/masters/ledgers', banking.resources.ledgers, page('master', 'ledgers'));
const rates = page('master', 'rates');
router.get('/masters/rates', requirePermission(rates.view), banking.resources.rates.get);
router.put('/masters/rates', requirePermission(rates.create, rates.edit, rates.delete), banking.resources.rates.update);
registerCrud('/masters/bank-accounts', banking.resources.bankAccounts, page('master', 'bank-accounts'));
registerCrud('/masters/demand-lists', banking.resources.demandLists, demands);
registerCrud('/masters/demand-lines', banking.resources.demandLines, demands);
registerCrud('/masters/member-demand-defaults', banking.resources.memberDemandDefaults, demands);
registerCrud('/masters/recovery-lines', banking.resources.recoveryLines, demands);
registerCrud('/masters/no-interest-members', banking.resources.noInterestMembers, page('master', 'no-interest-members'));
registerCrud('/masters/bank-transactions', banking.resources.bankTransactions, page('transactions', 'bank'));

router.get(
  '/transactions/catalog',
  requirePermission('transactions.read', 'demands.read', 'no-interest-members.read'),
  banking.transactions.catalog
);

// Demand Entry: the Demands master page, or the Transactions -> Supporting page.
const supporting = page('transactions', 'supporting');
router.get('/demand-entry', requirePermission(demands.view, supporting.view), banking.reports.demandEntryList);
router.get('/demand-entry/members', requirePermission(demands.create, demands.edit, supporting.create, supporting.edit), banking.reports.demandEntryMembers);
router.get('/demand-entry/:id', requirePermission(demands.view, supporting.view), banking.reports.demandEntryGet);
router.post('/demand-entry', requirePermission(demands.create, supporting.create), banking.reports.demandEntrySave);
router.put('/demand-entry/:id', requirePermission(demands.edit, supporting.edit), banking.reports.demandEntrySave);
router.delete('/demand-entry/:id', requirePermission(demands.delete, supporting.delete), banking.reports.demandEntryDelete);

const memberTransactions = page('transactions', 'member');
router.get('/transactions/recovery/demand-candidates', requirePermission(memberTransactions.view), banking.reports.recoveryDemandCandidates);
router.get('/transactions/vouchers/next', requirePermission('transactions.read'), banking.transactions.getNextVoucher);
// Vouchers: any transaction page here; the controller then checks the page
// of the voucher's own type (Member, Bank, Employee, ...).
router.get('/transactions/vouchers', requirePermission('transactions.read'), banking.transactions.listVouchers);
router.post('/transactions/vouchers', requirePermission('transactions.write'), banking.transactions.createVoucher);
router.get('/transactions/vouchers/:id', requirePermission('transactions.read'), banking.transactions.getVoucher);
router.get('/transactions/vouchers/:id/sms', requirePermission('transactions.read'), banking.transactions.getVoucherSms);
router.put('/transactions/vouchers/:id', requirePermission('transactions.write'), banking.transactions.updateVoucher);
router.delete('/transactions/vouchers/:id', requirePermission('transactions.write'), banking.transactions.deleteVoucher);
router.post('/transactions/vouchers/:id/restore', requirePermission('transactions.write'), banking.transactions.restoreVoucher);

router.get('/audit-log', requirePermission('admin.audit-trail.view'), banking.auditLog.list);

// Each report needs its own page's View.
const report = (key) => requirePermission(`reports.${key}.view`);
router.get('/reports/member-ledger', report('member-ledger'), banking.reports.memberLedger);
router.get('/reports/employee-ledger', report('employee-ledger'), banking.reports.employeeLedger);
router.get('/reports/member-account-status', report('member-ledger'), banking.reports.memberLedger);
router.get('/reports/account-statement', report('account-statement-view'), banking.reports.accountStatement);
router.get('/reports/trial-balance', report('trial-balance'), banking.reports.trialBalance);
router.get('/reports/balance-sheet', report('balance-sheet'), banking.reports.balanceSheet);
router.get('/reports/profit-loss', report('profit-loss'), banking.reports.profitLoss);
router.get('/reports/cash-book', report('cash-book'), banking.reports.cashBook);
router.get('/reports/day-book', report('day-book'), banking.reports.dayBook);
router.get('/reports/voucher-summary', report('voucher-summary'), banking.reports.voucherSummary);
router.get('/reports/monthly-summary', report('summary-monthly'), banking.reports.monthlySummary);
router.get('/reports/demand-list', report('demand-list-report'), banking.reports.demandList);
router.get('/reports/all-member-list', report('all-member-list'), banking.reports.allMemberList);
router.get('/reports/payment-receipt-statement', report('payment-receipt-statement'), banking.reports.paymentReceiptStatement);
router.get('/reports/branch-list', report('branch-list-report'), banking.reports.branchList);
router.get('/reports/dividend-report', report('dividend-report'), banking.reports.dividendReport);

module.exports = router;

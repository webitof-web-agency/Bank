const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

const BankAccount = createSqlModel('bank_accounts', {
  schema: TABLE_SCHEMAS.bank_accounts,
  modelName: 'BankAccount',
  uniqueFields: ['code']
});

const BankTransaction = createSqlModel('bank_transactions', {
  schema: TABLE_SCHEMAS.bank_transactions,
  modelName: 'BankTransaction',
  uniqueFields: ['transactionNo']
});

const Branch = createSqlModel('branches', {
  schema: TABLE_SCHEMAS.branches,
  modelName: 'Branch',
  uniqueFields: ['code']
});

const Committee = createSqlModel('committees', {
  schema: TABLE_SCHEMAS.committees,
  modelName: 'Committee',
  uniqueFields: ['key']
});

const Manager = createSqlModel('managers', {
  schema: TABLE_SCHEMAS.managers,
  modelName: 'Manager',
  uniqueFields: []
});

const Demand = createSqlModel('demands', {
  schema: TABLE_SCHEMAS.demands,
  modelName: 'Demand',
  uniqueFields: ['demandNo']
});

const Ledger = createSqlModel('ledgers', {
  schema: TABLE_SCHEMAS.ledgers,
  modelName: 'Ledger',
  uniqueFields: ['code']
});

const Member = createSqlModel('members', {
  schema: TABLE_SCHEMAS.members,
  modelName: 'Member',
  uniqueFields: ['code']
});

const NoInterestMember = createSqlModel('no_interest_members', {
  schema: TABLE_SCHEMAS.no_interest_members,
  modelName: 'NoInterestMember',
  uniqueFields: ['code']
});

const Rate = createSqlModel('rates', {
  schema: TABLE_SCHEMAS.rates,
  modelName: 'Rate',
  uniqueFields: ['code']
});

const Society = createSqlModel('societies', {
  schema: TABLE_SCHEMAS.societies,
  modelName: 'Society',
  uniqueFields: ['key']
});

const Voucher = createSqlModel('vouchers', {
  schema: TABLE_SCHEMAS.vouchers,
  modelName: 'Voucher',
  uniqueFields: ['voucherNo']
});

module.exports = {
  BankAccount,
  BankTransaction,
  Branch,
  Committee,
  Manager,
  Demand,
  Ledger,
  Member,
  NoInterestMember,
  Rate,
  Society,
  Voucher
};



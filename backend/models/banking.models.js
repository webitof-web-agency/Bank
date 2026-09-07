const { createSqlModel } = require('../utils/sql-model');
const { TABLE_SCHEMAS } = require('../config/tableSchemas');

const BankAccount = createSqlModel('bank_accounts', {
  schema: TABLE_SCHEMAS.bank_accounts,
  modelName: 'BankAccount',
  uniqueFields: ['code']
});

const JournalLine = createSqlModel('journal_lines', {
  schema: TABLE_SCHEMAS.journal_lines,
  modelName: 'JournalLine',
  uniqueFields: []
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

const CommitteeDirector = createSqlModel('committee_directors', {
  schema: TABLE_SCHEMAS.committee_directors,
  modelName: 'CommitteeDirector',
  uniqueFields: []
});

const Employee = createSqlModel('employees', {
  schema: TABLE_SCHEMAS.employees,
  modelName: 'Employee',
  uniqueFields: ['code']
});

const DemandList = createSqlModel('demand_lists', {
  schema: TABLE_SCHEMAS.demand_lists,
  modelName: 'DemandList',
  uniqueFields: ['demandListNo']
});

const DemandLine = createSqlModel('demand_lines', {
  schema: TABLE_SCHEMAS.demand_lines,
  modelName: 'DemandLine',
  uniqueFields: []
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

const MemberDemandDefault = createSqlModel('member_demand_defaults', {
  schema: TABLE_SCHEMAS.member_demand_defaults,
  modelName: 'MemberDemandDefault',
  uniqueFields: ['memberCode']
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

const RecoveryLine = createSqlModel('recovery_lines', {
  schema: TABLE_SCHEMAS.recovery_lines,
  modelName: 'RecoveryLine',
  uniqueFields: []
});

const RecoveryImportBatch = createSqlModel('recovery_import_batches', {
  schema: TABLE_SCHEMAS.recovery_import_batches,
  modelName: 'RecoveryImportBatch',
  uniqueFields: []
});

const RecoveryImportRow = createSqlModel('recovery_import_rows', {
  schema: TABLE_SCHEMAS.recovery_import_rows,
  modelName: 'RecoveryImportRow',
  uniqueFields: []
});

const FinancialYear = createSqlModel('financial_years', {
  schema: TABLE_SCHEMAS.financial_years,
  modelName: 'FinancialYear',
  uniqueFields: ['code']
});

module.exports = {
  BankAccount,
  JournalLine,
  Branch,
  Committee,
  CommitteeDirector,
  Employee,
  DemandList,
  DemandLine,
  Ledger,
  Member,
  MemberDemandDefault,
  NoInterestMember,
  Rate,
  Society,
  Voucher,
  RecoveryLine,
  RecoveryImportBatch,
  RecoveryImportRow,
  FinancialYear
};



const { Schema, model, models } = require('mongoose');
const { schemaOptions } = require('../utils/mongoose');

const balanceSchema = new Schema(
  {
    share: { type: Number, default: 0 },
    compulsoryDeposit: { type: Number, default: 0 },
    specialSaving: { type: Number, default: 0 },
    providentFund: { type: Number, default: 0 },
    loanAgainstDeposit: { type: Number, default: 0 },
    insurancePremium: { type: Number, default: 0 }
  },
  { _id: false }
);

const journalLineSchema = new Schema(
  {
    ledgerCode: { type: String, required: true, trim: true },
    dr: { type: Number, default: 0 },
    cr: { type: Number, default: 0 },
    memo: { type: String, default: '' }
  },
  { _id: false }
);

const societySchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    name: { type: String, required: true, trim: true },
    prefix: { type: String, default: '' },
    regNo: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    branchCode: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    watermarkUrl: { type: String, default: '' },
    footerText: { type: String, default: '' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const branchSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    label: { type: String, required: true, trim: true },
    place: { type: String, default: '' },
    address: { type: String, default: '' },
    district: { type: String, default: '' },
    phone: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const memberSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    fatherOrHusbandName: { type: String, default: '' },
    branchCode: { type: String, default: '' },
    category: { type: String, default: '' },
    caste: { type: String, default: '' },
    designation: { type: String, default: '' },
    serviceName1: { type: String, default: '' },
    serviceName2: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    membershipDate: { type: String, default: '' },
    appointmentDate: { type: String, default: '' },
    membershipNo: { type: String, default: '' },
    address: { type: String, default: '' },
    mobileNo: { type: String, default: '' },
    openingBalance: { type: Number, default: 0 },
    balances: { type: balanceSchema, default: () => ({}) },
    loanOutstanding: { type: Number, default: 0 },
    depositBalance: { type: Number, default: 0 },
    nomineeName: { type: String, default: '' },
    nomineeRelation: { type: String, default: '' },
    photoUrl: { type: String, default: '' },
    photoFileId: { type: Schema.Types.ObjectId, ref: 'FileAsset', default: null },
    documentsFolderId: { type: Schema.Types.ObjectId, ref: 'FileFolder', default: null },
    documents: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: 'Active' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const committeeSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    chairman: { type: String, default: '' },
    viceChairman: { type: String, default: '' },
    directors: { type: [String], default: [] },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const ledgerSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    nature: { type: String, enum: ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'], required: true },
    group: { type: String, default: 'GENERAL' },
    openingBalance: { type: Number, default: 0 },
    balanceSide: { type: String, enum: ['DR', 'CR'], default: 'DR' },
    isBankAccount: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const rateSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    ledgerCode: { type: String, default: '' },
    ledgerName: { type: String, default: '' },
    category: { type: String, default: '' },
    value: { type: Number, default: 0 },
    effectiveFrom: { type: String, default: '' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const bankAccountSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    bankName: { type: String, required: true, trim: true },
    accountHolderName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifsc: { type: String, default: '' },
    branch: { type: String, default: '' },
    accountType: { type: String, default: 'Current' },
    upiId: { type: String, default: '' },
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    isPrimary: { type: Boolean, default: false },
    linkedLedgerCode: { type: String, default: '' },
    status: { type: String, default: 'Active' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const bankTransactionSchema = new Schema(
  {
    transactionNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    date: { type: String, required: true, trim: true },
    bankAccountCode: { type: String, default: '' },
    transactionType: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0 },
    linkedClientCode: { type: String, default: '' },
    linkedProjectCode: { type: String, default: '' },
    linkedInvoiceNo: { type: String, default: '' },
    linkedExpenseCode: { type: String, default: '' },
    notes: { type: String, default: '' },
    voucherNo: { type: String, default: '' },
    status: { type: String, default: 'Posted' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const voucherSchema = new Schema(
  {
    voucherNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    date: { type: String, required: true, trim: true },
    voucherCategory: { type: String, default: '' },
    transactionType: { type: String, default: '' },
    accent: { type: String, enum: ['pink', 'green', 'neutral'], default: 'neutral' },
    partyCode: { type: String, default: '' },
    partyType: { type: String, default: 'ledger' },
    amount: { type: Number, default: 0 },
    mode: { type: String, default: '' },
    status: { type: String, default: 'Draft' },
    narration: { type: String, default: '' },
    referenceNo: { type: String, default: '' },
    instrumentNo: { type: String, default: '' },
    instrumentDate: { type: String, default: '' },
    branchCode: { type: String, default: '' },
    fyCode: { type: String, default: '' },
    reversalOf: { type: String, default: '' },
    approvedBy: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reversedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    documents: { type: Schema.Types.Mixed, default: {} },
    details: { type: Schema.Types.Mixed, default: {} },
    journalLines: { type: [journalLineSchema], default: [] }
  },
  schemaOptions()
);

const demandLineSchema = new Schema(
  {
    memberCode: { type: String, default: '' },
    head: { type: String, default: '' },
    amount: { type: Number, default: 0 }
  },
  { _id: false }
);

const demandSchema = new Schema(
  {
    demandNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    month: { type: String, default: '' },
    branchCode: { type: String, default: '' },
    memberCode: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    total: { type: Number, default: 0 },
    recovered: { type: Number, default: 0 },
    status: { type: String, default: 'Pending' },
    remarks: { type: String, default: '' },
    allocations: { type: [demandLineSchema], default: [] },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

const noInterestMemberSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    memberCode: { type: String, required: true, trim: true, uppercase: true },
    reason: { type: String, default: '' },
    fromDate: { type: String, default: '' },
    toDate: { type: String, default: '' },
    status: { type: String, default: 'Active' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: {} }
  },
  schemaOptions()
);

module.exports = {
  BankAccount: models.BankAccount || model('BankAccount', bankAccountSchema),
  BankTransaction: models.BankTransaction || model('BankTransaction', bankTransactionSchema),
  Branch: models.Branch || model('Branch', branchSchema),
  Committee: models.Committee || model('Committee', committeeSchema),
  Demand: models.Demand || model('Demand', demandSchema),
  Ledger: models.Ledger || model('Ledger', ledgerSchema),
  Member: models.Member || model('Member', memberSchema),
  NoInterestMember: models.NoInterestMember || model('NoInterestMember', noInterestMemberSchema),
  Rate: models.Rate || model('Rate', rateSchema),
  Society: models.Society || model('Society', societySchema),
  Voucher: models.Voucher || model('Voucher', voucherSchema)
};

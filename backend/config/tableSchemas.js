const T = {
  boolean: { type: 'boolean' },
  date: { type: 'date' },
  json: { type: 'json' },
  number: { type: 'number' },
  string(length = 191) {
    return { type: 'string', length };
  },
  text: { type: 'text' }
};

function schema(fields = {}, uniqueFields = []) {
  return {
    fields,
    uniqueFields: Array.isArray(uniqueFields) ? uniqueFields : []
  };
}

const TABLE_SCHEMAS = {
  users: schema({
    code: T.string(80),
    fullName: T.string(191),
    name: T.string(191),
    username: T.string(191),
    email: T.string(191),
    passwordHash: T.string(255),
    mobileNo: T.string(40),
    address: T.text,
    gender: T.string(40),
    designation: T.string(120),
    branchCode: T.string(40),
    status: T.string(40),
    avatarUrl: T.string(255),
    avatarFileId: T.string(40),
    documentsFolderId: T.string(40),
    documents: T.json,
    passwordReset: T.json,
    isActive: T.boolean,
    lastLoginAt: T.date,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code', 'username', 'email']),

  roles: schema({
    code: T.string(120),
    name: T.string(191),
    description: T.text,
    isSystem: T.boolean,
    isActive: T.boolean,
    permissions: T.json,
    payload: T.json
  }, ['code']),

  settings: schema({
    key: T.string(120),
    appName: T.string(191),
    smtp: T.json,
    emailTemplates: T.json,
    notifications: T.json,
    payload: T.json
  }, ['key']),

  notifications: schema({
    recipientUserId: T.string(40),
    actorUserId: T.string(40),
    title: T.string(255),
    message: T.text,
    type: T.string(80),
    severity: T.string(40),
    module: T.string(80),
    action: T.string(120),
    actionUrl: T.text,
    entityType: T.string(120),
    entityId: T.string(80),
    entityCode: T.string(120),
    audience: T.string(120),
    payload: T.json,
    isRead: T.boolean,
    readAt: T.date,
    readByUserId: T.string(40),
    emailSent: T.boolean,
    emailSentAt: T.date,
    emailTo: T.string(191),
    emailError: T.text
  }),

  job_states: schema({
    key: T.string(191),
    lastRunAt: T.date,
    lastRunLabel: T.string(120),
    payload: T.json
  }, ['key']),

  file_folders: schema({
    name: T.string(191),
    parentFolderId: T.string(40),
    createdBy: T.string(40),
    moduleName: T.string(120),
    entityId: T.string(120),
    entityName: T.string(191),
    entityCode: T.string(120),
    payload: T.json
  }, [['parentFolderId', 'name']]),

  file_assets: schema({
    folderId: T.string(40),
    moduleName: T.string(120),
    entityId: T.string(120),
    originalName: T.string(255),
    storedName: T.string(255),
    documentType: T.string(120),
    mimeType: T.string(191),
    sizeBytes: T.number,
    localPath: T.text,
    isPublic: T.boolean,
    createdBy: T.string(40),
    archivedAt: T.date,
    archivedBy: T.string(40),
    payload: T.json
  }),

  societies: schema({
    key: T.string(120),
    code: T.string(40),
    name: T.string(255),
    prefix: T.string(80),
    place: T.string(191),
    regNo: T.string(120),
    email: T.string(191),
    address: T.text,
    branchCode: T.string(40),
    logoUrl: T.string(255),
    logoFileId: T.string(40),
    watermarkEnabled: T.boolean,
    watermarkUrl: T.string(255),
    watermarkFileId: T.string(40),
    footerText: T.text,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['key']),

  branches: schema({
    code: T.string(80),
    headOfficeCode: T.string(40),
    label: T.string(191),
    place: T.string(191),
    address: T.text,
    district: T.string(120),
    phone: T.string(40),
    isActive: T.boolean,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code']),

  committees: schema({
    key: T.string(120),
    chairman: T.string(191),
    viceChairman: T.string(191),
    viceChairman2: T.string(191),
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['key']),

  committee_directors: schema({
    committeeKey: T.string(120),
    name: T.string(191),
    designation: T.string(120),
    orderIndex: T.number
  }),

  employees: schema({
    code: T.string(80),
    name: T.string(191),
    designation: T.string(120),
    branchCode: T.string(40),
    retired: T.boolean,
    retirementDate: T.date,
    homeLoanBalance: T.number,
    homeLoanCrDr: T.string(10),
    vehicleLoanBalance: T.number,
    vehicleLoanCrDr: T.string(10),
    grainAdvanceBalance: T.number,
    grainAdvanceCrDr: T.string(10),
    documentsFolderId: T.string(40),
    documents: T.json,
    isActive: T.boolean,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code']),

  members: schema({
    code: T.string(80),
    name: T.string(191),
    fatherOrHusbandName: T.string(191),
    branchCode: T.string(40),
    category: T.string(80),
    caste: T.string(80),
    designation: T.string(120),
    serviceName1: T.string(191),
    serviceName2: T.string(191),
    dateOfBirth: T.date,
    membershipDate: T.date,
    appointmentDate: T.date,
    membershipNo: T.string(80),
    pfNo: T.string(80),
    dismembered: T.boolean,
    dismemberedDate: T.date,
    suretyName1: T.string(191),
    suretyName2: T.string(191),
    address: T.text,
    mobileNo: T.string(40),
    basicSalary: T.number,
    openingBalance: T.number,
    openingBalanceCrDr: T.string(10),
    balances: T.json,
    loanOutstanding: T.number,
    depositBalance: T.number,
    nomineeName: T.string(191),
    nomineeRelation: T.string(191),
    photoUrl: T.string(255),
    photoFileId: T.string(40),
    documentsFolderId: T.string(40),
    documents: T.json,
    status: T.string(80),
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code']),

  member_demand_defaults: schema({
    memberCode: T.string(80),
    compulsoryDeposit: T.number,
    ssa: T.number,
    regularLoan: T.number,
    loanAgainstDeposit: T.number,
    insurancePremium: T.number,
    other: T.number,
    payload: T.json
  }, ['memberCode']),

  ledgers: schema({
    code: T.string(80),
    name: T.string(191),
    nature: T.string(80),
    group: T.string(80),
    openingBalance: T.number,
    balanceSide: T.string(10),
    isBankAccount: T.boolean,
    isActive: T.boolean,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code']),

  rates: schema({
    code: T.string(80),
    ledgerCode: T.string(80),
    ledgerName: T.string(191),
    category: T.string(120),
    value: T.number,
    effectiveFrom: T.date,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code']),

  bank_accounts: schema({
    code: T.string(80),
    bankName: T.string(191),
    accountHolderName: T.string(191),
    accountNumber: T.string(120),
    ifsc: T.string(40),
    branch: T.string(120),
    accountType: T.string(80),
    upiId: T.string(191),
    openingBalance: T.number,
    currentBalance: T.number,
    isPrimary: T.boolean,
    linkedLedgerCode: T.string(80),
    status: T.string(80),
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code']),

  bank_transactions: schema({
    transactionNo: T.string(120),
    date: T.date,
    bankAccountCode: T.string(80),
    transactionType: T.string(80),
    amount: T.number,
    branchCode: T.string(40),
    linkedClientCode: T.string(80),
    linkedProjectCode: T.string(80),
    linkedInvoiceNo: T.string(80),
    linkedExpenseCode: T.string(80),
    notes: T.text,
    voucherNo: T.string(120),
    status: T.string(80),
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['transactionNo']),

  demand_lists: schema({
    demandListNo: T.string(120),
    demandListDate: T.date,
    branchCode: T.string(40),
    month: T.string(40),
    year: T.string(40),
    status: T.string(80),
    remarks: T.text,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['demandListNo']),

  demand_lines: schema({
    demandListNo: T.string(120),
    memberCode: T.string(80),
    memberName: T.string(191),
    postedBranch: T.string(120),
    compulsoryDeposit: T.number,
    ssa: T.number,
    regularLoan: T.number,
    loanAgainstDeposit: T.number,
    insurancePremium: T.number,
    other: T.number,
    totalAmount: T.number,
    recoveredAmount: T.number,
    recoveryStatus: T.string(80),
    payload: T.json
  }),

  no_interest_members: schema({
    code: T.string(80),
    memberCode: T.string(80),
    branchCode: T.string(40),
    setOnDate: T.date,
    narration: T.text,
    reason: T.text,
    fromDate: T.date,
    toDate: T.date,
    status: T.string(80),
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code']),

  vouchers: schema({
    voucherNo: T.string(120),
    date: T.date,
    voucherCategory: T.string(191),
    transactionType: T.string(80),
    accent: T.string(40),
    partyCode: T.string(80),
    partyType: T.string(80),
    amount: T.number,
    mode: T.string(80),
    narration: T.text,
    referenceNo: T.string(120),
    instrumentNo: T.string(120),
    instrumentDate: T.date,
    branchCode: T.string(40),
    fyCode: T.string(40),
    approvedBy: T.string(120),
    createdBy: T.string(120),
    details: T.json,
    journalLines: T.json,
    documents: T.json,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['voucherNo']),

  recovery_lines: schema({
    voucherNo: T.string(120),
    memberCode: T.string(80),
    demandLineId: T.string(80),
    share: T.number,
    compulsoryDeposit: T.number,
    ssa: T.number,
    regularLoan: T.number,
    depositLoan: T.number,
    premium: T.number,
    admission: T.number,
    suspense: T.number,
    other: T.number,
    total: T.number,
    payload: T.json
  })
};

function getTableSchema(tableName) {
  const schemaDef = TABLE_SCHEMAS[tableName];
  if (!schemaDef) {
    throw new Error(`Unknown table schema: ${tableName}`);
  }
  return schemaDef;
}

module.exports = {
  TABLE_SCHEMAS,
  T,
  getTableSchema,
  schema
};





const T = {
  boolean: { type: 'boolean' },
  date: { type: 'date' },
  json: { type: 'json' },
  number: { type: 'number' },
  money: { type: 'money' },
  rate: { type: 'rate' },
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
    storageProvider: T.string(80),
    storageKey: T.text,
    storageBucket: T.string(191),
    storageRegion: T.string(120),
    storageProject: T.string(191),
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
    gstNo: T.string(120),
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

  financial_years: schema({
    code: T.string(40),
    isActive: T.boolean
  }, ['code']),

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
    fatherName: T.string(191),
    dateOfBirth: T.date,
    appointmentDate: T.date,
    address: T.text,
    category: T.string(80),
    caste: T.string(80),
    qualification: T.string(191),
    mobileNo: T.string(40),
    basicSalary: T.money,
    designation: T.string(120),
    branchCode: T.string(40),
    retired: T.boolean,
    retirementDate: T.date,
    homeLoanBalance: T.money,
    homeLoanCrDr: T.string(10),
    homeLoanInterest: T.money,
    vehicleLoanBalance: T.money,
    vehicleLoanCrDr: T.string(10),
    vehicleLoanInterest: T.money,
    grainAdvanceBalance: T.money,
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
    openingDate: T.date,
    appointmentDate: T.date,
    membershipNo: T.string(80),
    pfNo: T.string(80),
    dismembered: T.boolean,
    dismemberedDate: T.date,
    suretyName1: T.string(191),
    suretyName2: T.string(191),
    address: T.text,
    mobileNo: T.string(40),
    basicSalary: T.money,
    openingBalance: T.money,
    openingBalanceCrDr: T.string(10),
    balances: T.json,
    loanOutstanding: T.money,
    depositBalance: T.money,
    cdInterest: T.money,
    ssaInterest: T.money,
    regularLoanInterest: T.money,
    ladInterest: T.money,
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
    share: T.money,
    compulsoryDeposit: T.money,
    specialDeposit: T.money,
    regularLoan: T.money,
    loanAgainstDeposit: T.money,
    insurancePremium: T.money,
    other: T.money,
    payload: T.json
  }, ['memberCode']),

  ledgers: schema({
    code: T.string(80),
    name: T.string(191),
    nature: T.string(80),
    group: T.string(80),
    semanticRole: T.string(80),
    openingBalance: T.money,
    balanceSide: T.string(10),
    sortOrder: T.number,
    isBankAccount: T.boolean,
    isActive: T.boolean,
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code', 'semanticRole']),

  rates: schema({
    code: T.string(80),
    ledgerCode: T.string(80),
    ledgerName: T.string(191),
    category: T.string(120),
    value: T.rate,
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
    openingBalance: T.money,
    currentBalance: T.money,
    isPrimary: T.boolean,
    linkedLedgerCode: T.string(80),
    status: T.string(80),
    payload: T.json,
    createdByUserId: T.string(40),
    updatedByUserId: T.string(40)
  }, ['code']),

  journal_lines: schema({
    voucherId: T.string(80),
    ledgerId: T.string(80),
    debitAmount: T.money,
    creditAmount: T.money,
    memberId: T.string(80),
    employeeId: T.string(80),
    branchId: T.string(40),
    accountHead: T.string(120),
    description: T.text,
    postingOrder: T.number
  }),

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
    compulsoryDeposit: T.money,
    specialDeposit: T.money,
    regularLoan: T.money,
    loanAgainstDeposit: T.money,
    insurancePremium: T.money,
    other: T.money,
    totalAmount: T.money,
    recoveredAmount: T.money,
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
    voucherId: T.string(80),
    date: T.date,
    voucherCategory: T.string(191),
    transactionType: T.string(80),
    accent: T.string(40),
    partyCode: T.string(80),
    partyType: T.string(80),
    amount: T.money,
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
    voucherId: T.string(80),
    memberCode: T.string(80),
    demandLineId: T.string(80),
    share: T.money,
    compulsoryDeposit: T.money,
    specialDeposit: T.money,
    regularLoan: T.money,
    depositLoan: T.money,
    premium: T.money,
    admission: T.money,
    suspense: T.money,
    other: T.money,
    total: T.money,
    payload: T.json
  }),

  recovery_import_batches: schema({
    fileName: T.string(255),
    uploadedBy: T.string(80),
    uploadedAt: T.date,
    status: T.string(40),
    totalRows: T.number,
    validRows: T.number,
    shortRows: T.number,
    extraRows: T.number,
    errorRows: T.number,
    totalImportedAmount: T.money,
    totalDemandAmount: T.money,
    totalAllocatedAmount: T.money,
    payload: T.json
  }),

  
  legacy_historical_vouchers: schema({
    sourceDatabase: T.string(120),
    sourceTable: T.string(120),
    sourceKey: T.string(120),
    voucherNo: T.string(120),
    date: T.date,
    voucherCategory: T.string(191),
    transactionType: T.string(80),
    amount: T.money,
    narration: T.text,
    details: T.json,
    payload: T.json
  }, [['sourceDatabase', 'sourceTable', 'sourceKey']]),

  legacy_historical_recovery: schema({
    sourceDatabase: T.string(120),
    sourceTable: T.string(120),
    sourceKey: T.string(120),
    memberCode: T.string(80),
    totalAmount: T.money,
    details: T.json,
    payload: T.json
  }, [['sourceDatabase', 'sourceTable', 'sourceKey']]),

  recovery_import_rows: schema({
    batchId: T.string(80),
    sourceRowNo: T.number,
    pfNo: T.string(80),
    memberId: T.string(80),
    sourceBranch: T.string(120),
    sourceEmployeeName: T.string(191),
    sourceGrade: T.string(80),
    
    importedTotalAmount: T.money,

    configuredShare: T.money,
    configuredSpecialDeposit: T.money,
    configuredCompulsoryDeposit: T.money,
    configuredRegularLoan: T.money,
    configuredLoanAgainstDeposit: T.money,
    configuredDemandTotal: T.money,

    allocatedShare: T.money,
    allocatedSpecialDeposit: T.money,
    allocatedCompulsoryDeposit: T.money,
    allocatedRegularLoan: T.money,
    allocatedLoanAgainstDeposit: T.money,
    allocatedTotal: T.money,

    differenceAmount: T.money,
    status: T.string(80),
    errorMessage: T.text,
    warnings: T.text,

    recoveryVoucherId: T.string(120),
    postedAt: T.date,
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





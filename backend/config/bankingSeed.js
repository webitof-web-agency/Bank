const SOCIETY_SEED = {
  key: 'default',
  code: '0',
  name: 'The Raipur Co-operative Employees Thrift Society Ltd.',
  prefix: 'RCETSL',
  place: 'Raipur',
  regNo: 'CG/RPR/CS/00417',
  email: 'office@raipursociety.coop',
  address: 'Civil Lines, Near Collectorate, Raipur, Chhattisgarh 492001',
  branchCode: '0',
  logoUrl: '',
  watermarkEnabled: false,
  watermarkUrl: '',
  footerText: 'Raipur Co-operative Employees Thrift Society Ltd.'
};

const BRANCH_SEEDS = [
  { code: '0', headOfficeCode: '0', label: 'Main Branch - Raipur', place: 'Raipur', address: 'Civil Lines, Raipur', district: 'Raipur', phone: '0771-2234011' },
  { code: '1', headOfficeCode: '0', label: 'Bhilai Branch', place: 'Bhilai', address: 'Sector 6, Bhilai', district: 'Durg', phone: '0788-2245022' },
  { code: '2', headOfficeCode: '0', label: 'Durg Branch', place: 'Durg', address: 'Station Road, Durg', district: 'Durg', phone: '0788-2311033' },
  { code: '3', headOfficeCode: '0', label: 'Bilaspur Branch', place: 'Bilaspur', address: 'Link Road, Bilaspur', district: 'Bilaspur', phone: '07752-401044' }
];

const MEMBER_SEEDS = [
  {
    code: '0',
    name: 'Anita Verma',
    fatherOrHusbandName: 'Ramesh Verma',
    branchCode: '0',
    category: 'REG',
    caste: 'GEN',
    designation: 'CLERK',
    dateOfBirth: '1985-04-12',
    membershipDate: '2018-04-01',
    appointmentDate: '2018-04-01',
    membershipNo: '1001',
    pfNo: 'PF-1001',
    address: 'Civil Lines, Raipur',
    mobileNo: '9826011001',
    openingBalance: 0,
    openingBalanceCrDr: 'DR',
    balances: { share: 1000, compulsoryDeposit: 42000, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 185000,
    depositBalance: 42000,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: '1',
    name: 'Suresh Patel',
    fatherOrHusbandName: 'Bansi Patel',
    branchCode: '0',
    category: 'REG',
    caste: 'OBC',
    designation: 'CLERK',
    dateOfBirth: '1979-11-03',
    membershipDate: '2016-06-15',
    appointmentDate: '2016-06-15',
    membershipNo: '1002',
    pfNo: 'PF-1002',
    address: 'Civil Lines, Raipur',
    mobileNo: '9826011002',
    openingBalance: 0,
    openingBalanceCrDr: 'DR',
    balances: { share: 1000, compulsoryDeposit: 68500, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 0,
    depositBalance: 68500,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: '2',
    name: 'Kavita Deshmukh',
    fatherOrHusbandName: 'Vinod Deshmukh',
    branchCode: '1',
    category: 'REG',
    caste: 'GEN',
    designation: 'FO',
    dateOfBirth: '1990-01-22',
    membershipDate: '2019-09-10',
    appointmentDate: '2019-09-10',
    membershipNo: '1003',
    pfNo: 'PF-1003',
    address: 'Sector 6, Bhilai',
    mobileNo: '9826011003',
    openingBalance: 0,
    openingBalanceCrDr: 'DR',
    balances: { share: 1000, compulsoryDeposit: 15200, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 95000,
    depositBalance: 15200,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: '3',
    name: 'Rajesh Kumar Sahu',
    fatherOrHusbandName: 'Mohan Sahu',
    branchCode: '0',
    category: 'NOM',
    caste: 'GEN',
    designation: 'CASHIER',
    dateOfBirth: '1982-07-30',
    membershipDate: '2015-03-05',
    appointmentDate: '2015-03-05',
    membershipNo: '1004',
    pfNo: 'PF-1004',
    address: 'Civil Lines, Raipur',
    mobileNo: '9826011004',
    openingBalance: 0,
    openingBalanceCrDr: 'DR',
    balances: { share: 1000, compulsoryDeposit: 8900, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 240000,
    depositBalance: 8900,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  }
];

const MEMBER_DEMAND_DEFAULT_SEEDS = [
  { memberCode: '0', compulsoryDeposit: 1000, ssa: 0, regularLoan: 5000, loanAgainstDeposit: 0, insurancePremium: 500, other: 0 },
  { memberCode: '1', compulsoryDeposit: 1000, ssa: 500, regularLoan: 0, loanAgainstDeposit: 0, insurancePremium: 500, other: 0 },
  { memberCode: '2', compulsoryDeposit: 1000, ssa: 0, regularLoan: 3000, loanAgainstDeposit: 0, insurancePremium: 500, other: 0 },
  { memberCode: '3', compulsoryDeposit: 1000, ssa: 0, regularLoan: 6000, loanAgainstDeposit: 0, insurancePremium: 500, other: 0 }
];

const EMPLOYEE_SEEDS = [
  { code: '0', name: 'Ashok Nair', designation: 'FO', branchCode: '0', mobileNo: '9826055001', isActive: true },
  { code: '1', name: 'Sunita Joshi', designation: 'CASHIER', branchCode: '0', mobileNo: '9826055002', isActive: true },
  { code: '2', name: 'Ramesh Chourasia', designation: 'ACCT', branchCode: '1', mobileNo: '9826055003', isActive: true },
  { code: '3', name: 'Farida Khan', designation: 'General Manager', branchCode: '2', mobileNo: '9826055004', isActive: true },
  { code: '4', name: 'Rakesh Sharma', designation: 'Manager', branchCode: '0', mobileNo: '9826055005', isActive: true },
  { code: '5', name: 'Anita Verma', designation: 'Branch Manager', branchCode: '1', mobileNo: '9826055006', isActive: true }
];

const LEDGER_SEEDS = [
  { code: '0', name: 'Cash-in-hand', nature: 'ASSET', group: 'CASHBANK', openingBalance: 842300, balanceSide: 'DR', isBankAccount: true },
  { code: '1', name: 'Union Bank - CC A/c', nature: 'ASSET', group: 'CASHBANK', openingBalance: 2154000, balanceSide: 'DR', isBankAccount: true },
  { code: '2', name: 'Loan A/c - Regular', nature: 'ASSET', group: 'LOANS', openingBalance: 658000, balanceSide: 'DR' },
  { code: '3', name: 'Loan Against Deposit A/c', nature: 'ASSET', group: 'LOANS', openingBalance: 112000, balanceSide: 'DR' },
  { code: '4', name: 'Compulsory Deposit A/c', nature: 'LIABILITY', group: 'DEPOSITS', openingBalance: 1930500, balanceSide: 'CR' },
  { code: '5', name: 'Special Saving A/c', nature: 'LIABILITY', group: 'DEPOSITS', openingBalance: 412000, balanceSide: 'CR' },
  { code: '6', name: 'Member Share A/c', nature: 'LIABILITY', group: 'GENERAL', openingBalance: 560000, balanceSide: 'CR' },
  { code: '7', name: 'Interest Income', nature: 'INCOME', group: 'GENERAL', openingBalance: 98400, balanceSide: 'CR' },
  { code: '8', name: 'Admission Fee Income', nature: 'INCOME', group: 'GENERAL', openingBalance: 14200, balanceSide: 'CR' },
  { code: '9', name: 'Office Expense', nature: 'EXPENSE', group: 'GENERAL', openingBalance: 36700, balanceSide: 'DR' },
  { code: '10', name: 'Staff Salary Expense', nature: 'EXPENSE', group: 'GENERAL', openingBalance: 210000, balanceSide: 'DR' },
  { code: '11', name: 'Suspense A/c', nature: 'LIABILITY', group: 'SUSPENSE', openingBalance: 4200, balanceSide: 'CR' },
  { code: '12', name: 'SBI - Saving A/c', nature: 'ASSET', group: 'CASHBANK', openingBalance: 318000, balanceSide: 'DR', isBankAccount: true },
  { code: '13', name: 'Employee Advance A/c', nature: 'ASSET', group: 'LOANS', openingBalance: 86000, balanceSide: 'DR' },
  { code: '14', name: 'Insurance Premium A/c', nature: 'LIABILITY', group: 'GENERAL', openingBalance: 74000, balanceSide: 'CR' },
  { code: '15', name: 'Interest Paid Expense', nature: 'EXPENSE', group: 'GENERAL', openingBalance: 45000, balanceSide: 'DR' },
  { code: '16', name: 'Provident Fund A/c', nature: 'LIABILITY', group: 'DEPOSITS', openingBalance: 126000, balanceSide: 'CR' },
  { code: '17', name: 'Bank Loan Liability', nature: 'LIABILITY', group: 'LOANS', openingBalance: 750000, balanceSide: 'CR' },
  { code: '18', name: 'General Reserve / Capital Fund', nature: 'LIABILITY', group: 'GENERAL', openingBalance: 492700, balanceSide: 'CR' }
];

const RATE_SEEDS = [
  { code: '0', ledgerCode: '2', ledgerName: 'Loan A/c - Regular', category: 'Interest Rate', value: 11.5 },
  { code: '1', ledgerCode: '4', ledgerName: 'Compulsory Deposit A/c', category: 'Interest Rate', value: 6.0 },
  { code: '2', ledgerCode: '5', ledgerName: 'Special Saving A/c', category: 'Interest Rate', value: 5.5 },
  { code: '3', ledgerCode: '3', ledgerName: 'Loan Against Deposit A/c', category: 'Interest Rate', value: 9.0 },
  { code: '4', ledgerCode: '16', ledgerName: 'Provident Fund A/c', category: 'Interest Rate', value: 7.0 }
];

const COMMITTEE_SEED = {
  key: 'default',
  chairman: 'Ramesh Chandra Gupta',
  viceChairman: 'Suresh Kumar Verma',
  viceChairman2: 'Kiran Suresh Verma'
};

const COMMITTEE_DIRECTOR_SEEDS = [
  { committeeKey: 'default', name: 'Anita Verma', designation: 'Director', orderIndex: 1 },
  { committeeKey: 'default', name: 'Suresh Patel', designation: 'Director', orderIndex: 2 },
  { committeeKey: 'default', name: 'Kavita Deshmukh', designation: 'Director', orderIndex: 3 }
];

const BANK_ACCOUNT_SEEDS = [
  {
    code: '0',
    bankName: 'Union Bank of India',
    accountHolderName: 'The Raipur Co-operative Employees Thrift Society Ltd.',
    accountNumber: 'CC-000120',
    ifsc: 'UBIN0000120',
    branch: 'Raipur',
    accountType: 'Cash Credit',
    upiId: 'raipur.society@ubank',
    openingBalance: 2154000,
    isPrimary: true,
    linkedLedgerCode: '1',
    currentBalance: 2154000,
    status: 'Active'
  },
  {
    code: '1',
    bankName: 'SBI',
    accountHolderName: 'The Raipur Co-operative Employees Thrift Society Ltd.',
    accountNumber: 'SB-4021',
    ifsc: 'SBIN0004021',
    branch: 'Raipur',
    accountType: 'Saving',
    upiId: 'raipur.society@sbi',
    openingBalance: 318000,
    isPrimary: false,
    linkedLedgerCode: '12',
    currentBalance: 318000,
    status: 'Active'
  },
  {
    code: '2',
    bankName: 'Cash-in-hand',
    accountHolderName: 'Main Cash Counter',
    accountNumber: 'CASH-001',
    ifsc: '',
    branch: 'Raipur',
    accountType: 'Cash',
    upiId: '',
    openingBalance: 842300,
    isPrimary: false,
    linkedLedgerCode: '0',
    currentBalance: 842300,
    status: 'Active'
  }
];

const DEMAND_LIST_SEEDS = [
  { demandListNo: '0', demandListDate: '2026-07-01', branchCode: '0', month: '7', year: '2026', status: 'Pending', remarks: 'July Demands' }
];

const DEMAND_LINE_SEEDS = [
  { demandListNo: '0', memberCode: '0', memberName: 'Anita Verma', postedBranch: '0', compulsoryDeposit: 1000, ssa: 0, regularLoan: 5000, loanAgainstDeposit: 0, insurancePremium: 500, other: 0, totalAmount: 6500, recoveredAmount: 0, recoveryStatus: 'Pending' }
];

const VOUCHER_SEEDS = [
  {
    voucherNo: '0',
    date: '2026-07-02',
    voucherCategory: 'Recovery From Member',
    transactionType: 'receipt',
    accent: 'green',
    partyCode: '0',
    partyType: 'member',
    amount: 5200,
    mode: 'Cash',
    narration: 'Recovery from member',
    details: { key: 'recovery-member', components: { amt: 5200 } },
    journalLines: [
      { ledgerCode: '0', dr: 5200, cr: 0, memo: 'Member recovery received' },
      { ledgerCode: '2', dr: 0, cr: 5200, memo: 'Member loan/deposit recovery' }
    ]
  }
];

const RECOVERY_LINE_SEEDS = [
  { voucherNo: '0', memberCode: '0', demandLineId: '', share: 0, compulsoryDeposit: 1000, ssa: 0, regularLoan: 4200, depositLoan: 0, premium: 0, admission: 0, suspense: 0, other: 0, total: 5200 }
];

const BANK_TRANSACTION_SEEDS = [
  {
    transactionNo: '0',
    date: '2026-07-09',
    bankAccountCode: '0',
    transactionType: 'Credit',
    amount: 16000,
    linkedClientCode: '',
    linkedProjectCode: '',
    linkedInvoiceNo: '',
    linkedExpenseCode: '',
    notes: 'Deposit in bank',
    voucherNo: '',
    status: 'Posted'
  }
];

const NO_INTEREST_MEMBER_SEEDS = [];

module.exports = {
  BANK_ACCOUNT_SEEDS,
  BANK_TRANSACTION_SEEDS,
  BRANCH_SEEDS,
  COMMITTEE_SEED,
  COMMITTEE_DIRECTOR_SEEDS,
  DEMAND_LIST_SEEDS,
  DEMAND_LINE_SEEDS,
  EMPLOYEE_SEEDS,
  LEDGER_SEEDS,
  MEMBER_SEEDS,
  MEMBER_DEMAND_DEFAULT_SEEDS,
  NO_INTEREST_MEMBER_SEEDS,
  RATE_SEEDS,
  RECOVERY_LINE_SEEDS,
  SOCIETY_SEED,
  VOUCHER_SEEDS
};

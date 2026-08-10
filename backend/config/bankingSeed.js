const SOCIETY_SEED = {
  key: 'default',
  name: 'The Raipur Co-operative Employees Thrift Society Ltd.',
  prefix: 'RCETSL',
  regNo: 'CG/RPR/CS/00417',
  email: 'office@raipursociety.coop',
  address: 'Civil Lines, Near Collectorate, Raipur, Chhattisgarh 492001',
  branchCode: 'BR01',
  logoUrl: '',
  watermarkUrl: '',
  footerText: 'Raipur Co-operative Employees Thrift Society Ltd.'
};

const BRANCH_SEEDS = [
  { code: 'BR01', label: 'Main Branch - Raipur', place: 'Raipur', address: 'Civil Lines, Raipur', district: 'Raipur', phone: '0771-2234011' },
  { code: 'BR02', label: 'Bhilai Branch', place: 'Bhilai', address: 'Sector 6, Bhilai', district: 'Durg', phone: '0788-2245022' },
  { code: 'BR03', label: 'Durg Branch', place: 'Durg', address: 'Station Road, Durg', district: 'Durg', phone: '0788-2311033' },
  { code: 'BR04', label: 'Bilaspur Branch', place: 'Bilaspur', address: 'Link Road, Bilaspur', district: 'Bilaspur', phone: '07752-401044' }
];

const MEMBER_SEEDS = [
  {
    code: 'M0001',
    name: 'Anita Verma',
    fatherOrHusbandName: 'Ramesh Verma',
    branchCode: 'BR01',
    category: 'REG',
    caste: 'GEN',
    designation: 'CLERK',
    dateOfBirth: '1985-04-12',
    membershipDate: '2018-04-01',
    appointmentDate: '2018-04-01',
    membershipNo: 'MB-1001',
    address: 'Civil Lines, Raipur',
    mobileNo: '9826011001',
    openingBalance: 0,
    balances: { share: 1000, compulsoryDeposit: 42000, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 185000,
    depositBalance: 42000,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: 'M0002',
    name: 'Suresh Patel',
    fatherOrHusbandName: 'Bansi Patel',
    branchCode: 'BR01',
    category: 'REG',
    caste: 'OBC',
    designation: 'CLERK',
    dateOfBirth: '1979-11-03',
    membershipDate: '2016-06-15',
    appointmentDate: '2016-06-15',
    membershipNo: 'MB-1002',
    address: 'Civil Lines, Raipur',
    mobileNo: '9826011002',
    openingBalance: 0,
    balances: { share: 1000, compulsoryDeposit: 68500, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 0,
    depositBalance: 68500,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: 'M0003',
    name: 'Kavita Deshmukh',
    fatherOrHusbandName: 'Vinod Deshmukh',
    branchCode: 'BR02',
    category: 'REG',
    caste: 'GEN',
    designation: 'FO',
    dateOfBirth: '1990-01-22',
    membershipDate: '2019-09-10',
    appointmentDate: '2019-09-10',
    membershipNo: 'MB-1003',
    address: 'Sector 6, Bhilai',
    mobileNo: '9826011003',
    openingBalance: 0,
    balances: { share: 1000, compulsoryDeposit: 15200, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 95000,
    depositBalance: 15200,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: 'M0004',
    name: 'Rajesh Kumar Sahu',
    fatherOrHusbandName: 'Mohan Sahu',
    branchCode: 'BR01',
    category: 'NOM',
    caste: 'GEN',
    designation: 'CASHIER',
    dateOfBirth: '1982-07-30',
    membershipDate: '2015-03-05',
    appointmentDate: '2015-03-05',
    membershipNo: 'MB-1004',
    address: 'Civil Lines, Raipur',
    mobileNo: '9826011004',
    openingBalance: 0,
    balances: { share: 1000, compulsoryDeposit: 8900, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 240000,
    depositBalance: 8900,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: 'M0005',
    name: 'Manoj Tiwari',
    fatherOrHusbandName: 'Suresh Tiwari',
    branchCode: 'BR03',
    category: 'REG',
    caste: 'OBC',
    designation: 'ACCT',
    dateOfBirth: '1975-05-18',
    membershipDate: '2012-01-20',
    appointmentDate: '2012-01-20',
    membershipNo: 'MB-1005',
    address: 'Station Road, Durg',
    mobileNo: '9826011005',
    openingBalance: 0,
    balances: { share: 1000, compulsoryDeposit: 0, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 0,
    depositBalance: 0,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Exited'
  },
  {
    code: 'M0006',
    name: 'Priya Chandrakar',
    fatherOrHusbandName: 'Ashok Chandrakar',
    branchCode: 'BR02',
    category: 'REG',
    caste: 'GEN',
    designation: 'TEACHER',
    dateOfBirth: '1993-09-09',
    membershipDate: '2020-08-12',
    appointmentDate: '2020-08-12',
    membershipNo: 'MB-1006',
    address: 'Sector 6, Bhilai',
    mobileNo: '9826011006',
    openingBalance: 0,
    balances: { share: 1000, compulsoryDeposit: 31000, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 58000,
    depositBalance: 31000,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: 'M0007',
    name: 'Deepak Sinha',
    fatherOrHusbandName: 'Rakesh Sinha',
    branchCode: 'BR01',
    category: 'ASSOC',
    caste: 'GEN',
    designation: 'CLERK',
    dateOfBirth: '1988-02-25',
    membershipDate: '2021-02-01',
    appointmentDate: '2021-02-01',
    membershipNo: 'MB-1007',
    address: 'Civil Lines, Raipur',
    mobileNo: '9826011007',
    openingBalance: 0,
    balances: { share: 1000, compulsoryDeposit: 5400, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 0,
    depositBalance: 5400,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  },
  {
    code: 'M0008',
    name: 'Meena Yadav',
    fatherOrHusbandName: 'Ram Yadav',
    branchCode: 'BR04',
    category: 'REG',
    caste: 'OBC',
    designation: 'PEON',
    dateOfBirth: '1991-12-14',
    membershipDate: '2019-11-19',
    appointmentDate: '2019-11-19',
    membershipNo: 'MB-1008',
    address: 'Link Road, Bilaspur',
    mobileNo: '9826011008',
    openingBalance: 0,
    balances: { share: 1000, compulsoryDeposit: 22750, specialSaving: 0, providentFund: 0, loanAgainstDeposit: 0, insurancePremium: 0 },
    loanOutstanding: 132000,
    depositBalance: 22750,
    nomineeName: '',
    nomineeRelation: '',
    status: 'Active'
  }
];

const EMPLOYEE_SEEDS = [
  { code: 'E0001', name: 'Ashok Nair', designation: 'FO', branchCode: 'BR01', mobileNo: '9826055001', status: 'Active' },
  { code: 'E0002', name: 'Sunita Joshi', designation: 'CASHIER', branchCode: 'BR01', mobileNo: '9826055002', status: 'Active' },
  { code: 'E0003', name: 'Ramesh Chourasia', designation: 'ACCT', branchCode: 'BR02', mobileNo: '9826055003', status: 'Active' },
  { code: 'E0004', name: 'Farida Khan', designation: 'MGR', branchCode: 'BR03', mobileNo: '9826055004', status: 'Active' }
];

const MANAGER_SEEDS = [
  { name: 'Farida Khan', designation: 'General Manager', branchCode: 'BR03', isActive: true },
  { name: 'Rakesh Sharma', designation: 'Manager', branchCode: 'BR01', isActive: true },
  { name: 'Anita Verma', designation: 'Branch Manager', branchCode: 'BR02', isActive: true }
];

const LEDGER_SEEDS = [
  { code: 'L001', name: 'Cash-in-hand', nature: 'ASSET', group: 'CASHBANK', openingBalance: 842300, balanceSide: 'DR', isBankAccount: true },
  { code: 'L002', name: 'Union Bank - CC A/c', nature: 'ASSET', group: 'CASHBANK', openingBalance: 2154000, balanceSide: 'DR', isBankAccount: true },
  { code: 'L003', name: 'Loan A/c - Regular', nature: 'ASSET', group: 'LOANS', openingBalance: 658000, balanceSide: 'DR' },
  { code: 'L004', name: 'Loan Against Deposit A/c', nature: 'ASSET', group: 'LOANS', openingBalance: 112000, balanceSide: 'DR' },
  { code: 'L005', name: 'Compulsory Deposit A/c', nature: 'LIABILITY', group: 'DEPOSITS', openingBalance: 1930500, balanceSide: 'CR' },
  { code: 'L006', name: 'Special Saving A/c', nature: 'LIABILITY', group: 'DEPOSITS', openingBalance: 412000, balanceSide: 'CR' },
  { code: 'L007', name: 'Member Share A/c', nature: 'LIABILITY', group: 'GENERAL', openingBalance: 560000, balanceSide: 'CR' },
  { code: 'L008', name: 'Interest Income', nature: 'INCOME', group: 'GENERAL', openingBalance: 98400, balanceSide: 'CR' },
  { code: 'L009', name: 'Admission Fee Income', nature: 'INCOME', group: 'GENERAL', openingBalance: 14200, balanceSide: 'CR' },
  { code: 'L010', name: 'Office Expense', nature: 'EXPENSE', group: 'GENERAL', openingBalance: 36700, balanceSide: 'DR' },
  { code: 'L011', name: 'Staff Salary Expense', nature: 'EXPENSE', group: 'GENERAL', openingBalance: 210000, balanceSide: 'DR' },
  { code: 'L012', name: 'Suspense A/c', nature: 'LIABILITY', group: 'SUSPENSE', openingBalance: 4200, balanceSide: 'CR' },
  { code: 'L013', name: 'SBI - Saving A/c', nature: 'ASSET', group: 'CASHBANK', openingBalance: 318000, balanceSide: 'DR', isBankAccount: true },
  { code: 'L014', name: 'Employee Advance A/c', nature: 'ASSET', group: 'LOANS', openingBalance: 86000, balanceSide: 'DR' },
  { code: 'L015', name: 'Insurance Premium A/c', nature: 'LIABILITY', group: 'GENERAL', openingBalance: 74000, balanceSide: 'CR' },
  { code: 'L016', name: 'Interest Paid Expense', nature: 'EXPENSE', group: 'GENERAL', openingBalance: 45000, balanceSide: 'DR' },
  { code: 'L017', name: 'Provident Fund A/c', nature: 'LIABILITY', group: 'DEPOSITS', openingBalance: 126000, balanceSide: 'CR' },
  { code: 'L018', name: 'Bank Loan Liability', nature: 'LIABILITY', group: 'LOANS', openingBalance: 750000, balanceSide: 'CR' },
  { code: 'L019', name: 'General Reserve / Capital Fund', nature: 'LIABILITY', group: 'GENERAL', openingBalance: 492700, balanceSide: 'CR' }
];

const RATE_SEEDS = [
  { code: 'R01', ledgerCode: 'L003', ledgerName: 'Loan A/c - Regular', category: 'Interest Rate', value: 11.5 },
  { code: 'R02', ledgerCode: 'L005', ledgerName: 'Compulsory Deposit A/c', category: 'Interest Rate', value: 6.0 },
  { code: 'R03', ledgerCode: 'L006', ledgerName: 'Special Saving A/c', category: 'Interest Rate', value: 5.5 },
  { code: 'R04', ledgerCode: 'L004', ledgerName: 'Loan Against Deposit A/c', category: 'Interest Rate', value: 9.0 },
  { code: 'R05', ledgerCode: 'L017', ledgerName: 'Provident Fund A/c', category: 'Interest Rate', value: 7.0 }
];

const COMMITTEE_SEED = {
  key: 'default',
  chairman: 'Ramesh Chandra Gupta',
  viceChairman: 'Suresh Kumar Verma',
  viceChairman2: 'Kiran Suresh Verma',
  directors: ['Anita Verma', 'Suresh Patel', 'Kavita Deshmukh', 'Deepak Sinha', 'Meena Yadav']
};

const BANK_ACCOUNT_SEEDS = [
  {
    code: 'BA001',
    bankName: 'Union Bank of India',
    accountHolderName: 'The Raipur Co-operative Employees Thrift Society Ltd.',
    accountNumber: 'CC-000120',
    ifsc: 'UBIN0000120',
    branch: 'Raipur',
    accountType: 'Cash Credit',
    upiId: 'raipur.society@ubank',
    openingBalance: 2154000,
    isPrimary: true,
    linkedLedgerCode: 'L002',
    currentBalance: 2154000,
    status: 'Active'
  },
  {
    code: 'BA002',
    bankName: 'SBI',
    accountHolderName: 'The Raipur Co-operative Employees Thrift Society Ltd.',
    accountNumber: 'SB-4021',
    ifsc: 'SBIN0004021',
    branch: 'Raipur',
    accountType: 'Saving',
    upiId: 'raipur.society@sbi',
    openingBalance: 318000,
    isPrimary: false,
    linkedLedgerCode: 'L013',
    currentBalance: 318000,
    status: 'Active'
  },
  {
    code: 'BA003',
    bankName: 'Cash-in-hand',
    accountHolderName: 'Main Cash Counter',
    accountNumber: 'CASH-001',
    ifsc: '',
    branch: 'Raipur',
    accountType: 'Cash',
    upiId: '',
    openingBalance: 842300,
    isPrimary: false,
    linkedLedgerCode: 'L001',
    currentBalance: 842300,
    status: 'Active'
  }
];

const DEMAND_SEEDS = [
  { demandNo: 'DM01', month: 'M2', branchCode: 'BR01', memberCode: 'M0001', total: 5200, recovered: 5200, status: 'Fully Recovered' },
  { demandNo: 'DM02', month: 'M2', branchCode: 'BR02', memberCode: 'M0003', total: 3100, recovered: 1600, status: 'Partially Recovered' },
  { demandNo: 'DM03', month: 'M2', branchCode: 'BR01', memberCode: 'M0004', total: 6800, recovered: 0, status: 'Pending' },
  { demandNo: 'DM04', month: 'M2', branchCode: 'BR02', memberCode: 'M0006', total: 2400, recovered: 2400, status: 'Fully Recovered' },
  { demandNo: 'DM05', month: 'M2', branchCode: 'BR04', memberCode: 'M0008', total: 4300, recovered: 0, status: 'Pending' }
];

const VOUCHER_SEEDS = [
  {
    voucherNo: 'V-24001',
    date: '2026-07-02',
    voucherCategory: 'Recovery From Member',
    transactionType: 'receipt',
    accent: 'green',
    partyCode: 'M0001',
    partyType: 'member',
    amount: 5200,
    mode: 'Cash',
    status: 'Posted',
    narration: 'Recovery from member',
    details: { key: 'recovery-member', components: { amt: 5200 } },
    journalLines: [
      { ledgerCode: 'L001', dr: 5200, cr: 0, memo: 'Member recovery received' },
      { ledgerCode: 'L003', dr: 0, cr: 5200, memo: 'Member loan/deposit recovery' }
    ]
  },
  {
    voucherNo: 'V-24002',
    date: '2026-07-05',
    voucherCategory: 'Loan Paid to Member',
    transactionType: 'payment',
    accent: 'pink',
    partyCode: 'M0004',
    partyType: 'member',
    amount: 12000,
    mode: 'Cheque',
    status: 'Posted',
    narration: 'Loan paid to member',
    details: { key: 'loan-paid-member', components: { loanAmt: 12000, lad: 0 } },
    journalLines: [
      { ledgerCode: 'L003', dr: 12000, cr: 0, memo: 'Regular loan disbursed' },
      { ledgerCode: 'L002', dr: 0, cr: 12000, memo: 'Settlement' }
    ]
  },
  {
    voucherNo: 'V-24003',
    date: '2026-07-09',
    voucherCategory: 'Deposit in Bank',
    transactionType: 'receipt',
    accent: 'green',
    partyCode: 'L002',
    partyType: 'ledger',
    amount: 16000,
    mode: 'Cash',
    status: 'Pending Approval',
    narration: 'Deposit in bank',
    details: { key: 'deposit-in-bank', depositIn: 'L002', depositBy: 'CASH' },
    journalLines: [
      { ledgerCode: 'L002', dr: 16000, cr: 0, memo: 'Deposit in bank' },
      { ledgerCode: 'L001', dr: 0, cr: 16000, memo: 'Deposit source' }
    ]
  },
  {
    voucherNo: 'V-24004',
    date: '2026-07-14',
    voucherCategory: 'Recovery From Member',
    transactionType: 'receipt',
    accent: 'green',
    partyCode: 'M0006',
    partyType: 'member',
    amount: 2400,
    mode: 'Cash',
    status: 'Posted',
    narration: 'Recovery from member',
    details: { key: 'recovery-member', components: { amt: 2400 } },
    journalLines: [
      { ledgerCode: 'L001', dr: 2400, cr: 0, memo: 'Member recovery received' },
      { ledgerCode: 'L003', dr: 0, cr: 2400, memo: 'Member loan/deposit recovery' }
    ]
  },
  {
    voucherNo: 'V-24005',
    date: '2026-07-15',
    voucherCategory: 'Advance Paid by Cash/Cheque',
    transactionType: 'payment',
    accent: 'pink',
    partyCode: 'E0001',
    partyType: 'employee',
    amount: 8000,
    mode: 'Cash',
    status: 'Posted',
    narration: 'Advance paid to employee',
    details: { key: 'advance-paid-emp', components: { house: 8000, vehicle: 0, grain: 0 } },
    journalLines: [
      { ledgerCode: 'L014', dr: 8000, cr: 0, memo: 'Employee advance' },
      { ledgerCode: 'L001', dr: 0, cr: 8000, memo: 'Settlement' }
    ]
  }
];

const BANK_TRANSACTION_SEEDS = [
  {
    transactionNo: 'BT-24001',
    date: '2026-07-09',
    bankAccountCode: 'BA001',
    transactionType: 'Credit',
    amount: 16000,
    linkedClientCode: '',
    linkedProjectCode: '',
    linkedInvoiceNo: '',
    linkedExpenseCode: '',
    notes: 'Deposit in bank',
    voucherNo: 'V-24003',
    status: 'Posted'
  }
];

const NO_INTEREST_MEMBER_SEEDS = [];

module.exports = {
  BANK_ACCOUNT_SEEDS,
  BANK_TRANSACTION_SEEDS,
  BRANCH_SEEDS,
  COMMITTEE_SEED,
  DEMAND_SEEDS,
  EMPLOYEE_SEEDS,
  MANAGER_SEEDS,
  LEDGER_SEEDS,
  MEMBER_SEEDS,
  NO_INTEREST_MEMBER_SEEDS,
  RATE_SEEDS,
  SOCIETY_SEED,
  VOUCHER_SEEDS
};


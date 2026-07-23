import { DEFAULT_SETTINGS } from './data/defaultSettings.js';
import { DEFAULT_SERVICES } from './data/services.js';
import { DEFAULT_EXPENSE_CATEGORIES } from './data/expenseCategories.js';
import { DEFAULT_TAX_RATES } from './data/taxRates.js';
import { addDays, clone, today, uid } from './utils/helpers.js';
import { calculateExclusiveTax, calculateInclusiveTax, splitCgstSgst } from './utils/gst.js';

export function createEmptyState() {
  return {
    settings: clone(DEFAULT_SETTINGS),
    clients: [],
    projects: [],
    files: [],
    invoices: [],
    payments: [],
    expenses: [],
    outsourcingExpenses: [],
    leadCommissions: [],
    bankAccounts: [],
    bankTransactions: [],
    amcs: [],
    renewals: [],
    masters: {
      services: clone(DEFAULT_SERVICES),
      expenseCategories: clone(DEFAULT_EXPENSE_CATEGORIES),
      vendors: [
        { id: 'vendor-godaddy', name: 'GoDaddy', vendorType: 'Agency', gstRegistered: true, gstin: '', pan: '', address: '', state: 'Maharashtra', mobile: '', email: '', bankDetails: '', upiId: '', tdsApplicable: false, defaultTdsSection: 'Not Applicable', notes: '', isActive: true },
        { id: 'vendor-hostinger', name: 'Hostinger', vendorType: 'Agency', gstRegistered: true, gstin: '', pan: '', address: '', state: 'Karnataka', mobile: '', email: '', bankDetails: '', upiId: '', tdsApplicable: false, defaultTdsSection: 'Not Applicable', notes: '', isActive: true },
        { id: 'vendor-referral-sample', name: 'Rahul Referral Partner', vendorType: 'Referral Partner', gstRegistered: true, gstin: '22BBBBB1111B1Z5', pan: 'BBBBB1111B', address: 'Raipur', state: 'Chhattisgarh', mobile: '+91 90000 00002', email: 'rahul@example.com', bankDetails: 'HDFC Current A/C', upiId: 'rahul@upi', tdsApplicable: true, defaultTdsSection: '194H', notes: 'Sample GST registered lead partner.', isActive: true },
        { id: 'vendor-designer-sample', name: 'Freelance Graphic Designer', vendorType: 'Freelancer', gstRegistered: false, gstin: '', pan: 'CCCCC2222C', address: 'Bhilai', state: 'Chhattisgarh', mobile: '+91 90000 00003', email: 'designer@example.com', bankDetails: 'SBI Savings A/C', upiId: 'designer@upi', tdsApplicable: false, defaultTdsSection: 'Not Applicable', notes: 'Sample unregistered outsource vendor.', isActive: true }
      ],
      renewalProviders: [
        { id: 'provider-godaddy', name: 'GoDaddy', type: 'Domain', isActive: true },
        { id: 'provider-hostinger', name: 'Hostinger', type: 'Hosting', isActive: true },
        { id: 'provider-namecheap', name: 'Namecheap', type: 'Domain', isActive: true },
        { id: 'provider-microsoft', name: 'Microsoft', type: 'Software License', isActive: true }
      ],
      amcTypes: [
        { id: 'amc-website', name: 'Website Maintenance', isActive: true },
        { id: 'amc-server', name: 'Server Maintenance', isActive: true },
        { id: 'amc-seo', name: 'SEO Maintenance', isActive: true }
      ],
      billingCycles: [
        { id: 'cycle-monthly', name: 'Monthly', months: 1, isActive: true },
        { id: 'cycle-quarterly', name: 'Quarterly', months: 3, isActive: true },
        { id: 'cycle-half-yearly', name: 'Half Yearly', months: 6, isActive: true },
        { id: 'cycle-yearly', name: 'Yearly', months: 12, isActive: true }
      ],
      taxRates: clone(DEFAULT_TAX_RATES),
      invoiceTerms: [
        { id: 'term-standard', title: 'Standard Terms', text: DEFAULT_SETTINGS.invoice.terms, isDefault: true }
      ]
    }
  };
}

export function createSeedState() {
  const state = createEmptyState();
  const clientId = 'client-sample';
  const projectId = 'project-sample';
  const invoiceId = 'invoice-sample';
  const bankId = 'bank-primary';
  const expenseId = 'expense-sample';
  const invoiceBase = calculateExclusiveTax(35000, 18);
  const split = splitCgstSgst(invoiceBase.gstAmount);

  state.clients.push({
    id: clientId,
    name: 'Ankit Sharma',
    companyName: 'Sharma Retail Pvt Ltd',
    mobile: '+91 98765 43210',
    email: 'ankit@example.com',
    billingAddress: 'Civil Lines, Raipur',
    shippingAddress: 'Civil Lines, Raipur',
    state: 'Chhattisgarh',
    stateCode: '22',
    country: 'India',
    placeOfSupply: 'Chhattisgarh',
    clientType: 'Company',
    gstRegistrationType: 'Registered',
    gstin: '22AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    currency: 'INR',
    contactPerson: 'Ankit Sharma',
    openingBalance: 0,
    notes: 'Sample GST registered client.',
    status: 'Active',
    createdAt: today()
  });

  state.projects.push({
    id: projectId,
    title: 'E-commerce Website',
    clientId,
    projectType: 'Website Development',
    value: 35000,
    startDate: today(),
    deadline: addDays(today(), 45),
    status: 'Active',
    billingType: 'Fixed',
    costEstimate: 12000,
    notes: 'Sample project for demo.'
  });

  state.invoices.push({
    id: invoiceId,
    invoiceNumber: 'WEB/2026-27/001',
    invoiceDate: today(),
    dueDate: addDays(today(), 15),
    clientId,
    projectId,
    placeOfSupply: 'Chhattisgarh',
    invoiceType: 'Regular',
    amountType: 'GST Extra',
    status: 'Partially Paid',
    notes: '',
    items: [
      {
        id: 'item-sample',
        serviceId: 'svc-web-dev',
        serviceName: 'Website Development',
        hsnSac: '998314',
        description: 'Business website design and development',
        qty: 1,
        rate: 35000,
        discount: 0,
        taxableAmount: invoiceBase.taxableAmount,
        gstRate: 18,
        cgst: split.cgst,
        sgst: split.sgst,
        igst: 0,
        total: invoiceBase.totalAmount,
        isPureAgent: false
      }
    ]
  });

  state.payments.push({
    id: 'payment-sample',
    paymentDate: today(),
    clientId,
    projectId,
    invoiceId,
    amountReceived: 20000,
    tdsDeducted: 0,
    paymentMode: 'Bank Transfer',
    bankAccountId: bankId,
    transactionId: 'UTR-SAMPLE-001',
    notes: 'Sample partial payment.'
  });

  state.expenses.push({
    id: expenseId,
    expenseDate: today(),
    vendor: 'Hostinger',
    categoryId: 'exp-hosting',
    clientId,
    projectId,
    amountBeforeGst: 5000,
    gstRate: 18,
    gstAmount: 900,
    totalAmount: 5900,
    invoiceNumber: 'HS-001',
    vendorGstin: '',
    paymentMode: 'Card',
    bankAccountId: bankId,
    itcEligible: true,
    rcmApplicable: false,
    attachmentUrl: '',
    notes: 'Sample hosting expense.'
  });

  state.outsourcingExpenses.push({
    id: 'outsource-sample',
    expenseDate: today(),
    clientId,
    projectId,
    vendorId: 'vendor-designer-sample',
    vendorName: 'Freelance Graphic Designer',
    workType: 'Graphic Design',
    description: 'Homepage banner and product graphics',
    baseAmount: 7000,
    gstApplicable: false,
    gstRate: 0,
    gstAmount: 0,
    totalAmount: 7000,
    itcEligible: false,
    paymentStatus: 'Pending',
    vendorInvoiceUrl: '',
    paymentProofUrl: '',
    notes: 'Sample outsourcing cost for profitability calculation.'
  });

  state.leadCommissions.push({
    id: 'commission-sample',
    partnerId: 'vendor-referral-sample',
    partnerName: 'Rahul Referral Partner',
    clientId,
    projectId,
    commissionType: 'Percentage',
    commissionPercentage: 30,
    commissionBaseAmount: 35000,
    commissionAmount: 10500,
    gstRegistered: true,
    gstRate: 18,
    gstAmount: 1890,
    grossPayable: 12390,
    tdsApplicable: true,
    tdsSection: '194H',
    tdsRate: 2,
    tdsAmount: 210,
    netPayable: 12180,
    paymentStatus: 'Pending',
    invoiceUrl: '',
    notes: 'Sample lead commission. TDS is on commission base, not GST.'
  });

  state.bankAccounts.push({
    id: bankId,
    bankName: 'HDFC Bank',
    accountHolderName: 'Webitof IT Services',
    accountNumber: '000000000000',
    ifsc: 'HDFC0000000',
    branch: 'Raipur',
    accountType: 'Current',
    upiId: 'webitof@upi',
    openingBalance: 10000,
    isPrimary: true
  });

  state.bankTransactions.push({
    id: 'txn-sample-credit',
    date: today(),
    bankAccountId: bankId,
    transactionType: 'Credit',
    amount: 20000,
    linkedClientId: clientId,
    linkedProjectId: projectId,
    linkedInvoiceId: invoiceId,
    linkedExpenseId: '',
    notes: 'Payment received from sample client.'
  });

  state.amcs.push({
    id: 'amc-sample',
    clientId,
    projectId,
    amcType: 'Website Maintenance',
    startDate: today(),
    endDate: addDays(today(), 28),
    billingCycle: 'Monthly',
    amcAmount: 5000,
    gstType: 'CGST + SGST',
    nextInvoiceDate: addDays(today(), 30),
    autoInvoice: true,
    reminderDays: 7,
    status: 'Active'
  });

  state.renewals.push({
    id: 'renewal-sample',
    clientId,
    projectId,
    category: 'Domain',
    domainName: 'sharmaretail.in',
    renewalType: 'Domain',
    provider: 'GoDaddy',
    purchaseDate: today(),
    durationYears: 1,
    purchasePrice: 1200,
    renewalPrice: 1800,
    expiryDate: addDays(today(), 25),
    renewalDate: addDays(today(), 25),
    renewalCost: 1200,
    clientCharge: 1800,
    reminderDate: addDays(today(), 18),
    status: 'Pending',
    remarks: 'Sample domain renewal.'
  });

  state.renewals.push({
    id: 'renewal-hosting-sample',
    clientId,
    projectId,
    category: 'Hosting',
    hostingName: 'Business Hosting',
    packageName: 'Cloud Starter',
    renewalType: 'Business Hosting',
    provider: 'Hostinger',
    purchaseDate: today(),
    durationYears: 1,
    purchasePrice: 5000,
    renewalPrice: 6500,
    expiryDate: addDays(today(), 40),
    renewalDate: addDays(today(), 40),
    renewalCost: 6500,
    clientCharge: 8000,
    reminderDate: addDays(today(), 30),
    status: 'Pending',
    remarks: 'Sample hosting renewal.'
  });

  state.renewals.push({
    id: 'renewal-software-sample',
    clientId,
    projectId,
    category: 'Software License',
    softwareName: 'Microsoft 365 Business',
    renewalType: 'Microsoft 365 Business',
    licenseScope: 'Client',
    seats: 5,
    provider: 'Microsoft',
    purchaseDate: today(),
    durationYears: 1,
    purchasePrice: 7200,
    renewalPrice: 7200,
    expiryDate: addDays(today(), 20),
    renewalDate: addDays(today(), 20),
    renewalCost: 7200,
    clientCharge: 9000,
    reminderDate: addDays(today(), 12),
    autoRenewal: false,
    financeAction: 'None',
    status: 'Pending',
    remarks: 'Sample client software license.'
  });

  state.settings.invoice.nextSequence = 2;
  return state;
}

export function mergeSeedData(currentState) {
  const seed = createSeedState();
  return {
    ...currentState,
    clients: mergeById(currentState.clients, seed.clients),
    projects: mergeById(currentState.projects, seed.projects),
    files: mergeById(currentState.files || [], seed.files || []),
    invoices: mergeById(currentState.invoices, seed.invoices),
    payments: mergeById(currentState.payments, seed.payments),
    expenses: mergeById(currentState.expenses, seed.expenses),
    outsourcingExpenses: mergeById(currentState.outsourcingExpenses || [], seed.outsourcingExpenses),
    leadCommissions: mergeById(currentState.leadCommissions || [], seed.leadCommissions),
    bankAccounts: mergeById(currentState.bankAccounts, seed.bankAccounts),
    bankTransactions: mergeById(currentState.bankTransactions, seed.bankTransactions),
    amcs: mergeById(currentState.amcs, seed.amcs),
    renewals: mergeById(currentState.renewals, seed.renewals)
  };
}

export function ensureStateShape(currentState) {
  const empty = createEmptyState();
  const state = clone(currentState || empty);
  const arrayKeys = [
    'clients',
    'projects',
    'files',
    'invoices',
    'payments',
    'expenses',
    'outsourcingExpenses',
    'leadCommissions',
    'bankAccounts',
    'bankTransactions',
    'amcs',
    'renewals'
  ];
  arrayKeys.forEach((key) => {
    if (!Array.isArray(state[key])) state[key] = [];
  });
  state.settings = {
    ...empty.settings,
    ...(state.settings || {}),
    company: { ...empty.settings.company, ...(state.settings?.company || {}) },
    gst: { ...empty.settings.gst, ...(state.settings?.gst || {}) },
    tds: { ...empty.settings.tds, ...(state.settings?.tds || {}) },
    invoice: { ...empty.settings.invoice, ...(state.settings?.invoice || {}) },
    bank: { ...empty.settings.bank, ...(state.settings?.bank || {}) },
    branding: { ...empty.settings.branding, ...(state.settings?.branding || {}) },
    smtp: { ...empty.settings.smtp, ...(state.settings?.smtp || {}) },
    emailTemplates: { ...empty.settings.emailTemplates, ...(state.settings?.emailTemplates || {}) },
    roles: { ...empty.settings.roles, ...(state.settings?.roles || {}) }
  };
  state.masters = { ...empty.masters, ...(state.masters || {}) };
  Object.entries(empty.masters).forEach(([key, value]) => {
    if (Array.isArray(value) && !Array.isArray(state.masters[key])) state.masters[key] = clone(value);
  });
  state.masters.vendors = (state.masters.vendors || []).map((vendor) => ({
    vendorType: 'Other',
    gstRegistered: Boolean(vendor.gstin),
    pan: '',
    address: '',
    mobile: '',
    email: '',
    bankDetails: '',
    upiId: '',
    tdsApplicable: false,
    defaultTdsSection: 'Not Applicable',
    notes: '',
    isActive: true,
    ...vendor
  }));
  return state;
}

export function create50KProjectDemo(currentState) {
  const state = clone(currentState);
  const clientId = uid('client-demo');
  const projectId = uid('project-demo');
  const invoiceId = uid('invoice-demo');
  const expenseId = uid('expense-demo');
  const totalInvoice = 50000;
  const inclusive = calculateInclusiveTax(totalInvoice, 18);
  const split = splitCgstSgst(inclusive.gstAmount);
  const expenseBase = 6000;
  const expenseGst = 1080;
  const bankId = state.bankAccounts[0]?.id || uid('bank');

  if (!state.bankAccounts.length) {
    state.bankAccounts.push({
      id: bankId,
      bankName: 'Demo Bank',
      accountHolderName: 'Webitof IT Services',
      accountNumber: '000000000001',
      ifsc: 'DEMO0000001',
      branch: 'Raipur',
      accountType: 'Current',
      upiId: 'demo@upi',
      openingBalance: 0,
      isPrimary: true
    });
  }

  state.clients.push({
    id: clientId,
    name: 'Demo Client',
    companyName: 'Demo Client',
    mobile: '+91 90000 00001',
    email: 'demo.client@example.com',
    billingAddress: 'Raipur, Chhattisgarh',
    shippingAddress: 'Raipur, Chhattisgarh',
    state: 'Chhattisgarh',
    stateCode: '22',
    country: 'India',
    placeOfSupply: 'Chhattisgarh',
    clientType: 'Company',
    gstRegistrationType: 'Unregistered',
    gstin: '',
    pan: '',
    currency: 'INR',
    contactPerson: 'Demo Client',
    openingBalance: 0,
    notes: 'Created by 50K Project Demo.',
    status: 'Active',
    createdAt: today()
  });

  state.projects.push({
    id: projectId,
    title: 'Website + Domain Hosting Package',
    clientId,
    projectType: 'Website + Hosting',
    value: 50000,
    startDate: today(),
    deadline: addDays(today(), 30),
    status: 'Active',
    billingType: 'Fixed',
    costEstimate: expenseBase,
    notes: '50K GST inclusive demo project.'
  });

  state.invoices.push({
    id: invoiceId,
    invoiceNumber: `WEB/2026-27/${String((state.invoices.length || 0) + 1).padStart(3, '0')}`,
    invoiceDate: today(),
    dueDate: addDays(today(), 15),
    clientId,
    projectId,
    placeOfSupply: 'Chhattisgarh',
    invoiceType: 'Regular',
    amountType: 'GST Inclusive',
    status: 'Sent',
    notes: 'Revenue is taxable value; GST is liability and not income.',
    items: [
      {
        id: uid('item'),
        serviceId: 'svc-web-dev',
        serviceName: 'Website Development',
        hsnSac: '998314',
        description: 'Website design and development',
        qty: 1,
        rate: 40000,
        discount: 0,
        taxableAmount: 33898.31,
        gstRate: 18,
        cgst: 3050.85,
        sgst: 3050.85,
        igst: 0,
        total: 40000,
        isPureAgent: false
      },
      {
        id: uid('item'),
        serviceId: 'svc-domain-hosting',
        serviceName: 'Domain + Hosting Setup',
        hsnSac: '998315',
        description: 'Domain purchase and hosting setup',
        qty: 1,
        rate: 10000,
        discount: 0,
        taxableAmount: 8474.58,
        gstRate: 18,
        cgst: 762.71,
        sgst: 762.71,
        igst: 0,
        total: 10000,
        isPureAgent: false
      }
    ],
    demoSummary: {
      revenue: inclusive.taxableAmount,
      expense: expenseBase,
      gstOutput: inclusive.gstAmount,
      gstInput: expenseGst,
      netGstPayable: inclusive.gstAmount - expenseGst,
      profit: inclusive.taxableAmount - expenseBase,
      cgst: split.cgst,
      sgst: split.sgst
    }
  });

  state.expenses.push({
    id: expenseId,
    expenseDate: today(),
    vendor: 'GoDaddy',
    categoryId: 'exp-domain',
    clientId,
    projectId,
    amountBeforeGst: expenseBase,
    gstRate: 18,
    gstAmount: expenseGst,
    totalAmount: 7080,
    invoiceNumber: 'GDDY-DEMO-001',
    vendorGstin: '',
    paymentMode: 'Card',
    bankAccountId: bankId,
    itcEligible: true,
    rcmApplicable: false,
    attachmentUrl: '',
    notes: 'ITC eligible demo expense.'
  });

  state.bankTransactions.push({
    id: uid('txn'),
    date: today(),
    bankAccountId: bankId,
    transactionType: 'Debit',
    amount: 7080,
    linkedClientId: clientId,
    linkedProjectId: projectId,
    linkedInvoiceId: '',
    linkedExpenseId: expenseId,
    notes: 'GoDaddy demo expense payment.'
  });

  return state;
}

function mergeById(existing = [], incoming = []) {
  const existingIds = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !existingIds.has(item.id))];
}

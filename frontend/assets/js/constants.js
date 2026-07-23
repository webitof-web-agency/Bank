export const APP_STORAGE_KEY = 'webitofClientManagementStateV1';
export const DEFAULT_COMPANY_STATE = 'Chhattisgarh';
export const DEFAULT_GST_RATE = 18;

export const SIDEBAR_MENU = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', route: '#/dashboard', icon: 'grid' },
      { label: 'Clients', route: '#/clients', icon: 'users' },
      { label: 'Projects', route: '#/projects', icon: 'briefcase' }
    ]
  },
  {
    label: 'Finance',
    items: [
      { label: 'Invoices', route: '#/invoices', icon: 'receipt' },
      { label: 'Payments', route: '#/payments', icon: 'wallet' },
      { label: 'Expenses', route: '#/expenses', icon: 'card' },
      { label: 'Vendors', route: '#/vendors', icon: 'users' },
      { label: 'Outsourcing', route: '#/outsourcing', icon: 'briefcase' },
      { label: 'Lead Commissions', route: '#/lead-commissions', icon: 'wallet' },
      { label: 'Banking', route: '#/banking', icon: 'bank' }
    ]
  },
  {
    label: 'Recurring',
    items: [
      { label: 'AMC', route: '#/amc', icon: 'repeat' },
      { label: 'Renewals', route: '#/renewals', icon: 'calendar' }
    ]
  },
  {
    label: 'Admin',
    items: [
      { label: 'Masters', route: '#/masters/services', icon: 'sliders' },
      { label: 'Reports & Analytics', route: '#/reports/analytics', icon: 'chart' },
      { label: 'CA Audit Summary', route: '#/reports/ca-audit', icon: 'file' },
      { label: 'Project Profitability', route: '#/project-profitability', icon: 'chart' },
      { label: 'Settings', route: '#/settings', icon: 'settings' }
    ]
  }
];

export const CLIENT_TYPES = ['Individual', 'Company', 'Government', 'Non-profit'];
export const CLIENT_STATUSES = ['Active', 'Inactive', 'Prospect'];
export const PROJECT_STATUSES = ['Lead', 'Confirmed', 'Planned', 'Active', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
export const PROJECT_TYPES = ['Website', 'Software', 'App', 'Marketing', 'Graphic Design', 'AMC', 'Other'];
export const INVOICE_STATUSES = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];
export const PAYMENT_MODES = ['UPI', 'Bank Transfer', 'Cash', 'Cheque', 'Card'];
export const TRANSACTION_TYPES = ['Credit', 'Debit'];
export const PAYMENT_STATUSES = ['Pending', 'Partially Paid', 'Paid', 'Cancelled'];
export const VENDOR_TYPES = ['Freelancer', 'Agency', 'Referral Partner', 'Other'];
export const TDS_SECTIONS = ['194H', '194J', '194C', 'Not Applicable'];
export const OUTSOURCING_WORK_TYPES = ['Development', 'Marketing', 'Graphic Design', 'Content Writing', 'SEO', 'Support', 'Other'];
export const COMMISSION_TYPES = ['Percentage', 'Fixed'];
export const GST_TYPES = {
  CGST_SGST: 'CGST_SGST',
  CGST_UTGST: 'CGST_UTGST',
  IGST: 'IGST',
  NONE: 'NONE'
};
export const GST_TAX_HEADS = ['CGST', 'SGST', 'UTGST', 'IGST', 'CESS'];
export const INVOICE_TYPES = [
  'Regular',
  'Export with payment of IGST',
  'Export without payment of IGST under LUT',
  'SEZ with payment of IGST',
  'SEZ without payment of IGST under LUT'
];
export const AMOUNT_TYPES = ['GST Extra', 'GST Inclusive'];
export const CLIENT_GST_REGISTRATION_TYPES = [
  'Registered',
  'Unregistered',
  'Composition',
  'SEZ',
  'Overseas'
];
export const BILLING_TYPES = ['Fixed', 'Hourly', 'Milestone', 'Recurring'];
export const AMC_STATUSES = ['Active', 'Expired', 'Paused', 'Cancelled'];
export const RENEWAL_STATUSES = ['Pending', 'Renewed', 'Expired', 'Cancelled'];
export const RENEWAL_CATEGORIES = ['Domain', 'Hosting', 'Software License'];
export const SOFTWARE_LICENSE_SCOPES = ['Internal', 'Client'];
export const RENEWAL_FINANCE_ACTIONS = ['None', 'Create Expense', 'Create Invoice'];
export const DEFAULT_BILLING_CYCLES = ['Monthly', 'Quarterly', 'Half Yearly', 'Yearly', 'One Time'];
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

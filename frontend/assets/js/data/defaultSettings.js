import { DEFAULT_COMPANY_STATE, DEFAULT_GST_RATE } from '../constants.js';

export const DEFAULT_SETTINGS = {
  company: {
    name: 'Webitof',
    legalName: 'Webitof IT Services',
    logoUrl: './assets/images/placeholder-logo.svg',
    address: 'Raipur, Chhattisgarh',
    city: 'Raipur',
    state: DEFAULT_COMPANY_STATE,
    stateCode: '22',
    country: 'India',
    pincode: '492001',
    gstin: '22AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    cin: '',
    udyam: '',
    iso: '',
    email: 'accounts@webitof.com',
    phone: '+91 90000 00000',
    website: 'https://webitof.com'
  },
  gst: {
    defaultRate: DEFAULT_GST_RATE,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
    lutEnabled: true,
    gstRegistered: true,
    autoDetectTax: true,
    defaultExportTreatment: 'Export without payment of IGST under LUT',
    enableCgst: true,
    enableSgst: true,
    enableUtgst: true,
    enableIgst: true,
    enableCess: false
  },
  tds: {
    commissionSection: '194H',
    commissionRate: 2,
    commissionThreshold: 15000
  },
  invoice: {
    prefix: 'WEB',
    nextSequence: 1,
    financialYear: '',
    defaultDueDays: 15,
    terms: 'Payment due as per invoice due date. Late payments may attract additional charges.',
    signatureName: 'Authorized Signatory'
  },
  bank: {
    bankName: 'HDFC Bank',
    accountHolder: 'Webitof IT Services',
    accountNumber: '000000000000',
    ifsc: 'HDFC0000000',
    branch: 'Raipur',
    upiId: 'webitof@upi'
  },
  branding: {
    primaryColor: '#2392f8',
    accentColor: '#5e1cd5'
  },
  smtp: {
    host: '',
    port: '',
    username: '',
    fromEmail: ''
  },
  emailTemplates: {
    invoice: 'Dear {{client}}, please find your invoice {{invoiceNumber}} attached.',
    paymentReminder: 'Dear {{client}}, this is a reminder for invoice {{invoiceNumber}}.'
  },
  complianceNote: 'GST, TDS, and ITC calculations are based on configured settings. Final filing and compliance should be verified by accountant/CA.',
  roles: {
    admin: ['all'],
    accountant: ['finance', 'reports'],
    sales: ['clients', 'projects', 'invoices']
  }
};

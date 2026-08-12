const DEFAULT_SETTINGS = {
  key: 'default',
  appName: 'Bank',
  payload: {
    branding: {
      appName: 'Bank',
      bankName: 'Bank',
      logoUrl: '',
      logoText: 'Bank',
      tagline: 'Employee portal',
      primaryColor: '#3b82f6',
      accentColor: '#1d4ed8',
      sidebarBg: '#090d16'
    },
    ratesConfig: {
      interestRates: {
        paid: {
          compulsoryDeposit: 7,
          specialSaving: 8,
          cashCredit: 0,
          dividend: 5
        },
        receive: {
          loan: 9,
          loanAgainstDeposit: 9,
          houseLoanStaff: 9,
          vehicleLoanStaff: 7
        }
      },
      limits: {
        loan: {
          maxAmount: 1000000,
          multipliers: {
            coOpBankBasic: 8,
            ldBankBasic: 10,
            jilaSanghBasic: 10
          }
        },
        loanAgainstDeposit: {
          compulsoryDepositPercent: 200
        }
      },
      demandListAmount: {
        compulsoryDeposit: 10,
        coOpBankBasic: 10,
        ldBankBasic: 10,
        jilaSanghBasic: 10
      },
      syncOptions: {
        applyChangesInAllMembers: false,
        applyChangesInCompulsoryDeposit: true
      }
    },
    companyProfile: {
      name: 'Sahakari Bank',
      legalName: 'Sahakari Cooperative Bank Ltd.',
      registrationNumber: 'REG-12345678',
      licenseNumber: 'RBI-LIC-87654321',
      email: 'info@sahakaribank.local',
      phone: '1800 123 4567',
      website: 'https://sahakaribank.local',
      gstin: '22AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      tan: 'RAIP00000A',
      address1: 'Jaystambh Chowk',
      city: 'Raipur',
      state: 'Chhattisgarh',
      stateCode: '22',
      country: 'India',
      pincode: '492001'
    }
  },
  smtp: {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromName: 'Bank',
    fromEmail: ''
  },
  notifications: {
    enabled: true,
    inAppEnabled: true,
    emailEnabled: true,
    defaultRoleCodes: ['admin', 'manager'],
    masterAlerts: true,
    transactionAlerts: true,
    securityAlerts: true
  },
  emailTemplates: {
    passwordReset: {
      subject: 'Reset your password',
      text: 'Hello {{name}}, your password reset OTP is {{otp}}. It expires in {{minutes}} minutes.',
      html: '<p>Hello {{name}},</p><p>Your password reset OTP is <strong>{{otp}}</strong>.</p><p>It expires in <strong>{{minutes}}</strong> minutes.</p>'
    },
    notificationAlert: {
      subject: '{{title}} - {{appName}}',
      text: '{{title}}\n\n{{message}}\n\nOpen: {{actionUrl}}',
      html: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h3>{{title}}</h3><p>{{message}}</p><p><a href="{{actionUrl}}">Open notification</a></p></div>'
    },
    demandReminder: {
      subject: '[{{appName}}] Demand reminder - {{count}} overdue',
      text: 'There are {{count}} overdue demands.\n\n{{summary}}\n\nOpen: {{actionUrl}}',
      html: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h3>Demand reminder</h3><p>There are <strong>{{count}}</strong> overdue demands.</p><pre style="white-space:pre-wrap">{{summary}}</pre><p><a href="{{actionUrl}}">Open demands</a></p></div>'
    },
    monthlySummary: {
      subject: '[{{appName}}] Monthly summary - {{month}}',
      text: 'Monthly summary for {{month}}.\n\n{{summary}}\n\nOpen: {{actionUrl}}',
      html: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h3>Monthly summary - {{month}}</h3><pre style="white-space:pre-wrap">{{summary}}</pre><p><a href="{{actionUrl}}">Open reports</a></p></div>'
    },
    securityAlert: {
      subject: '[{{appName}}] Security alert - {{title}}',
      text: '{{message}}\n\nOpen: {{actionUrl}}',
      html: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h3>{{title}}</h3><p>{{message}}</p><p><a href="{{actionUrl}}">Open system</a></p></div>'
    }
  }
};

module.exports = {
  DEFAULT_SETTINGS
};


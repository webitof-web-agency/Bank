const fs = require('fs');

const filesToRemove = [
  'frontend/src/pages/master/ManagerMasterPage.jsx',
  'frontend/src/pages/master/bank-accounts',
  'frontend/src/pages/settings/BrandingPage.jsx',
  'frontend/src/pages/settings/UiSettingsPage.jsx',
  'frontend/src/pages/settings/SmtpEmailPage.jsx',
  'frontend/src/pages/settings/notifications',
  'frontend/src/pages/transactions/transfer-voucher/paymentWorkspace.jsx',
  'frontend/src/pages/transactions/transfer-voucher/paymentWorkspaceDetail.jsx',
  'frontend/src/pages/transactions/interest/receiptWorkspace.jsx',
  'frontend/src/pages/transactions/interest/receiptWorkspaceDetail.jsx',
  'frontend/src/pages/transactions/interest/interestRecvMember.jsx',
  'frontend/src/pages/transactions/interest/interestRecvEmployee.jsx',
  'frontend/src/pages/reports/SummaryMonthlyPage.jsx',
  'frontend/src/pages/master/demands',
  'frontend/src/pages/master/no-interest-members',
];

const routesToRemove = [
  'master/managers',
  'master/bank-accounts',
  'settings/branding',
  'settings/ui-settings',
  'settings/smtp-email',
  'settings/notifications',
  'transactions/transfer-voucher/transfer-voucher-payment',
  'transactions/transfer-voucher/transfer-voucher-receipt',
  'transactions/interest/interest-recv-member',
  'transactions/interest/interest-recv-employee',
  'reports/summary-monthly',
  'master/demands',
  'master/no-interest-members'
];

let appJsx = fs.readFileSync('frontend/src/App.jsx', 'utf8');

// Also try to find exact imports to remove
const importsToRemove = [
  'ManagerMasterPage',
  'BankAccountsPage',
  'BankAccountDetailPage',
  'BrandingPage',
  'UiSettingsPage',
  'SmtpEmailPage',
  'NotificationSettingsPage',
  'TransferVoucherPaymentWorkspacePage',
  'TransferVoucherPaymentWorkspaceDetailPage',
  'ReceiptVoucherWorkspacePage',
  'ReceiptVoucherWorkspaceDetailPage',
  // Not sure what the exact component names were for the interest ones, but we will remove the routes at least.
];

// Remove routes
routesToRemove.forEach(route => {
  const escapedRoute = route.split('/').join('\\/');
  // Match single line <Route path="..." ... />
  const regex1 = new RegExp(`<Route[^>]*path=["']\\/?${escapedRoute}(\\/\\:id)?["'][^>]*\\/>`, 'g');
  appJsx = appJsx.replace(regex1, '');
  // Match multi-line <Route path="..."> ... </Route>
  const regex2 = new RegExp(`<Route[^>]*path=["']\\/?${escapedRoute}(\\/\\:id)?["'][\\s\\S]*?<\\/Route>`, 'g');
  appJsx = appJsx.replace(regex2, '');
});

// Remove imports
importsToRemove.forEach(imp => {
  const impRegex = new RegExp(`^import.*${imp}.*$;?`, 'gm');
  appJsx = appJsx.replace(impRegex, '');
});

// Cleanup empty lines
appJsx = appJsx.replace(/\n\s*\n\s*\n/g, '\n\n');

fs.writeFileSync('frontend/src/App.jsx', appJsx, 'utf8');
console.log("App.jsx cleaned");

// Delete files
filesToRemove.forEach(f => {
  if (fs.existsSync(f)) {
    fs.rmSync(f, { recursive: true, force: true });
    console.log(`Deleted ${f}`);
  }
});

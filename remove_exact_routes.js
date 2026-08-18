const fs = require('fs');

const lines = fs.readFileSync('frontend/src/App.jsx', 'utf8').split('\n');
const newLines = [];

const routesToRemove = [
  'master/managers',
  'master/bank-accounts',
  'master/bank-accounts/:id',
  'settings/branding',
  'settings/ui-settings',
  'settings/smtp-email',
  'settings/notifications',
  'transactions/transfer-voucher/payment',
  'transactions/transfer-voucher/payment/:id',
  'master/demands',
  'master/demands/:id',
  'master/no-interest-members',
  'master/no-interest-members/:id'
];

let skipMode = false;
let routeDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (skipMode) {
    if (line.includes('</Route>')) {
      skipMode = false;
    } else if (line.includes('/>')) {
      skipMode = false;
    }
    continue;
  }

  // Check if this line starts a route we want to remove
  let matched = false;
  for (const route of routesToRemove) {
    // Exact match for the path attribute
    if (line.includes(`path="${route}"`)) {
      matched = true;
      break;
    }
  }

  if (matched) {
    // If it's a self-closing route on the same line, or has </Route> on the same line, skip just this line.
    if (line.includes('/>') || line.includes('</Route>')) {
      // Just skip this line, no skipMode needed
      // Wait, what if it's like `<Route ... />` ? Yes, it just skips this line.
      // But if it's just `<Route path="xxx"` and spans multiple lines, we need skipMode.
    } else {
      skipMode = true;
    }
    // Also skip the preceding `<Route` if it was on the previous line.
    // Let's check if the previous line in newLines was `<Route` without a path
    if (newLines.length > 0 && newLines[newLines.length - 1].trim() === '<Route') {
       newLines.pop();
    }
    continue;
  }

  // Check if this is an import we should remove
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
    'DemandsPage',
    'DemandDetailPage',
    'NoInterestMembersPage',
    'NoInterestMemberDetailPage'
  ];

  let isImport = false;
  if (line.startsWith('import ')) {
    for (const imp of importsToRemove) {
      if (line.includes(imp)) {
        isImport = true;
        break;
      }
    }
  }

  if (isImport) continue;

  newLines.push(line);
}

fs.writeFileSync('frontend/src/App.jsx', newLines.join('\n'), 'utf8');
console.log("App.jsx routes removed carefully.");

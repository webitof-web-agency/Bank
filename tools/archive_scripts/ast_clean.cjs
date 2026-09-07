const fs = require('fs');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

let code = fs.readFileSync('src/App.jsx', 'utf8');

// No string replacements needed

// Now we want to remove the specific routes the user asked to delete
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

const ast = babel.parseSync(code, {
  sourceType: 'module',
  plugins: ['@babel/plugin-syntax-jsx']
});

traverse(ast, {
  ImportDeclaration(path) {
    const importSource = path.node.source.value;
    const specifiers = path.node.specifiers;
    
    let shouldRemove = false;
    for (const spec of specifiers) {
      if (spec.local && importsToRemove.includes(spec.local.name)) {
        shouldRemove = true;
        break;
      }
    }
    
    if (shouldRemove) {
      path.remove();
    }
  },
  
  JSXElement(path) {
    if (path.node.openingElement.name.name === 'Route') {
      const attributes = path.node.openingElement.attributes;
      let pathValue = null;
      
      for (const attr of attributes) {
        if (attr.name && attr.name.name === 'path' && attr.value && attr.value.type === 'StringLiteral') {
          pathValue = attr.value.value;
          break;
        }
      }
      
      if (pathValue && routesToRemove.includes(pathValue)) {
        path.remove();
      }
    }
  }
});

const output = generate(ast, {}, code);

// Remove the massive duplicate master block manually if it still exists
let newCode = output.code;
const dupStart = newCode.indexOf('<Route path="master/committee"');
if (dupStart !== -1) {
    const nextDup = newCode.indexOf('<Route path="master/committee"', dupStart + 1);
    if (nextDup !== -1) {
        // We found a duplicate block! Find the end of it (up to <Route path="/access-denied")
        const endOfDup = newCode.indexOf('<Route path="/access-denied"', nextDup);
        if (endOfDup !== -1) {
            newCode = newCode.substring(0, nextDup) + '\n      </Route>\n\n      ' + newCode.substring(endOfDup);
        }
    }
}

fs.writeFileSync('src/App.jsx', newCode, 'utf8');
console.log("Safely transformed App.jsx using Babel");

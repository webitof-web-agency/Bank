const fs = require('fs');

const appJsx = fs.readFileSync('frontend/src/App.jsx', 'utf8');

// Replace Bank Workspace imports
let newAppJsx = appJsx.replace(/import \{ BankTransactionsHomePage \}.*\nimport \{ BankTransactionWorkspacePage \}.*\nimport \{ BankTransactionWorkspaceDetailPage \}.*\n/, '');
newAppJsx = newAppJsx.replace(/import \{ EmployeeTransactionsHomePage \}.*\nimport \{ EmployeeTransactionWorkspacePage \}.*\nimport \{ EmployeeTransactionWorkspaceDetailPage \}.*\n/, '');
newAppJsx = newAppJsx.replace(/import \{ TransferVoucherHomePage \}.*\nimport \{ TransferVoucherWorkspacePage \}.*\nimport \{ TransferVoucherWorkspaceDetailPage \}.*\n/, '');
newAppJsx = newAppJsx.replace(/import \{ InterestVoucherHomePage \}.*\nimport \{ ReceiptVoucherWorkspacePage \}.*\nimport \{ ReceiptVoucherWorkspaceDetailPage \}.*\nimport \{ InterestVoucherWorkspacePage \}.*\nimport \{ InterestVoucherWorkspaceDetailPage \}.*\n/, '');

// Now replace the <Route blocks
newAppJsx = newAppJsx.replace(/<Route\s*path="transactions\/bank".*?(?=<Route\s*path="transactions\/employee")/s, `
        <Route
          path="transactions/bank"
          element={
            <PermissionRoute permission="bank-transactions.read">
              <BankTransactionsPage sectionKey="bank" detailPathBase="/app/transactions/bank" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/bank/:id"
          element={
            <PermissionRoute permission="bank-transactions.read">
              <BankTransactionDetailPage sectionKey="bank" />
            </PermissionRoute>
          }
        />
`);

newAppJsx = newAppJsx.replace(/<Route\s*path="transactions\/employee".*?(?=<Route\s*path="transactions\/transfer-voucher")/s, `
        <Route
          path="transactions/employee"
          element={
            <PermissionRoute permission="employee-transactions.read">
              <EmployeeTransactionsPage sectionKey="employee" detailPathBase="/app/transactions/employee" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/employee/:id"
          element={
            <PermissionRoute permission="employee-transactions.read">
              <EmployeeTransactionDetailPage sectionKey="employee" />
            </PermissionRoute>
          }
        />
`);

newAppJsx = newAppJsx.replace(/<Route\s*path="transactions\/transfer-voucher".*?(?=<Route\s*path="transactions\/interest")/s, `
        <Route
          path="transactions/transfer-voucher"
          element={
            <PermissionRoute permission="transfer-vouchers.read">
              <TransferVouchersPage sectionKey="transfer-voucher" detailPathBase="/app/transactions/transfer-voucher" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/transfer-voucher/:id"
          element={
            <PermissionRoute permission="transfer-vouchers.read">
              <TransferVoucherDetailPage sectionKey="transfer-voucher" />
            </PermissionRoute>
          }
        />
`);

newAppJsx = newAppJsx.replace(/<Route\s*path="transactions\/interest".*?(?=<Route\s*path="transactions\/other\/payment-voucher")/s, `
        <Route
          path="transactions/interest"
          element={
            <PermissionRoute permission="interest-transactions.read">
              <ReceiptInterestTransactionsPage sectionKey="interest" detailPathBase="/app/transactions/interest" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/interest/:id"
          element={
            <PermissionRoute permission="interest-transactions.read">
              <ReceiptInterestTransactionDetailPage sectionKey="interest" />
            </PermissionRoute>
          }
        />
`);

fs.writeFileSync('frontend/src/App.jsx', newAppJsx);
console.log('App.jsx updated');

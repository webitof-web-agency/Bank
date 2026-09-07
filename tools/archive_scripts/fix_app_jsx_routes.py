import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Add new imports if missing
imports_to_ensure = [
    "import { TransferVoucherTransactionsHomePage } from './pages/transactions/transfer-voucher/home';",
    "import { TransferVoucherTransactionWorkspacePage } from './pages/transactions/transfer-voucher/workspace';",
    "import { TransferVoucherTransactionWorkspaceDetailPage } from './pages/transactions/transfer-voucher/workspaceDetail';",
    "import { InterestHomePage } from './pages/transactions/interest/home';",
    "import { InterestVoucherWorkspacePage } from './pages/transactions/interest/interestWorkspace';",
    "import { InterestVoucherWorkspaceDetailPage } from './pages/transactions/interest/interestWorkspaceDetail';",
    "import { OtherTransactionsPage } from './pages/transactions/other/index';",
    "import { NoInterestMembersPage } from './pages/transactions/other/no-interest-members/index';",
    "import { NoInterestMemberDetailPage } from './pages/transactions/other/no-interest-members/detail';",
    "import { DemandEntryPage } from './pages/transactions/other/demand-entry/index';",
    "import { DemandEntryDetailPage } from './pages/transactions/other/demand-entry/detail';"
]

# We will just append them at the top after the last import if not present
for imp in imports_to_ensure:
    if imp.split('from')[0].strip() not in app:
        # insert after last import
        app = re.sub(r'(import .*?;?\n)(?!import)', r'\1' + imp + '\n', app, count=1)

# Now, we replace everything from <Route path="transactions/transfer-voucher" down to the end of transactions routes
new_routes = """
        <Route path="transactions/transfer-voucher" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionsHomePage /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-paid" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspacePage sectionKey="transfer-voucher" itemKey="transfer-voucher-paid" detailPathBase="/app/transactions/transfer-voucher/transfer-voucher-paid" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-paid/:id" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspaceDetailPage sectionKey="transfer-voucher" itemKey="transfer-voucher-paid" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-recover" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspacePage sectionKey="transfer-voucher" itemKey="transfer-voucher-recover" detailPathBase="/app/transactions/transfer-voucher/transfer-voucher-recover" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-recover/:id" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspaceDetailPage sectionKey="transfer-voucher" itemKey="transfer-voucher-recover" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/payment" element={<PermissionRoute permission="transactions.transfer-voucher.view"><OtherTransactionsPage sectionKey="transfer-voucher" detailPathBase="/app/transactions/transfer-voucher/payment" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/receipt" element={<PermissionRoute permission="transactions.transfer-voucher.view"><OtherTransactionsPage sectionKey="transfer-voucher" detailPathBase="/app/transactions/transfer-voucher/receipt" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/:type/:id" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspaceDetailPage sectionKey="transfer-voucher" /></PermissionRoute>} />

        <Route path="transactions/interest" element={<PermissionRoute permission="transactions.read"><InterestHomePage /></PermissionRoute>} />
        <Route path="transactions/interest/interest-paid-member" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspacePage sectionKey="interest" itemKey="interest-paid-member" detailPathBase="/app/transactions/interest/interest-paid-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-paid-member/:id" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspaceDetailPage sectionKey="interest" itemKey="interest-paid-member" detailPathBase="/app/transactions/interest/interest-paid-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-member" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspacePage sectionKey="interest" itemKey="interest-receive-member" detailPathBase="/app/transactions/interest/interest-receive-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-member/:id" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspaceDetailPage sectionKey="interest" itemKey="interest-receive-member" detailPathBase="/app/transactions/interest/interest-receive-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-employee" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspacePage sectionKey="interest" itemKey="interest-receive-employee" detailPathBase="/app/transactions/interest/interest-receive-employee" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-employee/:id" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspaceDetailPage sectionKey="interest" itemKey="interest-receive-employee" detailPathBase="/app/transactions/interest/interest-receive-employee" /></PermissionRoute>} />
        <Route path="transactions/interest/:type/:id" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspaceDetailPage sectionKey="interest" /></PermissionRoute>} />

        <Route path="transactions/other/payment-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/payment-voucher" /></PermissionRoute>} />
        <Route path="transactions/other/receipt-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/receipt-voucher" /></PermissionRoute>} />
        <Route path="transactions/other/:type/:id" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/payment-voucher" /></PermissionRoute>} />

        <Route path="transactions/other/no-interest-members" element={<PermissionRoute permission="transactions.read"><NoInterestMembersPage sectionKey="other" detailPathBase="/app/transactions/other/no-interest-members" /></PermissionRoute>} />
        <Route path="transactions/other/no-interest-members/:id" element={<PermissionRoute permission="transactions.read"><NoInterestMemberDetailPage sectionKey="other" /></PermissionRoute>} />
        <Route path="transactions/other/demand-entry" element={<PermissionRoute permission={["transactions.read", "demands.read"]}><DemandEntryPage sectionKey="other" detailPathBase="/app/transactions/other/demand-entry" /></PermissionRoute>} />
        <Route path="transactions/other/demand-entry/:id" element={<PermissionRoute permission={["transactions.read", "demands.read"]}><DemandEntryDetailPage sectionKey="other" /></PermissionRoute>} />
"""

app = re.sub(
    r'<Route path="transactions/transfer-voucher"[\s\S]*?(?=\s*\{\/\* Settings \*\/|\s*<\/Route>\s*<\/Routes>)',
    new_routes,
    app
)

# Remove the old import for ReceiptInterestHomePage which breaks if it's moved or if we don't need it
app = re.sub(r'import\s*\{\s*ReceiptInterestHomePage\s*\}\s*from\s*\'[^\']*\';\n', '', app)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(app)


import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Add the imports if missing
imports = [
    "import { TransferVoucherTransactionsHomePage } from './pages/transactions/transfer-voucher/home';",
    "import { TransferVoucherTransactionWorkspacePage } from './pages/transactions/transfer-voucher/workspace';",
    "import { TransferVoucherTransactionWorkspaceDetailPage } from './pages/transactions/transfer-voucher/workspaceDetail';",
    "import { ReceiptInterestHomePage as InterestHomePage } from './pages/transactions/interest/home';",
    "import { InterestVoucherWorkspacePage } from './pages/transactions/interest/interestWorkspace';",
    "import { InterestVoucherWorkspaceDetailPage } from './pages/transactions/interest/interestWorkspaceDetail';",
    "import { OtherTransactionsPage } from './pages/transactions/other/index';",
    "import { NoInterestMembersPage } from './pages/transactions/other/no-interest-members/index';",
    "import { NoInterestMemberDetailPage } from './pages/transactions/other/no-interest-members/detail';",
    "import { DemandEntryPage } from './pages/transactions/other/demand-entry/index';",
    "import { DemandEntryDetailPage } from './pages/transactions/other/demand-entry/detail';"
]

for imp in imports:
    if imp.split('from')[0].strip() not in app:
        app = re.sub(r'(import .*?;?\n)(?!import)', r'\1' + imp + '\n', app, count=1)


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
        <Route path="transactions/other/no-interest-members" element={<PermissionRoute permission="transactions.read"><NoInterestMembersPage sectionKey="other" detailPathBase="/app/transactions/other/no-interest-members" /></PermissionRoute>} />
        <Route path="transactions/other/no-interest-members/:id" element={<PermissionRoute permission="transactions.read"><NoInterestMemberDetailPage sectionKey="other" /></PermissionRoute>} />
        <Route path="transactions/other/demand-entry" element={<PermissionRoute permission={["transactions.read", "demands.read"]}><DemandEntryPage sectionKey="other" detailPathBase="/app/transactions/other/demand-entry" /></PermissionRoute>} />
        <Route path="transactions/other/demand-entry/:id" element={<PermissionRoute permission={["transactions.read", "demands.read"]}><DemandEntryDetailPage sectionKey="other" /></PermissionRoute>} />
"""

# Find the start of <Route path="transactions/transfer-voucher"
start_idx = app.find('<Route path="transactions/transfer-voucher"')

# Find the end of the other transactions routes
end_str = '<Route path="transactions/other/demand-entry/:id" element={<PermissionRoute permission={["transactions.read", "demands.read"]}>\n              <DemandEntryDetailPage sectionKey="other" />\n            </PermissionRoute>} />'

# Let's just find the start of the next section, which is likely `{/* Reports */}` or `<Route path="reports"`
end_idx = app.find('<Route path="reports"', start_idx)
if end_idx == -1:
    end_idx = app.find('{/* Reports', start_idx)

if start_idx != -1 and end_idx != -1:
    app = app[:start_idx] + new_routes + '\n        ' + app[end_idx:]
else:
    # Let's fallback to regex
    app = re.sub(r'<Route path="transactions/transfer-voucher"[\s\S]*?(?=<Route path="reports"|\{\/\* Reports)', new_routes, app)


# Clean up any bad old imports
app = re.sub(r'import\s*\{\s*ReceiptInterestHomePage\s*\}\s*from\s*\'[^\']*\';\n', '', app)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(app)


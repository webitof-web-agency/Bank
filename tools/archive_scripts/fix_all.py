import os
import shutil
import re

# 1. Move supporting to other/demand-entry so we can delete supporting
os.makedirs('src/pages/transactions/other/demand-entry', exist_ok=True)
if os.path.exists('src/pages/transactions/supporting'):
    for file in os.listdir('src/pages/transactions/supporting'):
        shutil.move(f'src/pages/transactions/supporting/{file}', f'src/pages/transactions/other/demand-entry/{file}')
    shutil.rmtree('src/pages/transactions/supporting')

# 2. Rewrite App.jsx routes and imports
with open('src/App.jsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Fix imports
app = re.sub(
    r'import \{ DemandEntryPage \} from \'./pages/transactions/supporting/index\';',
    'import { DemandEntryPage } from \'./pages/transactions/other/demand-entry/index\';',
    app
)
app = re.sub(
    r'import \{ DemandEntryDetailPage \} from \'./pages/transactions/supporting/detail\';',
    'import { DemandEntryDetailPage } from \'./pages/transactions/other/demand-entry/detail\';',
    app
)

# Replace all the routes from <Route path="transactions/transfer-voucher" down to </Routes> with the correct ones
routes_to_replace = """
        {/* Transfer Voucher */}
        <Route path="transactions/transfer-voucher/transfer-voucher-paid" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherPage sectionKey="transfer-voucher" detailPathBase="/app/transactions/transfer-voucher/transfer-voucher-paid" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-recover" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherPage sectionKey="transfer-voucher" detailPathBase="/app/transactions/transfer-voucher/transfer-voucher-recover" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/payment" element={<PermissionRoute permission="transactions.transfer-voucher.view"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/transfer-voucher/payment" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/receipt" element={<PermissionRoute permission="transactions.transfer-voucher.view"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/transfer-voucher/receipt" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/:type/:id" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherDetailPage sectionKey="transfer-voucher" /></PermissionRoute>} />

        {/* Interest */}
        <Route path="transactions/interest/interest-paid-member" element={<PermissionRoute permission="transactions.read"><InterestPage sectionKey="interest" detailPathBase="/app/transactions/interest/interest-paid-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-member" element={<PermissionRoute permission="transactions.read"><InterestPage sectionKey="interest" detailPathBase="/app/transactions/interest/interest-receive-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-employee" element={<PermissionRoute permission="transactions.read"><InterestPage sectionKey="interest" detailPathBase="/app/transactions/interest/interest-receive-employee" /></PermissionRoute>} />
        <Route path="transactions/interest/:type/:id" element={<PermissionRoute permission="transactions.read"><InterestDetailPage sectionKey="interest" /></PermissionRoute>} />

        {/* Other */}
        <Route path="transactions/other/payment-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/payment-voucher" /></PermissionRoute>} />
        <Route path="transactions/other/receipt-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/receipt-voucher" /></PermissionRoute>} />
        <Route path="transactions/other/:type/:id" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/payment-voucher" /></PermissionRoute>} />

        <Route path="transactions/other/no-interest-members" element={<PermissionRoute permission="transactions.read"><NoInterestMembersPage sectionKey="other" detailPathBase="/app/transactions/other/no-interest-members" /></PermissionRoute>} />
        <Route path="transactions/other/no-interest-members/:id" element={<PermissionRoute permission="transactions.read"><NoInterestMemberDetailPage sectionKey="other" /></PermissionRoute>} />
        <Route path="transactions/other/demand-entry" element={<PermissionRoute permission={["transactions.read", "demands.read"]}><DemandEntryPage sectionKey="other" detailPathBase="/app/transactions/other/demand-entry" /></PermissionRoute>} />
        <Route path="transactions/other/demand-entry/:id" element={<PermissionRoute permission={["transactions.read", "demands.read"]}><DemandEntryDetailPage sectionKey="other" /></PermissionRoute>} />
"""

app = re.sub(
    r'\{\/\* Transfer Voucher \*\/\}[\s\S]*?(?=\s*\{\/\* Settings \*\/|\s*<\/Route>)',
    routes_to_replace,
    app
)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(app)


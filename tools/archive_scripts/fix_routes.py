import re

# Fix App.jsx
with open('src/App.jsx', 'r') as f:
    app = f.read()

# Remove no-interest-members imports
app = re.sub(r'import \{ NoInterestMembersPage \} from \'./pages/master/no-interest-members\';\n', '', app)
app = re.sub(r'import \{ NoInterestMemberDetailPage \} from \'./pages/master/no-interest-members/detail\';\n', '', app)

# Replace supporting with other imports
app = re.sub(r'import \{ SupportingTransactionsPage \} from \'./pages/transactions/supporting\';\n', 'import { OtherTransactionsPage } from \'./pages/transactions/other\';\nimport { DemandEntryPage } from \'./pages/transactions/other/DemandEntryPage\';\n', app)
app = re.sub(r'import \{ SupportingTransactionDetailPage \} from \'./pages/transactions/supporting/detail\';\n', 'import { DemandEntryDetailPage } from \'./pages/transactions/other/DemandEntryDetailPage\';\n', app)

# Remove no-interest-members routes
app = re.sub(r'\s*<Route path="transactions/receipt-interest/no-interest-members"[\s\S]*?</PermissionRoute>\} />', '', app)
app = re.sub(r'\s*<Route path="transactions/receipt-interest/no-interest-members/:id"[\s\S]*?</PermissionRoute>\} />', '', app)

# Replace supporting routes with other routes
supporting_routes = r'\s*<Route path="transactions/supporting"[\s\S]*?</PermissionRoute>\} />\s*<Route path="transactions/supporting/:id"[\s\S]*?</PermissionRoute>\} />'

other_routes = """
        <Route path="transactions/other/transactions" element={<PermissionRoute permission="transactions.read">
              <OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/transactions" />
            </PermissionRoute>} />
        <Route path="transactions/other/demand-lists" element={<PermissionRoute permission={["transactions.read", "demands.read"]}>
              <DemandEntryPage sectionKey="other" detailPathBase="/app/transactions/other/demand-lists" />
            </PermissionRoute>} />
        <Route path="transactions/other/demand-lists/:id" element={<PermissionRoute permission={["transactions.read", "demands.read"]}>
              <DemandEntryDetailPage sectionKey="other" />
            </PermissionRoute>} />"""

app = re.sub(supporting_routes, other_routes, app)

with open('src/App.jsx', 'w') as f:
    f.write(app)

# Fix transactionLinks.js
with open('src/pages/transactions/transactionLinks.js', 'r') as f:
    links = f.read()

# Remove no-interest-members from links
links = re.sub(r',\s*\{\s*label:\s*\'No Interest Members\'.*?\}', '', links)

# Replace supporting with other
supporting_block = r'\{\s*key:\s*\'supporting\'[\s\S]*?\}\s*\]\s*\}'
other_block = """{
    key: 'other',
    label: 'Other',
    path: '/app/transactions/other/transactions',
    icon: FileText,
    permission: 'transactions.read',
    description: 'Other transactions and demand entries.',
    tone: 'slate',
    children: [
      { label: 'Other Transactions', path: '/app/transactions/other/transactions', icon: FileText },
      { label: 'Demand List', path: '/app/transactions/other/demand-lists', icon: FileText }
    ]
  }"""

links = re.sub(supporting_block, other_block, links)

with open('src/pages/transactions/transactionLinks.js', 'w') as f:
    f.write(links)


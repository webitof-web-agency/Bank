import re

with open('frontend/src/App.jsx', 'r') as f:
    content = f.read()

# Routes to remove
routes = [
    r'master/managers',
    r'master/bank-accounts',
    r'master/bank-accounts/:id',
    r'settings/branding',
    r'settings/ui-settings',
    r'settings/smtp-email',
    r'settings/notifications',
    r'transactions/transfer-voucher/payment',
    r'transactions/transfer-voucher/payment/:id',
    r'master/demands',
    r'master/demands/:id',
    r'master/no-interest-members',
    r'master/no-interest-members/:id'
]

imports = [
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
]

# We want to match `<Route ... />` or `<Route ...> ... </Route>`
# Since JSX is nested, a simple regex might fail on arbitrary nesting, but for <Route> it's well defined.
# A Route element starts with `<Route` and ends with either `/>` or `</Route>`.
# We'll use a regex that handles both correctly without crossing `<Route` boundaries if possible.
# Actually, since these routes don't contain other `<Route>` inside them, we can safely match up to the first `/>` or `</Route>` that comes AFTER the path="...".
# We must find `<Route` then any chars except `<Route` (wait, no, `<Route` can contain other tags, but not `<Route`).
# So: <Route(?:(?!<Route).)*?path="THE_PATH"(?:(?!<Route).)*?(?:/>|</Route>)
# This uses negative lookahead to ensure we don't cross another <Route

for route in routes:
    # Handle single or double quotes
    pattern = r'<Route(?:(?!<Route)[\s\S])*?path=["\']' + route + r'["\'](?:(?!<Route)[\s\S])*?(?:/>|</Route>)'
    content = re.sub(pattern, '', content)

# Also remove the imports
for imp in imports:
    pattern = r'^import\s+.*?' + imp + r'.*?;\n?'
    content = re.sub(pattern, '', content, flags=re.MULTILINE)

# Remove extra empty lines
content = re.sub(r'\n\s*\n\s*\n', '\n\n', content)

with open('frontend/src/App.jsx', 'w') as f:
    f.write(content)
print("Cleaned App.jsx with Python!")

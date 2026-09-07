import re

with open('src/pages/transactions/other/index.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add itemKey to props
content = content.replace('export function OtherTransactionsPage({ sectionKey, detailPathBase }) {', 'export function OtherTransactionsPage({ sectionKey, itemKey, detailPathBase }) {')

# 2. Modify sectionItems
content = re.sub(
    r'const sectionItems = useMemo\(\(\) => getSectionItems\(catalog, sectionKey\), \[catalog, sectionKey\]\);',
    'const sectionItems = useMemo(() => {\n    const items = getSectionItems(catalog, sectionKey);\n    return itemKey ? items.filter(i => i.key === itemKey) : items;\n  }, [catalog, sectionKey, itemKey]);\n  const activeItem = sectionItems[0] || null;',
    content
)

# 3. Modify openCreate
content = re.sub(
    r'function openCreate\(itemKey\) \{[\s\S]*?const item = sectionItems\.find\(\(entry\) => entry\.key === itemKey\) \|\| sectionItems\[0\] \|\| null;',
    'function openCreate() {\n    const item = activeItem;',
    content
)

# 4. Filter visibleRows to only include items matching activeItem label/type if applicable, actually getSectionItems filtering takes care of it but let's make sure filterTransactionRows works. 
# wait, `baseRows = filterTransactionRows(rows, sectionItems);` already filters rows because sectionItems will only contain the itemKey!
# Let's verify `filterTransactionRows`. `filterTransactionRows` uses `sectionItems` to filter the rows by matching `row.voucherCategory` to `item.label` or `item.aliases`.

# 5. Remove Linked Master Pages entirely
content = re.sub(
    r'<Card className="p-6">\s*<div className="flex items-center gap-2 mb-4 text-slate-800">[\s\S]*?Linked Master Pages[\s\S]*?<\/Card>',
    '',
    content
)

# 6. Change the title
content = re.sub(
    r'<h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">\{section \? section\.title : \'Other Transactions\'\} Transactions<\/h1>',
    '<h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{activeItem?.label || section?.title || \'Other Transactions\'} Transactions</h1>',
    content
)

# 7. The Create button
content = re.sub(
    r'<DropdownMenu open=\{dropdownOpen\} onOpenChange=\{setDropdownOpen\}>[\s\S]*?<\/DropdownMenu>',
    """<Button type="button" className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90" onClick={openCreate} disabled={!activeItem || !canWrite}>
            <Plus size={16} />
            New Entry
          </Button>""",
    content
)

with open('src/pages/transactions/other/index.jsx', 'w', encoding='utf-8') as f:
    f.write(content)


# Now fix App.jsx to pass itemKey
with open('src/App.jsx', 'r', encoding='utf-8') as f:
    app = f.read()

app = app.replace(
    '<Route path="transactions/other/payment-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/payment-voucher" /></PermissionRoute>} />',
    '<Route path="transactions/other/payment-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" itemKey="payment-voucher" detailPathBase="/app/transactions/other/payment-voucher" /></PermissionRoute>} />'
)

app = app.replace(
    '<Route path="transactions/other/receipt-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" detailPathBase="/app/transactions/other/receipt-voucher" /></PermissionRoute>} />',
    '<Route path="transactions/other/receipt-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" itemKey="receipt-voucher" detailPathBase="/app/transactions/other/receipt-voucher" /></PermissionRoute>} />'
)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(app)


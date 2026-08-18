import os
import re

def fix_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Global spacing replacements for the forms
    # space-y-8 -> space-y-4
    content = content.replace('space-y-8', 'space-y-4')
    # space-y-6 -> space-y-4
    content = content.replace('space-y-6', 'space-y-4')
    # space-y-4 -> space-y-3
    content = content.replace('space-y-4', 'space-y-3')
    # gap-6 -> gap-3
    content = content.replace('gap-6', 'gap-3')
    # gap-4 -> gap-3
    content = content.replace('gap-4', 'gap-3')

    # 2. Make grids wider (md:grid-cols-2 to md:grid-cols-3) where it fits well
    # For many simple forms, moving from 2 cols to 3 cols saves 1-2 rows.
    # Be careful with col-span-2, if we use grid-cols-3, col-span-2 still works nicely.
    # But let's just do grid-cols-3 generally for all md:grid-cols-2 grids in the transaction forms.
    content = content.replace('md:grid-cols-2', 'md:grid-cols-3')

    # In memberForm.jsx, RecoveryLinesEditor has md:grid-cols-3. Let's make it md:grid-cols-5
    content = content.replace('md:grid-cols-3\n          <div className="space-y-1.5 md:col-span-3">', 'md:grid-cols-5">\n          <div className="space-y-1.5 md:col-span-2">')
    # Wait, the string replace might be too fragile for this.
    content = re.sub(r'className="grid gap-3 md:grid-cols-3"', 'className="grid gap-3 md:grid-cols-4"', content)
    
    # Narration often has md:col-span-2. If we changed grid to 3, narration should span 3.
    content = re.sub(r'md:col-span-2">\s*<FieldLabel>Narration', 'md:col-span-3">\n            <FieldLabel>Narration', content)
    content = re.sub(r'md:col-span-2">\s*<input type="checkbox"', 'md:col-span-3">\n            <input type="checkbox"', content)
    
    # For Settlement Account, it was md:col-span-2. In grid-cols-3 it's fine as 2, or make it 3.
    content = re.sub(r'md:col-span-2">\s*<FieldLabel>Settlement Account', 'md:col-span-3">\n            <FieldLabel>Settlement Account', content)

    # For Total Amount, it was md:col-span-2. Let's make it col-span-1 so it fits better.
    content = re.sub(r'className="space-y-1.5 md:col-span-2">\s*<FieldLabel>Total Amount', 'className="space-y-1.5">\n            <FieldLabel>Total Amount', content)
    
    # In RecoveryLinesEditor, md:col-span-3 for member was used. We made grid-cols-4. So member can be col-span-2.
    content = content.replace('md:col-span-3">\n            <LookupSelect', 'md:col-span-2">\n            <LookupSelect')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed layout in {filepath}")

form_files = [
    'src/pages/transactions/member/memberForm.jsx',
    'src/pages/transactions/employee/employeeForm.jsx',
    'src/pages/transactions/bank/bankForm.jsx',
    'src/pages/transactions/transfer-voucher/transferVoucherForm.jsx',
    'src/pages/transactions/transfer-voucher/transferVoucherPaymentForm.jsx',
    'src/pages/transactions/receipt-interest/interestForm.jsx',
    'src/pages/transactions/receipt-interest/receiptForm.jsx',
    'src/pages/transactions/other/otherForm.jsx',
    'src/pages/master/demands/demandForm.jsx',
    'src/pages/transactions/other/no-interest-members/noInterestMemberForm.jsx',
    'src/pages/master/branches/branchForm.jsx',
    'src/pages/master/ledgers/ledgerForm.jsx',
    'src/pages/master/employees/employeeForm.jsx'
]

for filepath in form_files:
    fix_file(filepath)


import os

replacements = {
    'â‚¹': '₹',
    'â€”': '—',
    'ðŸ‘‹': '👋',
    'â€¢': '•',
    'â†‘': '↑',
    'â†“': '↓',
    'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ': '—',
    'Ã¢â‚¬â€': '—'
}

files_to_fix = [
    'src/pages/transactions/member/transactionUtils.js',
    'src/pages/transactions/receipt-interest/interestForm.jsx',
    'src/pages/transactions/receipt-interest/interestWorkspaceDetail.jsx',
    'src/pages/transactions/receipt-interest/receiptForm.jsx',
    'src/pages/transactions/receipt-interest/receiptWorkspaceDetail.jsx',
    'src/pages/transactions/transfer-voucher/transactionUtils.js'
]

for filepath in files_to_fix:
    if not os.path.exists(filepath): continue
    try:
        with open(filepath, 'r', encoding='windows-1252') as f:
            content = f.read()
        
        # also we might want to do the mojibake replacements, but maybe the windows-1252 decode already fixed some?
        # Windows-1252 byte 0x97 is em-dash. So we don't need to replace it, just saving as UTF-8 will convert it cleanly!
        # Let's also do replacements just in case.
        for bad, good in replacements.items():
            content = content.replace(bad, good)
            
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed encoding in {filepath}")
    except Exception as e:
        print(f"Failed {filepath}: {e}")


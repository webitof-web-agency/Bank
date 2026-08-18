import os

filepath = 'src/pages/transactions/member/detail.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ', '—')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)


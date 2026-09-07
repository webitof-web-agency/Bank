import os
import re

def fix_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Needs to be 4 dots (../../../../)
    content = re.sub(r'(\.\.\/)+(api|components|context|hooks|utils|lib|config)', r'../../../../\2', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, _, files in os.walk('src/pages/transactions/other/demand-entry'):
    for file in files:
        if file.endswith(('.jsx', '.js')):
            fix_file(os.path.join(root, file))


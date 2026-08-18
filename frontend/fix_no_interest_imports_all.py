import re
import os

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 3 dots back to 4 dots for components, api, etc
    content = re.sub(r'\.\.\/\.\.\/\.\.\/(api|components|context|hooks|utils|lib|config)', r'../../../../\1', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, _, files in os.walk('src/pages/transactions/other/no-interest-members'):
    for file in files:
        if file.endswith(('.jsx', '.js')):
            fix_file(os.path.join(root, file))


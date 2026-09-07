import os
import re

def fix_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    # Change ../../../ to ../../../../ for components, api, hooks, utils
    content = re.sub(r'\.\.\/\.\.\/\.\.\/(api|components|context|hooks|utils|lib)', r'../../../../\1', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('src/pages/transactions/other/no-interest-members/index.jsx')
fix_file('src/pages/transactions/other/no-interest-members/detail.jsx')
fix_file('src/pages/transactions/supporting/index.jsx')
fix_file('src/pages/transactions/supporting/detail.jsx')

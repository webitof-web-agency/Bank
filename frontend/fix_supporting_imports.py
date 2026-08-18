import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = re.sub(r'\.\.\/\.\.\/\.\.\/\.\.\/(api|components|context|hooks|utils|lib)', r'../../../\1', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('src/pages/transactions/supporting/index.jsx')
fix_file('src/pages/transactions/supporting/detail.jsx')

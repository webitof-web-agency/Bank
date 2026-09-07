import os
import re

def fix_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    # 1. Global spacing replacements for the forms
    content = content.replace('space-y-8', 'space-y-4')
    content = content.replace('space-y-6', 'space-y-4')
    content = content.replace('space-y-4', 'space-y-3')
    content = content.replace('gap-6', 'gap-3')
    content = content.replace('gap-4', 'gap-3')

    # 2. Make grids wider (md:grid-cols-2 to md:grid-cols-3)
    content = content.replace('md:grid-cols-2', 'md:grid-cols-3')

    # 3. Clean up labels
    content = re.sub(r'md:col-span-2">\s*<FieldLabel>Narration', 'md:col-span-3">\n            <FieldLabel>Narration', content)
    content = re.sub(r'md:col-span-2">\s*<input type="checkbox"', 'md:col-span-3">\n            <input type="checkbox"', content)
    content = re.sub(r'md:col-span-2">\s*<FieldLabel>Settlement Account', 'md:col-span-3">\n            <FieldLabel>Settlement Account', content)
    content = re.sub(r'className="space-y-1.5 md:col-span-2">\s*<FieldLabel>Total Amount', 'className="space-y-1.5">\n            <FieldLabel>Total Amount', content)
    
    # 4. Handle recovery lines
    content = re.sub(r'className="grid gap-3 md:grid-cols-3"', 'className="grid gap-3 md:grid-cols-4"', content)
    content = content.replace('md:col-span-3">\n            <LookupSelect', 'md:col-span-2">\n            <LookupSelect')

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed layout in {filepath}")

for root, _, files in os.walk('src/pages'):
    for file in files:
        if file.lower().endswith('form.jsx'):
            fix_file(os.path.join(root, file))


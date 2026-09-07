import glob

files = glob.glob('src/pages/transactions/**/*workspace.jsx', recursive=True) + glob.glob('src/pages/transactions/**/*Workspace.jsx', recursive=True)

for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace('        </div>        </div>\n      </div>', '        </div>\n      </div>')
    
    if new_content != content:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed {fpath}")


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

def fix_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        original = content
        for bad, good in replacements.items():
            content = content.replace(bad, good)
            
        if original != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Fixed encoding in {filepath}")
    except Exception as e:
        print(f"Failed {filepath}: {e}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith(('.js', '.jsx', '.css', '.html')):
            fix_file(os.path.join(root, file))


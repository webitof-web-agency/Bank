import os
import re
import glob

perfect_cards = """      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Total Transactions', subLabel: 'Voucher records loaded in this section', value: stats.total, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Posted', subLabel: 'Posted and active entries', value: stats.posted, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Amount', subLabel: 'Total voucher amount for the filtered section', value: formatTransactionAmount(stats.amount), icon: Banknote, color: 'text-purple-500', bg: 'bg-purple-50' }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4 rounded-2xl">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${item.bg} ${item.color}`}>
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{item.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-bold text-slate-900 truncate">{loading ? '...' : item.value}</p>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{item.subLabel}</p>
              </div>
            </Card>
          );
        })}
      </div>"""

export_csv_func = """  function exportCsv() {
    const headers = ['Voucher No', 'Date', 'Category', 'Party', 'Amount', 'Status', 'Narration'];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.map(escape).join(','),
      ...visibleRows.map((row) => ([
        row.voucherNo,
        row.date,
        row.voucherCategory,
        getTransactionPartyLabel(row.partyCode, lookups, row.partyType),
        row.amount ?? 0,
        row.status || 'Draft',
        row.narration || ''
      ].map(escape).join(',')))
    ].join('\\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sectionKey || 'transactions'}-export.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function persistVoucherDocuments"""

# For index.jsx, use editableItems, for workspace.jsx use activeItems
action_block_index = """        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={exportCsv}>
            Export CSV
          </Button>
          
          {activeItem ? (
            <Button type="button" className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90" onClick={() => openCreate(activeItem.key)}>
              <Plus size={16} />
              Create {activeItem.label}
            </Button>
          ) : (
            <div className="relative">
              <Button
                type="button"
                className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
              >
                <Plus size={16} />
                Create Transaction
                <ChevronDown size={14} className="ml-1 opacity-70" />
              </Button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-max min-w-[18rem] origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-900/5">
                  {(editableItems || sectionItems || []).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setDropdownOpen(false);
                        openCreate(item.key);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary)] transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
                        <Plus size={14} strokeWidth={2.5} />
                      </div>
                      <span className="line-clamp-1">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>"""

action_block_workspace = action_block_index.replace("editableItems", "activeItems")

files = glob.glob('src/pages/transactions/**/*.jsx', recursive=True)
card_regex = re.compile(r'      <div className="grid gap-4 md:grid-cols-3">\s*\{\[\s*\{\s*label: \'Total Transactions\'.*?<\/div>\s*<\/Card>\s*\);\s*\}\)}\s*<\/div>', re.DOTALL)
header_regex = re.compile(r'        <div className="flex flex-wrap gap-2">.*?<\/div>\s*<\/div>\s*<div className="grid gap-4 md:grid-cols-3">', re.DOTALL)

for fpath in files:
    if not (fpath.endswith('workspace.jsx') or fpath.endswith('index.jsx')): continue
    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    new_content = content
    
    # 1. Update Cards
    match = card_regex.search(new_content)
    if match:
        new_content = new_content[:match.start()] + perfect_cards + new_content[match.end():]

    # 2. Add Export CSV if not present
    if 'function exportCsv' not in new_content and 'persistVoucherDocuments' in new_content:
        new_content = new_content.replace('  async function persistVoucherDocuments', export_csv_func)

    # 3. Add ChevronDown if not imported
    if 'export function' in new_content and 'ChevronDown' not in new_content:
        new_content = new_content.replace('lucide-react\';', 'ChevronDown } from \'lucide-react\';').replace('} , ChevronDown', ', ChevronDown')

    # 4. Update Header actions
    if 'Export CSV' not in new_content or 'relative' not in new_content:
        # replace the flex-wrap gap-2 block
        header_match = header_regex.search(new_content)
        if header_match:
            action_block = action_block_workspace if 'workspace.jsx' in fpath else action_block_index
            new_content = new_content[:header_match.start()] + action_block + '\n      </div>\n\n' + new_content[header_match.end() - len('<div className="grid gap-4 md:grid-cols-3">'):]

    if new_content != content:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {fpath}")


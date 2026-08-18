import os
import glob
import re

files = glob.glob('src/pages/transactions/**/*workspace.jsx', recursive=True) + glob.glob('src/pages/transactions/**/*Workspace.jsx', recursive=True)
files = list(set(files))

card_replacement = """      <div className="grid gap-4 md:grid-cols-3">
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

for fpath in files:
    if 'Detail' in fpath: continue # skip Detail.jsx
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Update Cards
    if 'subLabel' not in content:
        # We find the <div className="grid gap-4 md:grid-cols-3"> and replace until the next </div>
        # But we need to be careful. The block is:
        start_idx = content.find('      <div className="grid gap-4 md:grid-cols-3">')
        if start_idx != -1:
            end_search = '        })}\n      </div>'
            end_idx = content.find(end_search, start_idx)
            if end_idx != -1:
                content = content[:start_idx] + card_replacement + content[end_idx + len(end_search):]
                
    # 2. Add Export CSV function
    if 'function exportCsv' not in content:
        export_func = """  function exportCsv() {
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
        content = content.replace('  async function persistVoucherDocuments', export_func)
        
    # 3. Add ChevronDown import if missing
    if 'ChevronDown' not in content and 'lucide-react' in content:
        content = content.replace(" } from 'lucide-react';", ", ChevronDown } from 'lucide-react';")
        
    # 4. Replace Header action block
    if 'Export CSV' not in content and 'flex flex-wrap gap-2' in content:
        start_idx = content.find('        <div className="flex flex-wrap gap-2">')
        if start_idx != -1:
            end_search = '        </div>\n      </div>\n\n      <div className="grid'
            end_idx = content.find(end_search, start_idx)
            if end_idx != -1:
                # Replace
                action_block = """        <div className="flex flex-wrap gap-2">
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
                  {(activeItems || sectionItems || []).map((item) => (
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
                content = content[:start_idx] + action_block + content[end_idx:]

    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated {fpath}")


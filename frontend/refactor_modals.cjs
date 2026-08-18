const fs = require('fs');

const files = [
  'src/pages/transactions/transfer-voucher/workspace.jsx',
  'src/pages/transactions/transfer-voucher/workspaceDetail.jsx',
  'src/pages/transactions/transfer-voucher/paymentWorkspace.jsx',
  'src/pages/transactions/transfer-voucher/paymentWorkspaceDetail.jsx',
  'src/pages/transactions/transfer-voucher/detail.jsx',
  'src/pages/transactions/transfer-voucher/index.jsx',
  'src/pages/transactions/interest/interestWorkspace.jsx',
  'src/pages/transactions/interest/interestWorkspaceDetail.jsx',
  'src/pages/transactions/interest/detail.jsx',
  'src/pages/transactions/interest/index.jsx',
  'src/pages/transactions/receipt-interest/receiptWorkspace.jsx',
  'src/pages/transactions/receipt-interest/receiptWorkspaceDetail.jsx',
  'src/pages/transactions/receipt-interest/detail.jsx',
  'src/pages/transactions/receipt-interest/interestWorkspace.jsx',
  'src/pages/transactions/receipt-interest/interestWorkspaceDetail.jsx',
  'src/pages/transactions/receipt-interest/index.jsx',
  'src/pages/transactions/employee/workspace.jsx',
  'src/pages/transactions/employee/workspaceDetail.jsx',
  'src/pages/transactions/employee/detail.jsx',
  'src/pages/transactions/employee/index.jsx',
  'src/pages/transactions/bank/detail.jsx',
  'src/pages/transactions/bank/index.jsx',
  'src/pages/transactions/other/demand-entry/detail.jsx',
  'src/pages/transactions/other/demand-entry/index.jsx',
  'src/pages/transactions/other/no-interest-members/detail.jsx',
  'src/pages/transactions/other/no-interest-members/index.jsx'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Find <Modal open={editorOpen} ... >
  // extract the props string, replace size="xl" with width="min(1100px, 96vw)"
  const regex = /<Modal([^>]*?(?:open=\{editorOpen\}|title=\{)[^>]*?)>([\s\S]*?)<\/Modal>/g;
  
  content = content.replace(regex, (match, props, innerHTML) => {
    // If it already has footer=, skip
    if (props.includes('footer=')) return match;
    
    // Replace size="xl"
    let newProps = props.replace(/size="xl"/, 'width="min(1100px, 96vw)"');
    // Also if width isn't specified, and we didn't replace size, maybe add width?
    if (!newProps.includes('width=')) {
        newProps += ' width="min(1100px, 96vw)"';
    }

    // Try to extract the footer div.
    // Usually it looks like: <div className="mt-5 flex justify-end..."><Button...Cancel</Button><Button...Save</Button></div>
    // Let's use a regex to find a div containing Button...Cancel.
    const footerRegex = /<div className="[^"]*?(?:justify-end|justify-between)[^"]*?"[^>]*?>\s*(?:<Button[^>]*?>Cancel<\/Button>|<Button[^>]*?onClick=\{closeEditor\}[^>]*?>.*?Cancel.*?<\/Button>).*?<\/div>/s;
    
    const footerMatch = innerHTML.match(footerRegex);
    if (!footerMatch) return match; // Could not find footer

    // Remove the footer from innerHTML
    let newInner = innerHTML.replace(footerMatch[0], '');

    // Sometimes the innerHTML is wrapped in <div className="max-h-[80vh] overflow-y-auto pr-1">
    // We should unwrap it because Modal does scrolling natively now if needed, or leave it.
    // Leaving it is fine.
    
    // The footerMatch[0] is the div. Let's wrap it in a cleaner flex div if it's too messy.
    // Actually, just pass it as footer={...}
    
    // format the footer:
    let footerJSX = footerMatch[0].trim();
    // replace `mt-5 ` and `pt-4 ` and `border-t ` since the Modal adds its own padding and border
    footerJSX = footerJSX.replace(/mt-5\s*/, '');
    footerJSX = footerJSX.replace(/pt-4\s*/, '');
    footerJSX = footerJSX.replace(/border-t\s*/, '');
    footerJSX = footerJSX.replace(/border-slate-200\s*/, '');
    // Ensure it has flex w-full justify-end gap-3
    footerJSX = footerJSX.replace(/className="[^"]*?"/, 'className="flex w-full justify-end gap-3"');
    
    changed = true;
    return `<Modal${newProps} footer={${footerJSX}}>${newInner}</Modal>`;
  });

  if (changed) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
}

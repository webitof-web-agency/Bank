const fs = require('fs');
const path = require('path');

const baseDir = path.join('d:', 'OfficeProject', 'Bank', 'frontend', 'src', 'pages', 'transactions');
const modules = ['bank', 'employee', 'transfer-voucher', 'receipt-interest', 'supporting', 'member'];

function processModule(modName) {
  const indexFile = path.join(baseDir, modName, 'index.jsx');
  const detailFile = path.join(baseDir, modName, 'detail.jsx');

  if (fs.existsSync(indexFile)) {
    let indexContent = fs.readFileSync(indexFile, 'utf8');

    // Default label mappings based on module
    let partyLabel = 'Party';
    let settlementLabel = 'Settlement A/c';

    if (modName === 'bank') {
      partyLabel = 'Instrument No/Ref'; // In bank, party is usually the ref or payee
      settlementLabel = 'Bank A/c';
    } else if (modName === 'employee') {
      partyLabel = 'Employee Name';
    } else if (modName === 'transfer-voucher') {
      // We should remove party and settlement for transfer voucher, replace with Narration
      // We will do this manually for transfer-voucher since it's structurally different
    } else if (modName === 'receipt-interest') {
      partyLabel = 'Received From';
    } else if (modName === 'supporting') {
      partyLabel = 'Linked Party';
    }

    if (modName !== 'transfer-voucher' && modName !== 'member') { // Member is already done
      // Replace Party label
      indexContent = indexContent.replace(
        /key:\s*'party',\s*label:\s*'[^']+',/g,
        `key: 'party',\n      label: '${partyLabel}',`
      );
      // Replace Settlement label
      indexContent = indexContent.replace(
        /key:\s*'settlement',\s*label:\s*'[^']+',/g,
        `key: 'settlement',\n      label: '${settlementLabel}',`
      );
    }
    
    // For transfer-voucher, replace party and settlement entirely with Narration
    if (modName === 'transfer-voucher') {
      // Find the columns array and replace party and settlement chunks
      // Actually regex replace might be tricky, let's use string replacement
      const partyChunkRegex = /\{\s*key:\s*'party'[\s\S]*?render:\s*\([^)]*\)\s*=>[\s\S]*?\},/;
      const settlementChunkRegex = /\{\s*key:\s*'settlement'[\s\S]*?render:\s*\([^)]*\)\s*=>[\s\S]*?\},/;
      
      let narrationChunk = `{
      key: 'narration',
      label: 'Narration',
      sortable: true,
      render: (row) => <span className="text-slate-700 line-clamp-1">{row.narration || '-'}</span>
    },`;
      
      if (indexContent.match(partyChunkRegex)) {
        indexContent = indexContent.replace(partyChunkRegex, narrationChunk);
        indexContent = indexContent.replace(settlementChunkRegex, ''); // Remove settlement
      }
    }

    fs.writeFileSync(indexFile, indexContent);
  }

  if (fs.existsSync(detailFile)) {
    let detailContent = fs.readFileSync(detailFile, 'utf8');

    // Add exportCsv function if missing
    if (!detailContent.includes('function exportCsv()')) {
      const exportCsvFunc = `
  function exportCsv() {
    if (!record) return;
    const headers = ['Voucher No', 'Date', 'Type', 'Amount', 'Status', 'Narration'];
    const row = [
      record.voucherNo || '',
      record.date || '',
      record.voucherCategory || '',
      record.amount || 0,
      record.status || 'Draft',
      record.narration || ''
    ];
    const escape = (value) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const csv = [headers.map(escape).join(','), row.map(escape).join(',')].join('\\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = \`\${record.voucherNo || 'voucher'}-export.csv\`;
    link.click();
    URL.revokeObjectURL(url);
  }
`;
      // Find where to insert it - just before saveVoucher
      detailContent = detailContent.replace(/  async function saveVoucher\(event\)/, exportCsvFunc + '\n  async function saveVoucher(event)');
    }

    // Hide topbar and sidebars during print
    // Add print:hidden to the back button area
    detailContent = detailContent.replace(
      /<div className="flex items-center gap-2 text-\[13px\] font-medium text-slate-500">/g,
      '<div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 print:hidden">'
    );

    // Add print:hidden to action buttons
    detailContent = detailContent.replace(
      /<div className="flex flex-col md:items-end gap-4">/g,
      '<div className="flex flex-col md:items-end gap-4 print:hidden">'
    );

    fs.writeFileSync(detailFile, detailContent);
  }
}

modules.forEach(processModule);
console.log('Customization complete.');

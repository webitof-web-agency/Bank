const fs = require('fs');
const path = require('path');
const dir = 'd:/OfficeProject/Bank/frontend/src/pages/transactions';
const types = ['bank', 'employee', 'member', 'receipt-interest', 'supporting', 'transfer-voucher'];

types.forEach(type => {
  const file = path.join(dir, type, 'detail.jsx');
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    const regex = /\s*<div className="border-b border-slate-100[^>]*>\s*<h2[^>]*>.*?<\/h2>\s*<p[^>]*>.*?<\/p>\s*<\/div>/gs;
    content = content.replace(regex, '');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ' + type + '/detail.jsx');
  }
});

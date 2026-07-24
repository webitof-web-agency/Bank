const fs = require('fs');
const path = require('path');
const dir = 'd:/OfficeProject/Bank/frontend/src/pages/transactions';
const types = ['bank', 'employee', 'member', 'receipt-interest', 'supporting', 'transfer-voucher'];

const target = `{tab.label}
              {tab.badge`;

const replacement = `{tab.icon && <tab.icon size={15} className="mb-0.5" />}
              {tab.label}
              {tab.badge`;

types.forEach(type => {
  const file = path.join(dir, type, 'detail.jsx');
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(file, content, 'utf8');
      console.log('Added icons to tabs in ' + type);
    }
  }
});

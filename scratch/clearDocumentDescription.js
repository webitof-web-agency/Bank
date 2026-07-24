const fs = require('fs');
const path = require('path');
const dir = 'd:/OfficeProject/Bank/frontend/src/pages/transactions';
const types = ['bank', 'employee', 'member', 'receipt-interest', 'supporting', 'transfer-voucher'];

types.forEach(type => {
  const file = path.join(dir, type, 'detail.jsx');
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace description prop in DocumentSection with description=""
    const match = content.match(/<DocumentSection[\s\S]*?\/>/g);
    if (match) {
        match.forEach(m => {
            const updated = m.replace(/description=\{[\s\S]*?\}/, 'description=""')
                             .replace(/description=["'][^"']*["']/, 'description=""');
            content = content.replace(m, updated);
        });
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ' + type);
  }
});

const fs = require('fs');
let code = fs.readFileSync('d:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx', 'utf-8');
code = code.replace(/\{value \|\|\s*'A[^]*?'\}/g, "{value || '-'}");
fs.writeFileSync('d:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx', code, 'utf-8');
console.log('Fixed DetailRow!');

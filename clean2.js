const fs = require('fs');
let code = fs.readFileSync('d:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx', 'utf-8');
code = code.replace(/\\'-\\'/g, "'-'");
fs.writeFileSync('d:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx', code, 'utf-8');
console.log('Fixed backslashes');

const fs = require('fs');
let code = fs.readFileSync('d:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx', 'utf-8');

code = code.replace(/(\n'A[#^']*?A\?')/g, "'-'");
code = code.replace(/^A.*A\?'/gm, "'-'");
code = code.replace(/placeholder/i, "placeholder"); // dummy

// For Edit Transaction button
code = code.replace(/{Edit Transaction}/g, 'Edit');
code = code.replace(/>\s*Edit Transaction/g, '>Edit');

// For Date formatting
if (!code.includes('const dateLabel')) {
  code = code.replace(/const isLoan = currentItemKey === 'loan-paid-member';/,
    "const dateLabel = record.date ? record.date.split('T')[0] : '-';\n  const isLoan = currentItemKey === 'loan-paid-member';"
  );
}
code = code.replace(/value=\{record\.date\}/g, 'value={dateLabel}');

// Clean up some of those specific rows:
code = code.replace(/'Aî~A+�?TA�sA,Aî~A.target...'/g, "'-'");

fs.writeFileSync('d:/OfficeProject/Bank/frontend/src/pages/transactions/member/detail.jsx', code, 'utf-8');
console.log('Fixed detail.jsx');

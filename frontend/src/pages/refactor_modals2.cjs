const fs = require('fs');
const path = require('path');

const directoriesToProcess = [
  '/mnt/data/Github/office/Bank/frontend/src/pages/transactions/employee-voucher',
  '/mnt/data/Github/office/Bank/frontend/src/pages/transactions/bank-voucher',
  '/mnt/data/Github/office/Bank/frontend/src/pages/transactions/other-voucher'
];

let changedCount = 0;

function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const modalRegex = /<Modal([^>]*?(?:open=\{editorOpen\}|title=\{)[^>]*?)>([\s\S]*?)<\/Modal>/g;
      
      let newContent = content.replace(modalRegex, (match, modalProps, modalBody) => {
        if (modalProps.includes('footer={')) return match;

        let extractedFooter = null;
        let modifiedBody = modalBody;

        const footerRegex = /<div className="[^"]*?(?:justify-end|justify-between)[^"]*?"[^>]*?>\s*(?:<Button[^>]*?>Cancel<\/Button>|<Button[^>]*?onClick=\{closeEditor\}[^>]*?>.*?Cancel.*?<\/Button>).*?<\/div>/s;

        const footerMatch = modalBody.match(footerRegex);
        if (footerMatch) {
          extractedFooter = footerMatch[0];
          modifiedBody = modalBody.replace(footerMatch[0], '');
        }

        if (extractedFooter) {
          let newProps = modalProps;
          newProps = newProps.replace(/\s*size="xl"/g, '');
          newProps = newProps.replace(/\s*width="min\(1100px,\s*96vw\)"/g, '');
          
          return `<Modal${newProps}\n        width="min(1100px, 96vw)"\n        footer={\n          ${extractedFooter.trim()}\n        }\n      >${modifiedBody}</Modal>`;
        }
        
        return match;
      });

      if (newContent !== content) {
        fs.writeFileSync(fullPath, newContent);
        console.log(`Refactored: ${fullPath}`);
        changedCount++;
      }
    }
  }
}

directoriesToProcess.forEach(processDirectory);
console.log(`Total files modified: ${changedCount}`);

const fs = require('fs');
const path = require('path');
const dir = 'd:/OfficeProject/Bank/frontend/src/pages/transactions';
const types = ['employee', 'receipt-interest', 'supporting', 'transfer-voucher'];

const deleteStr = `                {canWrite ? (
                  <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)} className="gap-2 shadow-sm rounded-[var(--radius-input,0.75rem)] font-semibold text-sm h-10 px-4">
                    <Trash2 size={16} />
                    Delete
                  </Button>
                ) : null}`;

types.forEach(type => {
  const file = path.join(dir, type, 'detail.jsx');
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes(deleteStr)) {
      content = content.replace(deleteStr, '');
      fs.writeFileSync(file, content, 'utf8');
      console.log('Removed from ' + type);
    }
  }
});

require('dotenv').config({ path: './.env' });
const { Member } = require('./models/banking.models');
const { initializeDatabase } = require('./config/postgres');
const fs = require('fs');

async function exportData() {
  await initializeDatabase();
  const allMembers = await Member.find().lean();
  const missingMembers = allMembers.filter(m => !m.membershipNo || String(m.membershipNo).trim() === '');
  
  if (missingMembers.length === 0) {
    console.log("No members missing membership number.");
    return;
  }
  
  const headers = ['code', 'name', 'fatherOrHusbandName', 'branchCode', 'membershipNo', 'mobileNo', 'status'];
  const rows = missingMembers.map(m => 
    headers.map(h => `"${String(m[h] ?? '').replace(/"/g, '""')}"`).join(',')
  );
  
  const csv = [headers.join(','), ...rows].join('\n');
  const outPath = '/home/rishabh/.gemini/antigravity-ide/brain/f7dfaa46-f0a4-45a3-8316-974c17d4b78e/scratch/members_missing_membership_no.csv';
  fs.writeFileSync(outPath, csv);
  console.log('Exported ' + missingMembers.length + ' members to ' + outPath);
}

exportData().catch(console.error).finally(() => process.exit(0));

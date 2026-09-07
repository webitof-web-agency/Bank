const mongoose = require('mongoose');

async function fixDb() {
  await mongoose.connect('mongodb://127.0.0.1:27017/bank');
  
  // Find all models dynamically just in case we don't have them imported
  const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', new mongoose.Schema({}, { strict: false }));
  
  await Voucher.updateMany(
    { branchCode: { $regex: /A[^]*A\?/ } },
    { $set: { branchCode: '-' } }
  );

  await Voucher.updateMany(
    { fyCode: { $regex: /A[^]*A\?/ } },
    { $set: { fyCode: '-' } }
  );

  // Directly fix V24006 just in case the regex doesn't catch it
  await Voucher.updateOne(
    { voucherNo: 'V24006' },
    { $set: { branchCode: '-', fyCode: '-' } }
  );

  console.log('Fixed DB!');
  process.exit(0);
}

fixDb().catch(err => {
  console.error(err);
  process.exit(1);
});

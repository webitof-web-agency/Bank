const mongoose = require('mongoose');

let connected = false;

async function connectMongo() {
  if (connected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI
    || process.env.MONGO_URL
    || 'mongodb://127.0.0.1:27017/bank_system';

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || undefined,
    autoIndex: process.env.NODE_ENV !== 'production'
  });

  connected = true;
  return mongoose.connection;
}

async function closeMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  connected = false;
}

module.exports = {
  closeMongo,
  connectMongo,
  mongoose
};

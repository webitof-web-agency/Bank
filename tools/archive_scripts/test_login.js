require('dotenv').config();
const { login, findUserByLogin } = require('./services/auth.service');

async function run() {
  try {
    const user = await findUserByLogin('admin');
    console.log("User id:", user.id);
    console.log("User _id:", user._id);
    console.log("User code:", user.code);
    await login({ identifier: 'admin', password: '12345678' });
    console.log("Login successful");
  } catch(e) {
    console.error("Login failed:", e);
  }
}
run();

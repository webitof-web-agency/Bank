require('dotenv').config();
const { login, findUserByLogin } = require('./services/auth.service');

async function run() {
  try {
    const user = await findUserByLogin('shauryakumar.889966@gmail.com');
    console.log("User id:", user?.id);
    console.log("User code:", user?.code);
    await login({ identifier: 'shauryakumar.889966@gmail.com', password: '12345678' });
    console.log("Login successful");
  } catch(e) {
    console.error("Login failed:", e);
  }
}
run();

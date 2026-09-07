const { toPaise, toRupees } = require('./money');
const assert = require('assert');

function runTests() {
  console.log("Running money utilities regression tests...");

  // Test 1: 160000 -> 160000.00 -> 16000000 paise
  assert.strictEqual(toPaise("160000"), 16000000, "160000 should be 16000000 paise");
  assert.strictEqual(toPaise(160000), 16000000, "Number 160000 should be 16000000 paise");

  // Test 2: 1600.03 -> 1600.03 -> 160003 paise
  assert.strictEqual(toPaise("1600.03"), 160003, "1600.03 should be 160003 paise");
  assert.strictEqual(toPaise(1600.03), 160003, "Number 1600.03 should be 160003 paise");

  // Test 3: 14888.50 -> 14888.50 -> 1488850 paise
  assert.strictEqual(toPaise("14888.50"), 1488850, "14888.50 should be 1488850 paise");
  assert.strictEqual(toPaise(14888.50), 1488850, "Number 14888.50 should be 1488850 paise");
  assert.strictEqual(toPaise("14888.5"), 1488850, "14888.5 should be 1488850 paise");

  // Test 4: 0.01 -> 0.01 -> 1 paise
  assert.strictEqual(toPaise("0.01"), 1, "0.01 should be 1 paise");
  assert.strictEqual(toPaise("0.10"), 10, "0.10 should be 10 paise");
  assert.strictEqual(toPaise("1.99"), 199, "1.99 should be 199 paise");

  // Test 5: Rejections
  let failed = false;
  try { toPaise("-100"); } catch (e) { failed = true; }
  assert.strictEqual(failed, true, "Negative values should be rejected");

  failed = false;
  try { toPaise("1600.003"); } catch (e) { failed = true; }
  assert.strictEqual(failed, true, "3 decimal places should be rejected");
  
  failed = false;
  try { toPaise("1600.999"); } catch (e) { failed = true; }
  assert.strictEqual(failed, true, "3 decimal places should be rejected");
  
  failed = false;
  try { toPaise("abc"); } catch (e) { failed = true; }
  assert.strictEqual(failed, true, "Letters should be rejected");

  // Test 6: Comma separated
  assert.strictEqual(toPaise("1,60,000.03"), 16000003, "1,60,000.03 should be 16000003 paise");
  assert.strictEqual(toPaise("160,000.03"), 16000003, "160,000.03 should be 16000003 paise");

  // Asserts requested specifically:
  // 160000 must never become 1600.00 (i.e. 160000 paise)
  assert.notStrictEqual(toPaise("160000"), 160000, "160000 should not be 160000 paise (i.e. 1600.00)");
  // 1600.03 must never become 160003.00 rupees (i.e. 16000300 paise)
  assert.notStrictEqual(toPaise("1600.03"), 16000300, "1600.03 should not be 16000300 paise (i.e. 160003.00)");

  console.log("All regression tests passed successfully.");
}

runTests();

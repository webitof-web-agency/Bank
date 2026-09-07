/**
 * Parses any numeric value (string, float, int) into integer paise (cents)
 * to avoid floating point precision issues.
 * Rejects negative values, NaN, and values with more than 2 decimal places.
 */
function toPaise(value) {
  if (value == null || value === '') return 0;

  // Convert to string and clean commas and spaces
  let str = String(value).trim().replace(/,/g, '');
  if (str === '') return 0;

  const parsed = Number(str);
  if (Number.isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid money amount: ${value}`);
  }

  // Check for decimal places > 2
  const parts = str.split('.');
  if (parts.length > 1 && parts[1].length > 2) {
    throw new Error(`Amount cannot have more than 2 decimal places: ${value}`);
  }

  let whole = parts[0] || '0';
  let decimal = parts[1] || '00';
  if (decimal.length === 1) decimal += '0';

  const wholeNum = parseInt(whole, 10);
  const decNum = parseInt(decimal, 10);

  return wholeNum * 100 + decNum;
}

/**
 * Converts integer paise back to standard rupees (floating point / DB numeric).
 */
function toRupees(paise) {
  if (paise == null) return 0;
  return Number((Math.round(paise) / 100).toFixed(2));
}

module.exports = {
  toPaise,
  toRupees
};

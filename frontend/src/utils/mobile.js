// Shared mobile-number rules for the app (members + employees), mirroring the
// backend's backend/utils/mobile.js. The member app logs in by mobile, so every
// form collapses +91 / 0091 / leading-0 / spaces to the bare 10-digit number.
export function normalizeMobile(value = '') {
  let digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function isValidMobile(value = '') {
  return /^[6-9]\d{9}$/.test(normalizeMobile(value));
}

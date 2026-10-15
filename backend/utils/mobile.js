'use strict';

// Member/employee mobile numbers come in many shapes from the legacy data and
// from data-entry: "9144271063", "09144271063", "+91 9144271063",
// "0091-9144271063", "91 91442 71063". The member portal logs in by mobile, so
// everything must collapse to one canonical form: the bare 10-digit number.
//
// normalizeMobile strips spaces/punctuation and the Indian country code (+91 /
// 0091 / 91) and a single trunk "0", then returns the remaining digits.
// It does not validate — an unrecognisable value comes back as its digits so
// the caller can decide; use isValidMobile for the 10-digit check.
function normalizeMobile(value = '') {
  let digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

// A valid Indian mobile: exactly 10 digits, first digit 6-9.
function isValidMobile(value = '') {
  return /^[6-9]\d{9}$/.test(normalizeMobile(value));
}

module.exports = { normalizeMobile, isValidMobile };

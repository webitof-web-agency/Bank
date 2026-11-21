import test from 'node:test';
import assert from 'node:assert/strict';
import { toPhoneInputValue } from '../src/utils/mobile.js';

// The forms keep what the phone box emits as "+<digits>" and feed it back
// through toPhoneInputValue. That round trip must not change the digits, or
// backspace / retyping keeps re-adding "91".
const roundTrip = (digits) => toPhoneInputValue(digits ? `+${digits}` : '');

test('a bare stored mobile gets the 91 country code', () => {
  assert.equal(toPhoneInputValue('9425526729'), '919425526729');
  assert.equal(toPhoneInputValue('09425526729'), '919425526729');
  assert.equal(toPhoneInputValue('+919425526729'), '919425526729');
  assert.equal(toPhoneInputValue(''), '');
  assert.equal(toPhoneInputValue(null), '');
});

test('backspacing every digit never re-adds 91', () => {
  let shown = toPhoneInputValue('9191919191'); // 919191919191
  while (shown.length > 2) {
    const typed = shown.slice(0, -1); // one backspace
    shown = roundTrip(typed);
    assert.equal(shown, typed, `after backspace to ${typed}`);
  }
});

test('typing a new number digit by digit keeps exactly what was typed', () => {
  let shown = '91';
  for (const digit of '9876543210') {
    const typed = shown + digit;
    shown = roundTrip(typed);
    assert.equal(shown, typed);
  }
  assert.equal(shown, '919876543210');
});

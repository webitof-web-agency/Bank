import { useRef } from 'react';
import PhoneInput from 'react-phone-input-2';
import { normalizeMobile, toPhoneInputValue } from '../../utils/mobile';

// Mobile-number box shared by the member, employee and profile forms.
// `value` is what the form stores ("9425526729" or "+919425526729");
// `onChange` gets "+<country code><number>" (or '' when emptied).
//
// The "+91" prefix is locked (countryCodeEditable={false}): the library
// ignores any edit that would change it. So with the whole box selected the
// first typed digit — or a whole paste — was dropped. The handlers below move
// the selection past the prefix first, so select-all + type / paste replaces
// just the number.
export function PhoneNumberInput({ value, onChange, name = 'mobileNo', placeholder = '9876543210', disabled = false }) {
  const dialCodeRef = useRef('91');

  const prefixEnd = (text) => {
    const prefix = `+${dialCodeRef.current}`;
    if (!text.startsWith(prefix)) return 0;
    return prefix.length + (text.charAt(prefix.length) === ' ' ? 1 : 0);
  };

  const handleKeyDown = (event) => {
    const el = event.target;
    const min = prefixEnd(el.value);
    const { selectionStart: start, selectionEnd: end } = el;
    if (!min || start == null || start >= min) return;
    const typing = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    const deletingSelection = (event.key === 'Backspace' || event.key === 'Delete') && end > start;
    if (!typing && !deletingSelection) return;
    el.setSelectionRange(min, Math.max(end, min));
  };

  // Paste is applied here: a pasted "+91 98765 43210" / "09876543210" that
  // replaces the whole number is cut down to its 10 digits instead of being
  // appended after the locked "+91".
  const handlePaste = (event) => {
    const el = event.target;
    const min = prefixEnd(el.value);
    if (!min) return;
    event.preventDefault();
    const start = Math.max(el.selectionStart ?? el.value.length, min);
    const end = Math.max(el.selectionEnd ?? el.value.length, min);
    const before = el.value.slice(min, start).replace(/\D/g, '');
    const after = el.value.slice(end).replace(/\D/g, '');
    const pasted = event.clipboardData?.getData('text') || '';
    const replacingAll = !before && !after;
    const pastedDigits = replacingAll && dialCodeRef.current === '91' ? normalizeMobile(pasted) : pasted.replace(/\D/g, '');
    const national = `${before}${pastedDigits}${after}`;
    onChange(national ? `+${dialCodeRef.current}${national}` : '');
  };

  return (
    <PhoneInput
      country="in"
      preferredCountries={['in']}
      enableSearch
      countryCodeEditable={false}
      placeholder={placeholder}
      disabled={disabled}
      value={toPhoneInputValue(value)}
      onChange={(nextValue, country) => {
        if (country?.dialCode) dialCodeRef.current = country.dialCode;
        onChange(nextValue ? `+${nextValue}` : '');
      }}
      onKeyDown={handleKeyDown}
      containerClass="employee-phone-input"
      inputClass="!h-[42px] !w-full !rounded-[var(--radius-input,0.75rem)] !border-slate-200 focus:!border-[var(--primary)] focus:!ring-1 focus:!ring-[var(--primary)]"
      buttonClass="!border-r !border-slate-200 !rounded-l-[var(--radius-input,0.75rem)] !bg-slate-50"
      dropdownClass="!z-50"
      inputProps={{ name, onPaste: handlePaste }}
    />
  );
}

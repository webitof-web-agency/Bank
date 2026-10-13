// Member / employee category: one of these codes (same list as the backend's
// utils/socialCategory.js). Legacy spellings ("O.B.C.", "S.T.") map onto them.
export const SOCIAL_CATEGORY_OPTIONS = [
  { value: 'GENERAL', label: 'General' },
  { value: 'OBC', label: 'OBC' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' }
];

const ALIASES = { GEN: 'GENERAL', GENERAL: 'GENERAL', OBC: 'OBC', SC: 'SC', ST: 'ST' };

export function normalizeSocialCategory(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return ALIASES[text.toUpperCase().replace(/[^A-Z]/g, '')] || text;
}

// The options, plus a record's own value when it is not one of them (so an
// unexpected legacy value still shows and is kept until changed).
export function socialCategoryOptions(current = '') {
  const value = normalizeSocialCategory(current);
  return value && !SOCIAL_CATEGORY_OPTIONS.some((option) => option.value === value)
    ? [...SOCIAL_CATEGORY_OPTIONS, { value, label: value }]
    : SOCIAL_CATEGORY_OPTIONS;
}

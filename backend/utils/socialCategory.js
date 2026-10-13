// Member / employee category (caste category), stored as one of these codes.
// Legacy data spells them "O.B.C", "O.B.C.", "S.C.", "S.T.", "GENERAL".
const SOCIAL_CATEGORIES = ['GENERAL', 'OBC', 'SC', 'ST'];

const ALIASES = { GEN: 'GENERAL', GENERAL: 'GENERAL', OBC: 'OBC', SC: 'SC', ST: 'ST' };

// "O.B.C." -> "OBC", "general" -> "GENERAL"; anything else is kept as typed
// (trimmed), so an unexpected legacy value is never lost.
function normalizeSocialCategory(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return ALIASES[text.toUpperCase().replace(/[^A-Z]/g, '')] || text;
}

module.exports = { SOCIAL_CATEGORIES, normalizeSocialCategory };

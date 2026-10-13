// Rejects query/body keys that could act as query operators in the in-memory
// filter layer (utils/sql-model.js: $ne, $regex, $or...) or pollute object
// prototypes (__proto__, constructor, prototype). No form field is named so.
const UNSAFE_KEY = /^\$|^(__proto__|constructor|prototype)$/;
const MAX_DEPTH = 20;

function findUnsafeKey(value, depth = 0) {
  if (!value || typeof value !== 'object') return '';
  if (depth > MAX_DEPTH) return '(nesting too deep)';
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEY.test(key)) return key;
    const nested = findUnsafeKey(value[key], depth + 1);
    if (nested) return nested;
  }
  return '';
}

function rejectUnsafeKeys(req, res, next) {
  const key = findUnsafeKey(req.query) || findUnsafeKey(req.body);
  if (key) {
    return res.status(400).json({ success: false, message: `Invalid request field: ${key.slice(0, 40)}` });
  }
  return next();
}

module.exports = { findUnsafeKey, rejectUnsafeKeys };

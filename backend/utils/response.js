function toResponse(doc) {
  if (!doc) return null;

  if (typeof doc.toJSON === 'function') {
    return doc.toJSON();
  }

  if (typeof doc.toObject === 'function') {
    return doc.toObject();
  }

  const plain = { ...doc };
  if (plain._id && !plain.id) {
    plain.id = String(plain._id);
  }
  if (plain.id && !plain._id) {
    plain._id = String(plain.id);
  }
  delete plain.__v;
  return plain;
}

module.exports = {
  toResponse
};

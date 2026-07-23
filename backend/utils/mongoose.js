function toResponse(doc) {
  if (!doc) return null;

  if (typeof doc.toJSON === 'function') {
    return doc.toJSON();
  }

  const plain = { ...doc };
  if (plain._id && !plain.id) {
    plain.id = String(plain._id);
  }
  delete plain._id;
  delete plain.__v;
  return plain;
}

function schemaOptions() {
  return {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  };
}

module.exports = {
  schemaOptions,
  toResponse
};

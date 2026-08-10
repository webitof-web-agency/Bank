const { randomUUID } = require('crypto');
const {
  deleteMainRow,
  getCachedRows,
  getUserRoles,
  getUserRolesForUsers,
  initializeDatabase,
  persistMainRow,
  replaceUserRoles
} = require('../config/postgres');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toIsoDate(value) {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function cleanFields(fields = '') {
  if (Array.isArray(fields)) {
    return fields.map((field) => String(field || '').trim()).filter(Boolean);
  }

  return String(fields || '')
    .split(/\s+/)
    .map((field) => field.trim())
    .filter(Boolean);
}

function getPath(value, pathExpression) {
  if (!pathExpression) return value;
  return String(pathExpression)
    .split('.')
    .reduce((acc, key) => (acc == null ? acc : acc[key]), value);
}

function normalizeComparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value == null) return null;

  const asDate = new Date(value);
  if (String(value).length >= 10 && !Number.isNaN(asDate.getTime())) {
    return asDate.getTime();
  }

  return String(value).toLowerCase();
}

function compareValues(left, right) {
  const a = normalizeComparable(left);
  const b = normalizeComparable(right);

  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function matchesCondition(value, condition) {
  if (condition instanceof RegExp) {
    return condition.test(String(value ?? ''));
  }

  if (isPlainObject(condition)) {
    const keys = Object.keys(condition);
    const operatorKeys = keys.filter((key) => key.startsWith('$'));

    if (!operatorKeys.length) {
      if (isPlainObject(value)) {
        return matchesFilter(value, condition);
      }
      return compareValues(value, condition) === 0;
    }

    for (const key of operatorKeys) {
      const expected = condition[key];
      if (key === '$ne') {
        if (compareValues(value, expected) === 0) return false;
        continue;
      }
      if (key === '$in') {
        const list = Array.isArray(expected) ? expected : [];
        if (!list.some((item) => compareValues(value, item) === 0)) return false;
        continue;
      }
      if (key === '$gte') {
        if (compareValues(value, expected) < 0) return false;
        continue;
      }
      if (key === '$lte') {
        if (compareValues(value, expected) > 0) return false;
        continue;
      }
      if (key === '$gt') {
        if (compareValues(value, expected) <= 0) return false;
        continue;
      }
      if (key === '$lt') {
        if (compareValues(value, expected) >= 0) return false;
        continue;
      }
      if (key === '$regex') {
        const regex = expected instanceof RegExp
          ? expected
          : new RegExp(String(expected || ''), String(condition.$options || ''));
        if (!regex.test(String(value ?? ''))) return false;
        continue;
      }
      if (key === '$exists') {
        const exists = value !== undefined && value !== null;
        if (Boolean(expected) !== exists) return false;
      }
    }

    return true;
  }

  return compareValues(value, condition) === 0;
}

function matchesFilter(doc, filter = {}) {
  if (!filter || !Object.keys(filter).length) {
    return true;
  }

  for (const [key, condition] of Object.entries(filter)) {
    if (key === '$or') {
      const clauses = Array.isArray(condition) ? condition : [];
      if (!clauses.some((clause) => matchesFilter(doc, clause))) {
        return false;
      }
      continue;
    }

    if (key === '$and') {
      const clauses = Array.isArray(condition) ? condition : [];
      if (!clauses.every((clause) => matchesFilter(doc, clause))) {
        return false;
      }
      continue;
    }

    const value = getPath(doc, key);
    if (!matchesCondition(value, condition)) {
      return false;
    }
  }

  return true;
}

function sortDocuments(rows, sortSpec = null) {
  if (!sortSpec) {
    return rows;
  }

  const entries = Array.isArray(sortSpec)
    ? sortSpec.map(([field, direction]) => [field, Number(direction) >= 0 ? 1 : -1])
    : Object.entries(sortSpec).map(([field, direction]) => [field, Number(direction) >= 0 ? 1 : -1]);

  if (!entries.length) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const [field, direction] of entries) {
      const comparison = compareValues(getPath(left, field), getPath(right, field));
      if (comparison !== 0) {
        return comparison * direction;
      }
    }
    return 0;
  });
}

function applySelect(doc, selectSpec) {
  if (!selectSpec) {
    return clone(doc);
  }

  const fields = cleanFields(selectSpec);
  if (!fields.length) {
    return clone(doc);
  }

  const include = new Set(fields.filter((field) => !field.startsWith('-')).map((field) => field.replace(/^\+/, '')));
  const exclude = new Set(fields.filter((field) => field.startsWith('-')).map((field) => field.slice(1)));

  if (!include.size) {
    const output = clone(doc);
    for (const field of exclude) {
      delete output[field];
      delete output[`_${field}`];
    }
    return output;
  }

  const output = {};
  for (const field of include) {
    if (field in doc) {
      output[field] = clone(doc[field]);
    }
  }

  if (doc._id !== undefined) {
    output._id = clone(doc._id);
  }
  if (doc.id !== undefined) {
    output.id = clone(doc.id);
  }

  return output;
}

function createUpdatePatch(update = {}) {
  if (!isPlainObject(update)) {
    return {};
  }

  if ('$set' in update || '$setOnInsert' in update || '$unset' in update) {
    return {
      set: isPlainObject(update.$set) ? update.$set : {},
      setOnInsert: isPlainObject(update.$setOnInsert) ? update.$setOnInsert : {},
      unset: isPlainObject(update.$unset) ? update.$unset : {}
    };
  }

  return {
    set: update,
    setOnInsert: {},
    unset: {}
  };
}

function stripInternalFields(value) {
  const output = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (key === '__v') continue;
    if (key === '_model' || key === '_data') continue;
    output[key] = item;
  }
  return output;
}

class SqlDocument {
  constructor(model, data = {}) {
    Object.defineProperty(this, '_model', {
      value: model,
      enumerable: false,
      writable: true
    });
    this._assign(data);
  }

  _assign(data = {}) {
    for (const key of Object.keys(this)) {
      if (!key.startsWith('_')) {
        delete this[key];
      }
    }

    const payload = clone(data) || {};
    for (const [key, value] of Object.entries(payload)) {
      this[key] = value;
    }

    if (this._id == null && this.id != null) {
      this._id = this.id;
    }
    if (this.id == null && this._id != null) {
      this.id = this._id;
    }
  }

  set(patch = {}) {
    Object.assign(this, clone(patch) || {});
    return this;
  }

  markModified() {
    return this;
  }

  async save() {
    const saved = await this._model._saveDocument(this);
    this._assign(saved);
    return this;
  }

  async deleteOne() {
    return this._model.deleteById(this._id);
  }

  async populate(spec) {
    const populated = await this._model._populateDocument(this.toObject(), spec);
    this._assign(populated);
    return this;
  }

  toObject() {
    const plain = {};
    for (const [key, value] of Object.entries(this)) {
      plain[key] = clone(value);
    }
    return stripInternalFields(plain);
  }

  toJSON() {
    return this.toObject();
  }
}

class SqlQuery {
  constructor(model, op, filter = {}, extra = {}) {
    this.model = model;
    this.op = op;
    this.filter = filter || {};
    this.extra = extra || {};
    this._sort = null;
    this._skip = 0;
    this._limit = null;
    this._select = null;
    this._populate = [];
    this._lean = false;
  }

  sort(spec) {
    this._sort = spec;
    return this;
  }

  skip(value) {
    this._skip = Math.max(0, Number(value || 0));
    return this;
  }

  limit(value) {
    const limit = Number(value);
    this._limit = Number.isFinite(limit) ? Math.max(0, limit) : null;
    return this;
  }

  select(spec) {
    this._select = spec;
    return this;
  }

  populate(spec) {
    if (spec) {
      this._populate.push(spec);
    }
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    return this.model._executeQuery({
      extra: this.extra,
      filter: this.filter,
      lean: this._lean,
      limit: this._limit,
      op: this.op,
      populate: this._populate,
      select: this._select,
      skip: this._skip,
      sort: this._sort
    });
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

function createSqlModel(tableName, options = {}) {
  const schemaSource = options.schema || { fields: options.columns || {}, uniqueFields: options.uniqueFields || [] };
  const schemaFields = schemaSource.fields || {};
  const fieldEntries = Object.entries(schemaFields).map(([field, definition]) => [field, typeof definition === 'string' ? { type: definition } : { ...(definition || {}) }]);
  const fieldNames = new Set(fieldEntries.map(([field]) => field));
  const uniqueFields = Array.isArray(options.uniqueFields) && options.uniqueFields.length ? options.uniqueFields : Array.isArray(schemaSource.uniqueFields) ? schemaSource.uniqueFields : [];
  const omitFields = new Set(options.omitFields || []);
  const afterHydrate = typeof options.afterHydrate === 'function' ? options.afterHydrate : null;
  const beforeSave = typeof options.beforeSave === 'function' ? options.beforeSave : null;
  const afterSave = typeof options.afterSave === 'function' ? options.afterSave : null;
  const beforeCreate = typeof options.beforeCreate === 'function' ? options.beforeCreate : null;
  const customPopulate = typeof options.populate === 'function' ? options.populate : null;

  function getDefinition(field) {
    return schemaFields[field] ? (typeof schemaFields[field] === 'string' ? { type: schemaFields[field] } : schemaFields[field]) : null;
  }

  function toBool(value) {
    if (value === true || value === false) return value;
    if (value == null) return false;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    return !(text === '' || text === '0' || text === 'false' || text === 'no' || text === 'off' || text === 'null' || text === 'undefined');
  }

  function toDocValue(field, value) {
    const definition = getDefinition(field);
    const type = String(definition?.type || 'string').toLowerCase();

    if (value == null || value === '') {
      return type === 'boolean' ? false : null;
    }

    switch (type) {
      case 'boolean':
        return toBool(value);
      case 'number': {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      }
      case 'date':
        return toIsoDate(value);
      case 'json':
        if (typeof value !== 'string') {
          return clone(value);
        }
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      case 'text':
      case 'string':
      default:
        return String(value);
    }
  }

  function toDbValue(field, value) {
    const definition = getDefinition(field);
    const type = String(definition?.type || 'string').toLowerCase();

    if (value == null || value === '') {
      return type === 'boolean' ? 0 : null;
    }

    switch (type) {
      case 'boolean':
        return toBool(value) ? 1 : 0;
      case 'number': {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      }
      case 'date':
        return toIsoDate(value);
      case 'json':
        return typeof value === 'string' ? value : JSON.stringify(value);
      case 'text':
      case 'string':
      default:
        return String(value);
    }
  }

  function rowToData(row) {
    if (!row) return null;

    const doc = {};
    for (const [field] of fieldEntries) {
      doc[field] = toDocValue(field, row[field]);
    }

    doc.id = String(row.id);
    doc._id = String(row.id);
    doc.createdAt = row.createdAt || null;
    doc.updatedAt = row.updatedAt || null;

    if (afterHydrate) {
      const transformed = afterHydrate(doc);
      return transformed == null ? doc : transformed;
    }

    return doc;
  }

  function toStoredPayload(doc = {}) {
    const payload = {};
    for (const [field] of fieldEntries) {
      if (doc[field] !== undefined) {
        payload[field] = clone(doc[field]);
      }
    }
    return payload;
  }

  function dataToRow(doc = {}) {
    const payload = clone(doc) || {};
    const now = new Date().toISOString();
    const id = String(payload.id || payload._id || randomUUID());
    const createdAt = payload.createdAt ? toIsoDate(payload.createdAt) : now;
    const updatedAt = now;
    const stored = toStoredPayload(payload);

    const row = {
      createdAt,
      id,
      updatedAt
    };

    for (const [field, definition] of fieldEntries) {
      const current = stored[field];
      if (current === undefined) {
        row[field] = definition.type === 'boolean' ? 0 : null;
        continue;
      }
      row[field] = toDbValue(field, current);
    }

    return row;
  }
  function findAllRows() {
    return getCachedRows(tableName).map(rowToData).filter(Boolean);
  }

  function getAllRawRows() {
    return getCachedRows(tableName);
  }

  function hydrateMany(rows) {
    return rows.map((row) => new SqlDocument(model, row));
  }

  function applyPopulateToRecord(record, specs) {
    if (!specs.length) {
      return record;
    }

    let next = clone(record);
    for (const spec of specs) {
      if (customPopulate) {
        const populated = customPopulate(next, spec);
        if (populated !== undefined) {
          next = populated;
          continue;
        }
      }
    }
    return next;
  }

  function buildSelectResult(record, selectSpec) {
    if (!selectSpec) return record;
    return applySelect(record, selectSpec);
  }

  async function populateRecord(record, spec) {
    if (!spec) return record;

    const populated = await model._populateDocument(record, spec);
    if (populated !== undefined) {
      return populated;
    }

    if (customPopulate) {
      const custom = await customPopulate(record, spec, model);
      if (custom !== undefined) {
        return custom;
      }
    }

    return record;
  }

  async function populateRecords(records, specs) {
    let result = records;
    for (const spec of specs) {
      result = await Promise.all(result.map((record) => populateRecord(record, spec)));
    }
    return result;
  }

  async function executeQuery(query) {
    await initializeDatabase();
    const rawRows = findAllRows();
    let rows = rawRows.filter((row) => matchesFilter(row, query.filter));
    rows = sortDocuments(rows, query.sort);

    const op = query.op;
    if (op === 'findOne' || op === 'findById') {
      rows = rows.slice(0, 1);
    } else if (op === 'countDocuments') {
      return rows.length;
    }

    if (query.skip) {
      rows = rows.slice(query.skip);
    }
    if (query.limit != null && op !== 'countDocuments') {
      rows = rows.slice(0, query.limit);
    }

    if (op === 'findOneAndDelete' || op === 'findByIdAndDelete') {
      const target = rows[0] || null;
      if (!target) return null;
      await deleteById(target.id);
      const output = query.lean ? clone(target) : new SqlDocument(model, target);
      return query.select ? applySelect(output.toObject ? output.toObject() : output, query.select) : output;
    }

    if (op === 'findOneAndUpdate' || op === 'findByIdAndUpdate') {
      const target = rows[0] || null;
      if (!target && !query.extra?.upsert) {
        return null;
      }

      let updated;
      if (!target) {
        const merged = { ...(query.extra.filterDoc || {}), ...(query.extra.setOnInsert || {}), ...(query.extra.set || {}) };
        updated = await create(merged);
      } else {
        updated = await updateById(target.id, query.extra.set || {});
      }

      const returnUpdated = Boolean(query.extra?.new);
      const record = returnUpdated ? updated : target;
      if (!record) return null;
      const finalRecord = query.lean ? record.toObject ? record.toObject() : clone(record) : record;
      return query.select ? applySelect(finalRecord.toObject ? finalRecord.toObject() : finalRecord, query.select) : finalRecord;
    }

    const records = rows.map((row) => new SqlDocument(model, row));
    const populated = query.populate.length ? await populateRecords(records, query.populate) : records;
    const shaped = populated.map((record) => (query.lean ? record.toObject() : record));
    const selected = query.select ? shaped.map((record) => applySelect(record.toObject ? record.toObject() : record, query.select)) : shaped;

    if (op === 'findOne' || op === 'findById') {
      return selected[0] || null;
    }

    return selected;
  }

  function assertUnique(doc, ignoreId = null) {
    if (!uniqueFields.length) {
      return;
    }

    const rows = findAllRows();
    for (const rule of uniqueFields) {
      const fields = Array.isArray(rule) ? rule : [rule];
      const conflict = rows.find((row) => {
        if (ignoreId && String(row.id) === String(ignoreId)) {
          return false;
        }
        return fields.every((field) => compareValues(getPath(row, field), getPath(doc, field)) === 0);
      });
      if (conflict) {
        const error = new Error(`Unique constraint failed on ${fields.join(', ')}`);
        error.code = 11000;
        error.dbCode = 'ER_DUP_ENTRY';
        error.statusCode = 409;
        throw error;
      }
    }
  }

  async function syncUserRolesIfNeeded(doc) {
    if (tableName !== 'users') {
      return;
    }

    const userId = String(doc.id || doc._id);
    const roleIds = Array.isArray(doc.roles) ? doc.roles.map((value) => String(value)).filter(Boolean) : [];
    await replaceUserRoles(userId, roleIds);
  }

  function loadRolesForUser(userId) {
    if (tableName !== 'users') {
      return [];
    }
    return getUserRoles(userId);
  }

  function applyExistingRoles(doc, existingId) {
    if (tableName !== 'users') {
      return doc;
    }

    if (Array.isArray(doc.roles)) {
      return doc;
    }

    doc.roles = existingId ? loadRolesForUser(existingId) : [];
    return doc;
  }

  async function create(data = {}) {
    await initializeDatabase();
    const doc = clone(data) || {};
    if (beforeCreate) {
      await beforeCreate(doc);
    }
    const row = dataToRow(doc);
    assertUnique(doc);
    await persistMainRow(tableName, row);
    const saved = rowToData({ ...row });
    await syncUserRolesIfNeeded({ ...doc, id: saved.id, _id: saved._id });
    if (afterSave) {
      await afterSave(saved, { isCreate: true });
    }
    return new SqlDocument(model, saved);
  }

  async function insertMany(docs = []) {
    const created = [];
    for (const doc of docs) {
      created.push(await create(doc));
    }
    return created;
  }

  function mergeUpdate(target, update) {
    const patch = createUpdatePatch(update);
    const merged = clone(target) || {};
    for (const [key, value] of Object.entries(patch.setOnInsert || {})) {
      if (merged[key] === undefined) {
        merged[key] = clone(value);
      }
    }
    for (const [key, value] of Object.entries(patch.set || {})) {
      merged[key] = clone(value);
    }
    for (const key of Object.keys(patch.unset || {})) {
      delete merged[key];
    }
    return merged;
  }

  async function updateById(id, patch = {}) {
    await initializeDatabase();
    const rows = findAllRows();
    const target = rows.find((row) => String(row.id) === String(id));
    if (!target) {
      return null;
    }

    const nextDoc = mergeUpdate(target, { $set: patch });
    nextDoc.id = target.id;
    nextDoc.createdAt = target.createdAt;
    nextDoc.updatedAt = new Date().toISOString();
    applyExistingRoles(nextDoc, target.id);
    assertUnique(nextDoc, target.id);
    await persistMainRow(tableName, dataToRow(nextDoc));
    await syncUserRolesIfNeeded(nextDoc);
    if (afterSave) {
      await afterSave(nextDoc, { isCreate: false, previous: target });
    }
    return new SqlDocument(model, nextDoc);
  }

  async function updateOne(filter = {}, update = {}, options = {}) {
    await initializeDatabase();
    const rows = findAllRows();
    const target = rows.find((row) => matchesFilter(row, filter));
    if (!target) {
      if (options.upsert) {
        const doc = mergeUpdate({}, update);
        Object.assign(doc, filter && isPlainObject(filter) ? filter : {});
        if (doc.id == null && doc._id == null) {
          doc.id = randomUUID();
        }
        const created = await create(doc);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: created.id };
      }
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    const nextDoc = mergeUpdate(target, update);
    nextDoc.id = target.id;
    nextDoc.createdAt = target.createdAt;
    nextDoc.updatedAt = new Date().toISOString();
    applyExistingRoles(nextDoc, target.id);
    assertUnique(nextDoc, target.id);
    await persistMainRow(tableName, dataToRow(nextDoc));
    await syncUserRolesIfNeeded(nextDoc);
    if (afterSave) {
      await afterSave(nextDoc, { isCreate: false, previous: target });
    }
    return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  }

  async function updateMany(filter = {}, update = {}) {
    const rows = findAllRows().filter((row) => matchesFilter(row, filter));
    let modifiedCount = 0;
    for (const row of rows) {
      await updateById(row.id, update.$set || update);
      modifiedCount += 1;
    }
    return { matchedCount: rows.length, modifiedCount };
  }

  async function deleteById(id) {
    await initializeDatabase();
    const row = findAllRows().find((item) => String(item.id) === String(id));
    if (!row) return false;
    await deleteMainRow(tableName, String(id));
    return true;
  }

  async function deleteOne(filter = {}) {
    const row = findAllRows().find((item) => matchesFilter(item, filter));
    if (!row) return { deletedCount: 0 };
    await deleteById(row.id);
    return { deletedCount: 1 };
  }

  async function deleteMany(filter = {}) {
    const rows = findAllRows().filter((item) => matchesFilter(item, filter));
    for (const row of rows) {
      await deleteById(row.id);
    }
    return { deletedCount: rows.length };
  }

  async function findRolesForUsers(userIds = []) {
    if (tableName !== 'users') {
      return new Map();
    }
    await initializeDatabase();
    return getUserRolesForUsers(userIds);
  }

  const model = {
    _tableName: tableName,
    _loadRolesForUser: loadRolesForUser,
    _findRolesForUsers: findRolesForUsers,
    _getAllRows: findAllRows,
    _executeQuery: executeQuery,
    _hydrate: (row) => new SqlDocument(model, row),
    _populateDocument: async (record, spec) => {
      if (!spec) return record;

      if (tableName === 'users' && spec.path === 'roles') {
        const Role = require('../models/role.model');
        const roleIds = Array.isArray(record.roles) && record.roles.length ? record.roles.map((value) => String(value)) : loadRolesForUser(record.id || record._id);
        const populatedRoles = [];
        for (const roleId of roleIds) {
          const role = await Role.findById(roleId).lean();
          if (role) {
            populatedRoles.push(role);
          }
        }

        if (spec.select) {
          record.roles = populatedRoles.map((role) => applySelect(role, spec.select));
        } else {
          record.roles = populatedRoles;
        }
        return record;
      }

      return customPopulate ? customPopulate(record, spec, model) ?? record : record;
    },
    _saveDocument: async (doc) => {
      await initializeDatabase();
      const payload = clone(doc) || {};
      const id = String(payload._id || payload.id || randomUUID());
      const rows = findAllRows();
      const existing = rows.find((row) => String(row.id) === String(id));
      if (existing) {
        const next = { ...existing, ...payload, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
        applyExistingRoles(next, id);
        assertUnique(next, id);
        await persistMainRow(tableName, dataToRow(next));
        await syncUserRolesIfNeeded(next);
        if (afterSave) {
          await afterSave(next, { isCreate: false, previous: existing });
        }
        return next;
      }

      const created = await create(payload);
      return created.toObject();
    },
    aggregate: () => {
      throw new Error(`aggregate() is not implemented for ${tableName}`);
    },
    countDocuments: async (filter = {}) => {
      await initializeDatabase();
      return findAllRows().filter((row) => matchesFilter(row, filter)).length;
    },
    create,
    deleteById,
    deleteOne,
    deleteMany,
    find(filter = {}) {
      return new SqlQuery(model, 'find', filter);
    },
    findById(id) {
      return new SqlQuery(model, 'findById', { id });
    },
    findByIdAndDelete(id) {
      return new SqlQuery(model, 'findByIdAndDelete', { id });
    },
    findByIdAndUpdate(id, update, options = {}) {
      return new SqlQuery(model, 'findByIdAndUpdate', { id }, { ...options, set: createUpdatePatch(update).set, setOnInsert: createUpdatePatch(update).setOnInsert, filterDoc: { id } });
    },
    findOne(filter = {}) {
      return new SqlQuery(model, 'findOne', filter);
    },
    findOneAndDelete(filter = {}) {
      return new SqlQuery(model, 'findOneAndDelete', filter);
    },
    findOneAndUpdate(filter = {}, update = {}, options = {}) {
      const patch = createUpdatePatch(update);
      return new SqlQuery(model, 'findOneAndUpdate', filter, {
        ...options,
        filterDoc: filter,
        set: patch.set,
        setOnInsert: patch.setOnInsert,
        unset: patch.unset
      });
    },
    insertMany,
    updateMany,
    updateOne,
    upsert: async (filter, update) => updateOne(filter, update, { upsert: true }),
    exec: executeQuery,
    all: () => findAllRows(),
    raw: getAllRawRows,
    modelName: options.modelName || tableName,
    tableName,
    toDocument: (row) => new SqlDocument(model, row),
    uniqueFields
  };

  return model;
}

module.exports = {
  SqlDocument,
  SqlQuery,
  applySelect,
  clone,
  compareValues,
  createSqlModel,
  matchesFilter,
  sortDocuments,
  toIsoDate
};




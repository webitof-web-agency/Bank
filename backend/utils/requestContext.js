const { AsyncLocalStorage } = require('node:async_hooks');

// Carries the current request's actor (logged-in user id) down to the
// low-level DB write layer (config/postgres.js) for audit-log attribution,
// without threading an actor parameter through every service function.
const storage = new AsyncLocalStorage();

function runWithActor(userId, fn) {
  return storage.run({ actorUserId: userId || null }, fn);
}

function getCurrentActorId() {
  const store = storage.getStore();
  return store ? store.actorUserId : null;
}

module.exports = {
  runWithActor,
  getCurrentActorId
};

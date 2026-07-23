import { clone, findById, removeById } from './utils/helpers.js';
import { saveAllState } from './storage.js';

let appState = null;

export function setState(nextState, persist = true) {
  appState = clone(nextState);
  if (persist) saveAllState(appState);
  return getState();
}

export function getState() {
  return appState;
}

export function updateState(mutator) {
  const draft = clone(appState);
  mutator(draft);
  return setState(draft);
}

export function getCollection(collectionName) {
  return appState?.[collectionName] || [];
}

export function getItem(collectionName, id) {
  return findById(getCollection(collectionName), id);
}

export function addItem(collectionName, item) {
  return updateState((draft) => {
    draft[collectionName] = [...(draft[collectionName] || []), item];
  });
}

export function updateItem(collectionName, id, patch) {
  return updateState((draft) => {
    draft[collectionName] = (draft[collectionName] || []).map((item) => (
      String(item.id) === String(id) ? { ...item, ...patch } : item
    ));
  });
}

export function deleteItem(collectionName, id) {
  return updateState((draft) => {
    draft[collectionName] = removeById(draft[collectionName] || [], id);
  });
}

export function replaceCollection(collectionName, items) {
  return updateState((draft) => {
    draft[collectionName] = items;
  });
}

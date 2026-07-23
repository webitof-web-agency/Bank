import { APP_STORAGE_KEY } from './constants.js';

export function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function getData(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Unable to parse localStorage key "${key}"`, error);
    return fallback;
  }
}

export function removeData(key) {
  localStorage.removeItem(key);
}

export function resetData() {
  localStorage.removeItem(APP_STORAGE_KEY);
}

export function saveAllState(state) {
  saveData(APP_STORAGE_KEY, state);
}

export function loadAllState() {
  return getData(APP_STORAGE_KEY);
}

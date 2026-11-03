import { useEffect, useState } from 'react';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';

let cachedSociety = null;
let cachedAt = 0;
let inflightPromise = null;

// The logo/watermark URLs carry a file-view token that expires (2h by
// default), so a tab left open longer would show a broken logo. Re-fetch well
// before that; the server re-signs the URLs on every read.
const MAX_AGE_MS = 30 * 60 * 1000;

function freshCache() {
  if (cachedSociety && Date.now() - cachedAt > MAX_AGE_MS) {
    cachedSociety = null;
    inflightPromise = null;
  }
  return cachedSociety;
}

// A page with no web login (the app's ledger view) gets the society from its
// own response and hands it to the letterhead this way.
export function setSocietyCache(society) {
  cachedSociety = society || {};
  cachedAt = Date.now();
  inflightPromise = null;
}

// After Society Details is saved, so the next report reads the new values.
export function clearSocietyCache() {
  cachedSociety = null;
  cachedAt = 0;
  inflightPromise = null;
}

export function useSociety() {
  const { token } = useAuth();
  const [society, setSociety] = useState(freshCache);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (freshCache()) {
      setSociety(cachedSociety);
      return undefined;
    }
    // No session yet (first load of the day, before the login is restored):
    // wait for the token instead of caching a failed read.
    if (!token) return undefined;
    let mounted = true;
    if (!inflightPromise) {
      const request = api.banking.getMaster('/masters/society', token)
        .then((response) => (response?.data && Object.keys(response.data).length ? response.data : null))
        .catch(() => null);
      inflightPromise = request;
      request.then((data) => {
        if (data) {
          if (!cachedSociety) {
            cachedSociety = data;
            cachedAt = Date.now();
          }
        } else if (inflightPromise === request) {
          // A failed or empty read is never cached (it used to stick for 30
          // minutes as "Society Name" + the placeholder logo until a hard
          // reload); the next render or token change asks again.
          inflightPromise = null;
        }
      });
    }
    let retryTimer = null;
    inflightPromise.then(() => {
      if (!mounted) return;
      if (cachedSociety) setSociety(cachedSociety);
      else if (attempt < 5) retryTimer = setTimeout(() => setAttempt((n) => n + 1), 3000);
    });
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [token, attempt]);

  return society || {};
}

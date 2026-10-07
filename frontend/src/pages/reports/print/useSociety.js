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

export function useSociety() {
  const { token } = useAuth();
  const [society, setSociety] = useState(freshCache);

  useEffect(() => {
    if (freshCache()) {
      setSociety(cachedSociety);
      return undefined;
    }
    let mounted = true;
    if (!inflightPromise) {
      inflightPromise = api.banking.getMaster('/masters/society', token).catch(() => null);
    }
    inflightPromise.then((response) => {
      if (!mounted) return;
      if (!cachedSociety) {
        cachedSociety = response?.data || {};
        cachedAt = Date.now();
      }
      setSociety(cachedSociety);
    });
    return () => {
      mounted = false;
    };
  }, [token]);

  return society || {};
}

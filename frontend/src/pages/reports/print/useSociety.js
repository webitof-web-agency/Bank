import { useEffect, useState } from 'react';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';

let cachedSociety = null;
let inflightPromise = null;

export function useSociety() {
  const { token } = useAuth();
  const [society, setSociety] = useState(cachedSociety);

  useEffect(() => {
    if (cachedSociety) {
      setSociety(cachedSociety);
      return undefined;
    }
    let mounted = true;
    if (!inflightPromise) {
      inflightPromise = api.banking.getMaster('/masters/society', token).catch(() => null);
    }
    inflightPromise.then((response) => {
      if (!mounted) return;
      cachedSociety = response?.data || {};
      setSociety(cachedSociety);
    });
    return () => {
      mounted = false;
    };
  }, [token]);

  return society || {};
}

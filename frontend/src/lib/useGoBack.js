import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Back buttons step back through history instead of pushing a new entry, so
// list -> view -> edit -> Back -> Back lands on the list, not on edit again.
// `fallback` is used only when the page was opened directly (no in-app history).
export function useGoBack(fallback) {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback((to = fallback) => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(to, { replace: true });
    }
  }, [navigate, location.key, fallback]);
}

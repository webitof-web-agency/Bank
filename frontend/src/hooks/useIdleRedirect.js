import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Activity that keeps a page open: any mouse movement, click, key, scroll,
// wheel or touch.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'click', 'keydown', 'wheel', 'scroll', 'touchstart'];

// After `timeoutMs` with no activity on the page, leave it for `to` (user,
// 2026-11-03: the Trial Balance, Cash Book, Day Book, Voucher Summary and
// Balance Sheet close to the Dashboard after 10 minutes untouched).
// `enabled` false turns it off (the other report pages).
export function useIdleRedirect({ enabled = true, timeoutMs = 10 * 60 * 1000, to = '/app/dashboard' } = {}) {
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const restart = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => navigate(to, { replace: true }), timeoutMs);
    };
    restart();
    // Capture phase, so activity inside scroll areas and dialogs counts too.
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, restart, { capture: true, passive: true });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, restart, { capture: true });
    };
  }, [enabled, timeoutMs, to, navigate]);
}

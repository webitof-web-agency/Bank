import { createContext, useContext, useEffect, useState, useMemo } from 'react';

const FY_STORAGE_KEY = 'bank-active-fy';
const START_YEAR = 2021; // Baseline starting year

function getCurrentFY() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = Jan, 3 = Apr

  let startYear;
  if (month >= 3) {
    startYear = year; // April to Dec -> Current year is start year
  } else {
    startYear = year - 1; // Jan to Mar -> Previous year is start year
  }

  return {
    label: `${startYear}-${String(startYear + 1).slice(-2)}`, // e.g. 2023-24
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

export function generateFYList(currentFY = getCurrentFY()) {
  const currentStartYear = parseInt(currentFY.start.split('-')[0], 10);
  
  const list = [];
  for (let y = currentStartYear; y >= START_YEAR; y--) {
    list.push({
      label: `${y}-${String(y + 1).slice(-2)}`,
      start: `${y}-04-01`,
      end: `${y + 1}-03-31`,
    });
  }
  return list;
}

const FYContext = createContext(null);

// The stored choice remembers which FY was current when it was made
// (`currentAtSelection`): a user who was on the current year moves to the new
// one when it starts; one who picked a past year on purpose stays there.
function readStoredFY() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(FY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (err) {
    console.error('Failed to parse stored FY', err);
    return null;
  }
}

// The FY to show, given the stored choice and the FY current today.
export function resolveActiveFY(stored, current) {
  if (!stored?.label) return { ...current, currentAtSelection: current.label };
  // Saved before this was tracked: the current year follows from now on, any
  // other year counts as chosen on purpose.
  if (!stored.currentAtSelection) {
    return { ...stored, currentAtSelection: stored.label === current.label ? current.label : current.label + '*' };
  }
  // Was on the then-current year, and a new year has started since.
  if (stored.currentAtSelection === stored.label && stored.label !== current.label && stored.start < current.start) {
    return { ...current, currentAtSelection: current.label };
  }
  return stored;
}

function initialFY() {
  return resolveActiveFY(readStoredFY(), getCurrentFY());
}

export function FYProvider({ children }) {
  // Re-derived from today's date: the new FY appears on 1 April by itself.
  const [currentLabel, setCurrentLabel] = useState(() => getCurrentFY().label);
  const fyList = useMemo(() => generateFYList(), [currentLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeFY, setActiveFYState] = useState(initialFY);

  const setActiveFY = (fy) => {
    const next = { ...fy, currentAtSelection: getCurrentFY().label };
    setActiveFYState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FY_STORAGE_KEY, JSON.stringify(next));
      // Dispatch an event so api intercepts and other listeners can know it changed immediately
      window.dispatchEvent(new Event('fy:changed'));
    }
  };

  // An app left open across 31 March: check hourly and when the tab comes
  // back into view; on a new FY, add it to the list and move a user who was
  // on the current year onto it.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const check = () => {
      const current = getCurrentFY();
      setCurrentLabel((previous) => {
        if (previous === current.label) return previous;
        setActiveFYState((active) => {
          const next = resolveActiveFY(active, current);
          if (next === active) return active;
          window.localStorage.setItem(FY_STORAGE_KEY, JSON.stringify(next));
          window.dispatchEvent(new Event('fy:changed'));
          return next;
        });
        return current.label;
      });
    };
    const timer = window.setInterval(check, 60 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Storage always holds the active FY: api.js reads it from there, so a
  // year that advanced on load must be saved too.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(FY_STORAGE_KEY);
    const next = JSON.stringify(activeFY);
    if (saved !== next) window.localStorage.setItem(FY_STORAGE_KEY, next);
  }, [activeFY]);

  const value = useMemo(
    () => ({
      activeFY,
      setActiveFY,
      fyList,
    }),
    [activeFY, fyList]
  );

  return <FYContext.Provider value={value}>{children}</FYContext.Provider>;
}

export function useFY() {
  const context = useContext(FYContext);
  if (!context) {
    throw new Error('useFY must be used inside FYProvider');
  }
  return context;
}

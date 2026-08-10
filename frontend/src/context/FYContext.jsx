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

function generateFYList() {
  const currentFY = getCurrentFY();
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

export function FYProvider({ children }) {
  const fyList = useMemo(() => generateFYList(), []);

  const [activeFY, setActiveFYState] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(FY_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
      } catch (err) {
        console.error('Failed to parse stored FY', err);
      }
    }
    return getCurrentFY();
  });

  const setActiveFY = (fy) => {
    setActiveFYState(fy);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FY_STORAGE_KEY, JSON.stringify(fy));
      // Dispatch an event so api intercepts and other listeners can know it changed immediately
      window.dispatchEvent(new Event('fy:changed'));
    }
  };

  // Ensure default is saved if not exists
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.localStorage.getItem(FY_STORAGE_KEY)) {
      window.localStorage.setItem(FY_STORAGE_KEY, JSON.stringify(activeFY));
    }
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

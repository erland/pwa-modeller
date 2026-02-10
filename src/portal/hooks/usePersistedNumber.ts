import { useEffect, useState } from 'react';

export function usePersistedNumber(key: string, defaultValue: number) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : defaultValue;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, String(Math.round(value)));
  }, [key, value]);

  return [value, setValue] as const;
}

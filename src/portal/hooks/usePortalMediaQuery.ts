import { useEffect, useState } from 'react';

export function usePortalMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();

    type MqlCompat = MediaQueryList & {
      addEventListener?: (type: 'change', listener: (ev: MediaQueryListEvent) => void) => void;
      removeEventListener?: (type: 'change', listener: (ev: MediaQueryListEvent) => void) => void;
      addListener?: (listener: (ev: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (ev: MediaQueryListEvent) => void) => void;
    };

    const mqlCompat = mql as MqlCompat;
    if (typeof mqlCompat.addEventListener === 'function') {
      mqlCompat.addEventListener('change', onChange);
      return () => mqlCompat.removeEventListener?.('change', onChange);
    }
    if (typeof mqlCompat.addListener === 'function') {
      mqlCompat.addListener(onChange);
      return () => mqlCompat.removeListener?.(onChange);
    }
    return;
  }, [query]);

  return matches;
}

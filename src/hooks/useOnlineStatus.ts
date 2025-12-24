import { useEffect, useState } from 'react';

/**
 * Tracks browser online/offline state.
 *
 * Note: `navigator.onLine` is best-effort (it indicates connection availability,
 * not guaranteed internet reachability), but it's good enough for an offline UX hint.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    function onOnline() {
      setOnline(true);
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}

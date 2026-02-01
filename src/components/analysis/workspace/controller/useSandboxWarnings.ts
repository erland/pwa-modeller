import { useCallback, useState } from 'react';

/**
 * Small helper hook for Sandbox warnings.
 * Keeps warning logic isolated so useSandboxState stays focused on orchestration.
 */
export function useSandboxWarnings() {
  const [warning, setWarning] = useState<string | null>(null);

  const emitWarning = useCallback((msg: string) => {
    setWarning((prev) => (prev === msg ? prev : msg));
  }, []);

  const clearWarning = useCallback(() => setWarning(null), []);

  return { warning, emitWarning, clearWarning } as const;
}

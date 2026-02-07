import { useEffect, useState } from 'react';

export type ToastState = { message: string; kind: 'info' | 'success' | 'warn' | 'error' };

/**
 * Shared toast state + auto-dismiss behavior.
 */
export function useOverlayToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return { toast, setToast };
}

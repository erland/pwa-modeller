import { useCallback } from 'react';

export type UseModelElementActionsArgs = {
  onEditModelProps: () => void;
};

/**
 * Element-oriented actions. For now, this mostly covers model metadata editing.
 * Kept as a separate hook to avoid the main handler becoming a "god hook".
 */
export function useModelElementActions({ onEditModelProps }: UseModelElementActionsArgs) {
  const doProperties = useCallback(() => {
    onEditModelProps();
  }, [onEditModelProps]);

  return {
    doProperties
  };
}

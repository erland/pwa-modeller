import { useCallback } from 'react';
import type { NavigateFunction } from 'react-router-dom';

export type UseModelViewActionsArgs = {
  navigate: NavigateFunction;
};

/**
 * View/navigation oriented actions.
 */
export function useModelViewActions({ navigate }: UseModelViewActionsArgs) {
  const doAbout = useCallback(() => {
    navigate('/about');
  }, [navigate]);

  return {
    doAbout
  };
}

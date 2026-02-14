import { useEffect } from 'react';

import { initRelationshipValidationMatrixFromBundledTable } from '../../domain/config/archimatePalette';

/**
 * App-wide best-effort initialization.
 *
 * Keep this hook free from UI/layout concerns so the shell stays focused on rendering.
 */
export function useAppInit(): void {
  // We always use strict ArchiMate relationship validation now. Best-effort preload.
  useEffect(() => {
    void initRelationshipValidationMatrixFromBundledTable().catch(() => undefined);
  }, []);
}

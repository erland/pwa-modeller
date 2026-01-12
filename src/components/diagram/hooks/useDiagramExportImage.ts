import { useCallback, useMemo } from 'react';
import type { Model, View } from '../../../domain';
import { downloadTextFile, sanitizeFileNameWithExtension } from '../../../store';
import { createViewSvg } from '../exportSvg';

type Args = {
  model: Model | null;
  activeViewId: string | null;
  activeView: View | null;
};

export function useDiagramExportImage({ model, activeViewId, activeView }: Args) {
  const canExportImage = useMemo(() => Boolean(model && activeViewId && activeView), [model, activeViewId, activeView]);

  const handleExportImage = useCallback(() => {
    if (!model || !activeViewId) return;
    const svg = createViewSvg(model, activeViewId);
    const base = `${model.metadata.name}-${activeView?.name || 'view'}`;
    const fileName = sanitizeFileNameWithExtension(base, 'svg');
    downloadTextFile(fileName, svg, 'image/svg+xml');
  }, [model, activeViewId, activeView]);

  return { canExportImage, handleExportImage };
}

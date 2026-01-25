import type { ElementType, RelationshipType } from '../../domain';
import type { AnalysisDirection } from '../../domain/analysis/filters';

export type MatrixQueryPreset = {
  id: string;
  name: string;
  createdAt: string; // ISO
  query: {
    rowSource: 'facet' | 'selection';
    rowElementType: ElementType | '';
    rowLayer: string | '';
    rowSelectionIds: string[];

    colSource: 'facet' | 'selection';
    colElementType: ElementType | '';
    colLayer: string | '';
    colSelectionIds: string[];

    direction: AnalysisDirection;
    relationshipTypes: RelationshipType[];

    // Heatmap/metrics touchpoint (Step 2+): presets may later include matrix metric config
    // (metric id/params + heatmap toggle) so that users can restore a full matrix 'view' and not just the axes.
  };
};

export type MatrixQuerySnapshot = {
  id: string;
  name: string;
  createdAt: string; // ISO
  // Snapshot captures the resolved ids used when it was created (stable evidence),
  // plus the UI query so it can be restored.
  builtQuery: {
    rowIds: string[];
    colIds: string[];
    direction: 'rowToCol' | 'colToRow' | 'both';
    relationshipTypes: RelationshipType[];
  };
  uiQuery: MatrixQueryPreset['query'];
  summary: {
    rowCount: number;
    colCount: number;
    grandTotal: number;
    missingCells: number;
    nonZeroCells: number;
  };
};

function key(modelId: string, kind: 'presets' | 'snapshots'): string {
  return `ea-modeller:analysis:matrix:${kind}:${modelId}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadMatrixPresets(modelId: string): MatrixQueryPreset[] {
  const parsed = safeParse<MatrixQueryPreset[]>(localStorage.getItem(key(modelId, 'presets')));
  return Array.isArray(parsed) ? parsed : [];
}

export function saveMatrixPresets(modelId: string, presets: MatrixQueryPreset[]): void {
  localStorage.setItem(key(modelId, 'presets'), JSON.stringify(presets));
}

export function loadMatrixSnapshots(modelId: string): MatrixQuerySnapshot[] {
  const parsed = safeParse<MatrixQuerySnapshot[]>(localStorage.getItem(key(modelId, 'snapshots')));
  return Array.isArray(parsed) ? parsed : [];
}

export function saveMatrixSnapshots(modelId: string, snapshots: MatrixQuerySnapshot[]): void {
  localStorage.setItem(key(modelId, 'snapshots'), JSON.stringify(snapshots));
}

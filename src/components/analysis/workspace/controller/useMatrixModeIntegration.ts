import type { Model, ModelKind, RelationshipType } from '../../../../domain';

import { useMatrixWorkspaceState } from '../useMatrixWorkspaceState';

/**
 * Encapsulates matrix-workspace wiring for the Analysis workspace controller.
 *
 * Keeps `useAnalysisWorkspaceController` focused on cross-mode orchestration
 * while this hook owns the details of composing the matrix workspace.
 */
export function useMatrixModeIntegration({
  model,
  modelId,
  modelKind,
  direction,
  relationshipTypes,
  selectionElementIds,
}: {
  model: Model | null;
  modelId: string;
  modelKind: ModelKind;
  direction: 'both' | 'incoming' | 'outgoing';
  relationshipTypes: RelationshipType[];
  selectionElementIds: string[];
}) {
  const matrixWorkspace = useMatrixWorkspaceState({
    model,
    modelId,
    modelKind,
    direction,
    relationshipTypes,
    selectionElementIds,
  });

  return {
    state: matrixWorkspace.state,
    actions: matrixWorkspace.actions,
    derived: matrixWorkspace.derived,
    uiQuery: matrixWorkspace.state.uiQuery,
  } as const;
}

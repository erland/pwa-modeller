import type { RelationshipType } from '../../../../domain';
import type { RelationshipMatrixDirection } from '../../../../domain/analysis/relationshipMatrix';

export type MatrixAxisSource = 'facet' | 'selection';

export type MatrixWorkspaceBuiltQuery = {
  rowIds: string[];
  colIds: string[];
  relationshipTypes: RelationshipType[];
  direction: RelationshipMatrixDirection;
};

export type MatrixWorkspaceCellDialogInfo = {
  rowId: string;
  rowLabel: string;
  colId: string;
  colLabel: string;
  relationshipIds: string[];
};

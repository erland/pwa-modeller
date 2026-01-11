export type Selection =
  | { kind: 'none' }
  | { kind: 'model' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'element'; elementId: string }
  | { kind: 'connector'; connectorId: string }
  | { kind: 'relationship'; relationshipId: string; viewId?: string }
  | { kind: 'view'; viewId: string }
  | { kind: 'viewNode'; viewId: string; elementId: string }
  | { kind: 'viewObject'; viewId: string; objectId: string };

export const noSelection: Selection = { kind: 'none' };

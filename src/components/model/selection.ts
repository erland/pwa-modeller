export type Selection =
  | { kind: 'none' }
  | { kind: 'model' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'element'; elementId: string }
  | { kind: 'relationship'; relationshipId: string }
  | { kind: 'view'; viewId: string }
  | { kind: 'viewNode'; viewId: string; elementId: string };

export const noSelection: Selection = { kind: 'none' };

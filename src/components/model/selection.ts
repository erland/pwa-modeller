export type Selection =
  | { kind: 'none' }
  | { kind: 'model' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'element'; elementId: string }
  | { kind: 'view'; viewId: string };

export const noSelection: Selection = { kind: 'none' };

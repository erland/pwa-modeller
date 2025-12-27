import type { NavNodeKind } from './types';
import type { Selection } from '../selection';

export function makeKey(kind: NavNodeKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseKey(key: string): { kind: NavNodeKind; id: string } | null {
  const idx = key.indexOf(':');
  if (idx < 0) return null;
  const kind = key.slice(0, idx) as NavNodeKind;
  const id = key.slice(idx + 1);
  if (!kind || !id) return null;
  return { kind, id };
}

export function selectionToKey(selection: Selection): string | null {
  switch (selection.kind) {
    case 'folder':
      return makeKey('folder', selection.folderId);
    case 'element':
      return makeKey('element', selection.elementId);
    case 'relationship':
      return makeKey('relationship', selection.relationshipId);
    case 'view':
      return makeKey('view', selection.viewId);
    case 'viewNode':
      // In the navigator we highlight the parent view.
      return makeKey('view', selection.viewId);
    case 'model':
    default:
      return null;
  }
}

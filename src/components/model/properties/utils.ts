import type { Folder, Model, Relationship } from '../../../domain';
import { getFolderPathLabel } from '../../../domain';

export function getElementLabel(model: Model, elementId: string): string {
  const el = model.elements[elementId];
  if (!el) return elementId;
  const typeLabel =
    el.type === 'Unknown'
      ? el.unknownType?.name
        ? `Unknown: ${el.unknownType.name}`
        : 'Unknown'
      : el.type;
  // Keep it stable for tests/UX: name (Type)
  return `${el.name} (${typeLabel})`;
}

export function splitRelationshipsForElement(model: Model, elementId: string) {
  const rels = Object.values(model.relationships);
  const outgoing = rels.filter((r) => r.sourceElementId === elementId);
  const incoming = rels.filter((r) => r.targetElementId === elementId);
  return { incoming, outgoing } as { incoming: Relationship[]; outgoing: Relationship[] };
}

export function findFolderByKind(model: Model, kind: Folder['kind']): Folder {
  const found = Object.values(model.folders).find((f) => f.kind === kind);
  if (!found) throw new Error(`Missing required folder kind: ${kind}`);
  return found;
}

export function folderPathLabel(model: Model, folderId: string): string {
  return getFolderPathLabel(model, folderId);
}

export function findFolderContaining(model: Model, kind: 'element' | 'view', id: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (kind === 'element' && folder.elementIds.includes(id)) return folder.id;
    if (kind === 'view' && folder.viewIds.includes(id)) return folder.id;
  }
  return null;
}

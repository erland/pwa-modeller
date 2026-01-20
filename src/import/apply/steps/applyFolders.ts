import type { ApplyImportContext } from '../applyImportTypes';
import { modelStore } from '../../../store';
import { pushWarning, toExternalIds, toTaggedValues } from '../applyImportHelpers';

/** Creates folder hierarchy and stores folder id mappings. */
export function applyFolders(ctx: ApplyImportContext): void {
  const { ir, sourceSystem, report, rootFolderId, mappings } = ctx;

  const irFolderById = new Map<string, (typeof ir.folders)[number]>();
  for (const f of ir.folders ?? []) {
    if (f && typeof f.id === 'string') irFolderById.set(f.id, f);
  }

  const ensureFolder = (irFolderId: string): string => {
    const existing = mappings.folders[irFolderId];
    if (existing) return existing;

    const irFolder = irFolderById.get(irFolderId);
    if (!irFolder) {
      // If referenced but missing, place under root.
      const created = modelStore.createFolder(rootFolderId, `Imported (${irFolderId})`);
      mappings.folders[irFolderId] = created;
      pushWarning(report, `Folder referenced but not found in IR: ${irFolderId} (created placeholder)`);
      return created;
    }

    const parentIr = irFolder.parentId ?? null;
    const parentId =
      parentIr && typeof parentIr === 'string' && parentIr.length > 0 ? ensureFolder(parentIr) : rootFolderId;

    const created = modelStore.createFolder(parentId, irFolder.name || 'Folder');
    mappings.folders[irFolderId] = created;

    // Attach external ids + tagged values
    const externalIds = toExternalIds(irFolder.externalIds, sourceSystem, irFolderId);
    const taggedValues = toTaggedValues(irFolder.taggedValues, sourceSystem);

    if (externalIds || taggedValues) {
      modelStore.updateFolder(created, { externalIds, taggedValues });
    }

    return created;
  };

  for (const f of ir.folders ?? []) {
    if (!f?.id) continue;
    try {
      ensureFolder(f.id);
    } catch (e) {
      pushWarning(report, `Failed to create folder "${f.name ?? f.id}": ${(e as Error).message}`);
    }
  }
}

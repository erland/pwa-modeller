import type { Folder, Model } from '../domain';

/**
 * Serialize a model to JSON.
 *
 * Keep this stable over time: future versions should be able to read older models.
 */
export function serializeModel(model: Model): string {
  return JSON.stringify(model, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function uniquePush(target: string[], ids: string[]): void {
  for (const id of ids) {
    if (!target.includes(id)) target.push(id);
  }
}

function getSchemaVersion(model: Model): number {
  return typeof model.schemaVersion === 'number' ? model.schemaVersion : 1;
}

function findRootFolder(model: Model): Folder | undefined {
  const byKind = Object.values(model.folders).find((f) => f.kind === 'root');
  if (byKind) return byKind;

  // Fallback for very old/invalid files: pick a folder with no parent.
  return Object.values(model.folders).find((f) => !f.parentId);
}

/**
 * v1 -> v2 migration:
 * - Remove the implicit 'Elements' and 'Views' root folders.
 * - Move their content (elements/views + child folders) to the Root folder.
 */
function migrateV1ToV2(model: Model): Model {
  const root = findRootFolder(model);
  if (!root) {
    // Nothing sensible we can do; keep it as-is but bump the version so we don't loop.
    model.schemaVersion = 2;
    return model;
  }

  const legacyRootFolders = Object.values(model.folders).filter((f) => f.kind === 'elements' || f.kind === 'views');
  if (legacyRootFolders.length === 0) {
    model.schemaVersion = 2;
    return model;
  }

  const legacyIds = legacyRootFolders.map((f) => f.id);

  // Move content into root + reparent children.
  for (const legacy of legacyRootFolders) {
    uniquePush(root.elementIds, legacy.elementIds);
    uniquePush(root.viewIds, legacy.viewIds);

    // Reparent declared children first.
    for (const childId of legacy.folderIds) {
      const child = model.folders[childId];
      if (!child) continue;
      child.parentId = root.id;
      uniquePush(root.folderIds, [childId]);
    }

    // Defensive: also reparent any folder that points to this legacy folder.
    for (const f of Object.values(model.folders)) {
      if (f.parentId === legacy.id) {
        f.parentId = root.id;
        uniquePush(root.folderIds, [f.id]);
      }
    }
  }

  // Ensure legacy folder ids are not referenced from root anymore.
  root.folderIds = root.folderIds.filter((id) => !legacyIds.includes(id));

  // Drop legacy folders from the folders collection.
  for (const id of legacyIds) {
    delete model.folders[id];
  }

  model.schemaVersion = 2;
  return model;
}

function migrateModel(model: Model): Model {
  const v = getSchemaVersion(model);
  if (v >= 2) return model;
  return migrateV1ToV2(model);
}

/**
 * Deserialize a model from JSON.
 *
 * Future versions should be able to read older models.
 */
export function deserializeModel(json: string): Model {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) throw new Error('Invalid model file (expected an object)');
  if (typeof parsed.id !== 'string' || parsed.id.trim().length === 0) {
    throw new Error('Invalid model file (missing id)');
  }
  if (!isRecord(parsed.metadata) || typeof parsed.metadata.name !== 'string') {
    throw new Error('Invalid model file (missing metadata.name)');
  }
  if (!isRecord(parsed.elements) || !isRecord(parsed.relationships) || !isRecord(parsed.views) || !isRecord(parsed.folders)) {
    throw new Error('Invalid model file (missing collections)');
  }

  return migrateModel(parsed as unknown as Model);
}

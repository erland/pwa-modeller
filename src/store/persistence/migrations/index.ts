import type { Folder, Model } from '../../../domain';
import { isRecord, uniquePush } from '../utils';

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

/**
 * v2 -> v3 migration:
 * - Add Folder.relationshipIds (default empty array).
 * - Assign missing zIndex for view nodes and relationship layouts (stable order).
 */
function migrateV2ToV3(model: Model): Model {
  // Add relationshipIds on all folders
  for (const fid of Object.keys(model.folders)) {
    const f = model.folders[fid] as any;
    if (!Array.isArray(f.relationshipIds)) {
      model.folders[fid] = { ...(f as Folder), relationshipIds: [] };
    }
  }

  // Ensure view layout items have zIndex for stable stacking / round-trips.
  for (const vid of Object.keys(model.views)) {
    const v = model.views[vid];
    if (!v.layout) continue;

    const nextNodes = v.layout.nodes.map((n, idx) => ({
      ...n,
      zIndex: typeof (n as any).zIndex === 'number' ? (n as any).zIndex : idx,
    }));
    const nextRels = v.layout.relationships.map((r, idx) => ({
      ...r,
      zIndex: typeof (r as any).zIndex === 'number' ? (r as any).zIndex : idx,
    }));

    model.views[vid] = {
      ...v,
      layout: { nodes: nextNodes, relationships: nextRels },
    };
  }

  model.schemaVersion = 3;
  return model;
}

/**
 * v3 -> v4 migration:
 * - Add Model.externalIds + Model.taggedValues (default empty arrays).
 * - Add Folder.externalIds + Folder.taggedValues (default empty arrays).
 */
function migrateV3ToV4(model: Model): Model {
  const m: any = model as any;
  if (!Array.isArray(m.externalIds)) m.externalIds = [];
  if (!Array.isArray(m.taggedValues)) m.taggedValues = [];

  for (const fid of Object.keys(model.folders)) {
    const f: any = model.folders[fid] as any;
    if (!Array.isArray(f.externalIds)) f.externalIds = [];
    if (!Array.isArray(f.taggedValues)) f.taggedValues = [];
  }

  model.schemaVersion = 4;
  return model;
}

/**
 * v4 -> v5 migration:
 * - Add Model.connectors (default empty object).
 */
function migrateV4ToV5(model: Model): Model {
  const m: any = model as any;
  if (!isRecord(m.connectors)) m.connectors = {};

  model.schemaVersion = 5;
  return model;
}

/**
 * v5 -> v6 migration:
 * - Add View.objects (default empty object) on all views.
 */
function migrateV5ToV6(model: Model): Model {
  for (const vid of Object.keys(model.views)) {
    const v: any = model.views[vid] as any;
    if (!isRecord(v.objects)) {
      model.views[vid] = { ...(v as any), objects: {} };
    }
  }

  model.schemaVersion = 6;
  return model;
}

/**
 * v6 -> v7 migration:
 * - Phase out `description` on concept objects (elements, relationships, views, connectors).
 * - If `documentation` is empty but `description` exists, move it into `documentation`.
 */
function migrateV6ToV7(model: Model): Model {
  // Elements
  for (const id of Object.keys(model.elements)) {
    const el: any = model.elements[id] as any;
    if (!el) continue;
    if (typeof el.documentation !== 'string' || el.documentation.trim().length === 0) {
      if (typeof el.description === 'string' && el.description.trim().length > 0) {
        el.documentation = el.description;
      }
    }
    if ('description' in el) delete el.description;
  }

  // Relationships
  for (const id of Object.keys(model.relationships)) {
    const rel: any = model.relationships[id] as any;
    if (!rel) continue;
    if (typeof rel.documentation !== 'string' || rel.documentation.trim().length === 0) {
      if (typeof rel.description === 'string' && rel.description.trim().length > 0) {
        rel.documentation = rel.description;
      }
    }
    if ('description' in rel) delete rel.description;
  }

  // Views
  for (const id of Object.keys(model.views)) {
    const v: any = model.views[id] as any;
    if (!v) continue;
    if (typeof v.documentation !== 'string' || v.documentation.trim().length === 0) {
      if (typeof v.description === 'string' && v.description.trim().length > 0) {
        v.documentation = v.description;
      }
    }
    if ('description' in v) delete v.description;
  }

  // Connectors
  const m: any = model as any;
  if (isRecord(m.connectors)) {
    for (const id of Object.keys(m.connectors)) {
      const c: any = m.connectors[id] as any;
      if (!c) continue;
      if (typeof c.documentation !== 'string' || c.documentation.trim().length === 0) {
        if (typeof c.description === 'string' && c.description.trim().length > 0) {
          c.documentation = c.description;
        }
      }
      if ('description' in c) delete c.description;
    }
  }

  model.schemaVersion = 7;
  return model;
}

/**
 * v7 -> v8 migration:
 * - Add View.connections (default empty array) on all views.
 */
function migrateV7ToV8(model: Model): Model {
  for (const id of Object.keys(model.views)) {
    const v: any = model.views[id] as any;
    if (!Array.isArray(v.connections)) {
      model.views[id] = { ...(v as any), connections: [] };
    }
  }
  model.schemaVersion = 8;
  return model;
}


export type MigrationResult = {
  model: Model;
  migratedFromVersion: number;
  notes: string[];
};

/**
 * Run schema migrations on a persisted model.
 *
 * Migrations are allowed to change the meaning of fields/structures to match
 * the current schema version.
 */
export function runMigrations(model: Model): MigrationResult {
  const migratedFromVersion = getSchemaVersion(model);
  const notes: string[] = [];

  let v = migratedFromVersion;
  if (v < 2) {
    model = migrateV1ToV2(model);
    notes.push('migrate v1 -> v2');
    v = getSchemaVersion(model);
  }
  if (v < 3) {
    model = migrateV2ToV3(model);
    notes.push('migrate v2 -> v3');
    v = getSchemaVersion(model);
  }
  if (v < 4) {
    model = migrateV3ToV4(model);
    notes.push('migrate v3 -> v4');
    v = getSchemaVersion(model);
  }
  if (v < 5) {
    model = migrateV4ToV5(model);
    notes.push('migrate v4 -> v5');
    v = getSchemaVersion(model);
  }
  if (v < 6) {
    model = migrateV5ToV6(model);
    notes.push('migrate v5 -> v6');
    v = getSchemaVersion(model);
  }
  if (v < 7) {
    model = migrateV6ToV7(model);
    notes.push('migrate v6 -> v7');
    v = getSchemaVersion(model);
  }
  if (v < 8) {
    model = migrateV7ToV8(model);
    notes.push('migrate v7 -> v8');
  }

  return { model, migratedFromVersion, notes };
}

/**
 * Backward-compatible helper used by older code/tests.
 */
export function migrateModel(model: Model): Model {
  return runMigrations(model).model;
}

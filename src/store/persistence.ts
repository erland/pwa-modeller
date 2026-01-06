import type { Folder, Model, TaggedValue, TaggedValueType } from '../domain';
import { createId, sanitizeRelationshipAttrs } from '../domain';

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


const ALLOWED_TAGGED_VALUE_TYPES: TaggedValueType[] = ['string', 'number', 'boolean', 'json'];

function sanitizeTaggedValues(raw: unknown): TaggedValue[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  // First pass: coerce/validate entries
  const coerced: TaggedValue[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as unknown;
    if (!isRecord(item)) continue;

    const idRaw = item.id;
    const id = typeof idRaw === 'string' && idRaw.trim().length > 0 ? idRaw.trim() : createId('tag');

    const nsRaw = item.ns;
    const ns = typeof nsRaw === 'string' ? nsRaw.trim() : '';
    const nsNorm = ns.length > 0 ? ns : undefined;

    const keyRaw = item.key;
    const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
    if (!key) continue;

    const typeRaw = item.type;
    const type = typeof typeRaw === 'string' && (ALLOWED_TAGGED_VALUE_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as TaggedValueType)
      : undefined;

    let value: string;
    const valueRaw = (item as any).value;
    if (typeof valueRaw === 'string') value = valueRaw;
    else if (typeof valueRaw === 'number' || typeof valueRaw === 'boolean') value = String(valueRaw);
    else if (valueRaw === null || valueRaw === undefined) value = '';
    else {
      // Best-effort for legacy/bad data: stringify objects, fall back to String().
      try {
        value = JSON.stringify(valueRaw);
      } catch {
        value = String(valueRaw);
      }
    }

    // Optional canonicalization based on declared type
    if (type === 'boolean') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === 'false') value = v;
    } else if (type === 'json') {
      const v = value.trim();
      if (v.length > 0) {
        try {
          const parsed = JSON.parse(v);
          value = JSON.stringify(parsed);
        } catch {
          // keep as-is
        }
      }
    } else if (type === 'number') {
      const v = value.trim();
      if (v.length > 0) {
        const n = Number(v);
        if (Number.isFinite(n)) value = v;
      }
    }

    coerced.push({ id, ns: nsNorm, key, type, value });
  }

  if (coerced.length === 0) return undefined;

  // Second pass: de-dup by (ns, key), keeping the LAST occurrence (stable order of last occurrences).
  const lastIndex = new Map<string, number>();
  for (let i = 0; i < coerced.length; i++) {
    const t = coerced[i];
    const ident = `${t.ns ?? ''}::${t.key}`;
    lastIndex.set(ident, i);
  }

  const deduped: TaggedValue[] = [];
  for (let i = 0; i < coerced.length; i++) {
    const t = coerced[i];
    const ident = `${t.ns ?? ''}::${t.key}`;
    if (lastIndex.get(ident) === i) deduped.push(t);
  }

  return deduped.length > 0 ? deduped : undefined;
}

function sanitizeModelTaggedValues(model: Model): Model {
  for (const id of Object.keys(model.elements)) {
    const el = model.elements[id] as any;
    if (Object.prototype.hasOwnProperty.call(el, 'taggedValues')) {
      el.taggedValues = sanitizeTaggedValues(el.taggedValues);
    }
  }
  for (const id of Object.keys(model.relationships)) {
    const rel = model.relationships[id] as any;
    if (Object.prototype.hasOwnProperty.call(rel, 'taggedValues')) {
      rel.taggedValues = sanitizeTaggedValues(rel.taggedValues);
    }
  }
  for (const id of Object.keys(model.views)) {
    const v = model.views[id] as any;
    if (Object.prototype.hasOwnProperty.call(v, 'taggedValues')) {
      v.taggedValues = sanitizeTaggedValues(v.taggedValues);
    }
  }
  return model;
}

function sanitizeModelRelationshipAttrs(model: Model): Model {
  for (const id of Object.keys(model.relationships)) {
    const rel = model.relationships[id] as any;
    if (Object.prototype.hasOwnProperty.call(rel, 'attrs')) {
      rel.attrs = sanitizeRelationshipAttrs(rel.type, rel.attrs);
    }
  }
  return model;
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

function migrateModel(model: Model): Model {
  let v = getSchemaVersion(model);
  if (v < 2) {
    model = migrateV1ToV2(model);
    v = getSchemaVersion(model);
  }
  if (v < 3) {
    model = migrateV2ToV3(model);
  }
  return model;
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

  return sanitizeModelRelationshipAttrs(sanitizeModelTaggedValues(migrateModel(parsed as unknown as Model)));
}

import type { Model, TaggedValue, TaggedValueType } from '../../domain';
import {
  createId,
  sanitizeRelationshipAttrs,
  sanitizeUnknownTypeForElement,
  sanitizeUnknownTypeForRelationship,
  tidyExternalIds,
} from '../../domain';
import { isRecord } from './utils';

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

export function sanitizeModelTaggedValues(model: Model): Model {
  // Model-level tagged values (v4+: always present, keep empty arrays)
  const m: any = model as any;
  if (Object.prototype.hasOwnProperty.call(m, 'taggedValues')) {
    const raw = m.taggedValues;
    if (Array.isArray(raw)) {
      const s = sanitizeTaggedValues(raw);
      m.taggedValues = s ?? (raw.length === 0 ? [] : []);
    } else {
      // Keep runtime shape predictable for the model object.
      m.taggedValues = [];
    }
  }

  // Folder-level tagged values (v4+: always present, keep empty arrays)
  for (const id of Object.keys(model.folders)) {
    const f = model.folders[id] as any;
    if (Object.prototype.hasOwnProperty.call(f, 'taggedValues')) {
      const raw = f.taggedValues;
      if (Array.isArray(raw)) {
        const s = sanitizeTaggedValues(raw);
        f.taggedValues = s ?? (raw.length === 0 ? [] : []);
      } else {
        f.taggedValues = [];
      }
    }
  }

  // Elements: optional extensions; keep undefined when empty/invalid.
  for (const id of Object.keys(model.elements)) {
    const el = model.elements[id] as any;
    if (Object.prototype.hasOwnProperty.call(el, 'taggedValues')) {
      el.taggedValues = sanitizeTaggedValues(el.taggedValues);
    }
  }

  // Relationships: factories default to [], preserve empty arrays when present.
  for (const id of Object.keys(model.relationships)) {
    const rel = model.relationships[id] as any;
    if (Object.prototype.hasOwnProperty.call(rel, 'taggedValues')) {
      const raw = rel.taggedValues;
      if (Array.isArray(raw)) {
        const s = sanitizeTaggedValues(raw);
        rel.taggedValues = s ?? (raw.length === 0 ? [] : undefined);
      } else {
        rel.taggedValues = undefined;
      }
    }
  }

  // Views: optional extensions; keep undefined when empty/invalid.
  for (const id of Object.keys(model.views)) {
    const v = model.views[id] as any;
    if (Object.prototype.hasOwnProperty.call(v, 'taggedValues')) {
      v.taggedValues = sanitizeTaggedValues(v.taggedValues);
    }
  }

  return model;
}


export function sanitizeModelExternalIds(model: Model): Model {
  // Model-level external IDs (v4+: always present, keep empty arrays)
  const m: any = model as any;
  if (Object.prototype.hasOwnProperty.call(m, 'externalIds')) {
    const raw = m.externalIds;
    if (Array.isArray(raw)) {
      const t = tidyExternalIds(raw);
      m.externalIds = t ?? (raw.length === 0 ? [] : []);
    } else {
      m.externalIds = [];
    }
  }

  // Folder-level external IDs (v4+: always present, keep empty arrays)
  for (const id of Object.keys(model.folders)) {
    const f = model.folders[id] as any;
    if (Object.prototype.hasOwnProperty.call(f, 'externalIds')) {
      const raw = f.externalIds;
      if (Array.isArray(raw)) {
        const t = tidyExternalIds(raw);
        f.externalIds = t ?? (raw.length === 0 ? [] : []);
      } else {
        f.externalIds = [];
      }
    }
  }

  // Elements: optional extensions; keep undefined when empty/invalid.
  for (const id of Object.keys(model.elements)) {
    const el = model.elements[id] as any;
    if (Object.prototype.hasOwnProperty.call(el, 'externalIds')) {
      const raw = el.externalIds;
      el.externalIds = Array.isArray(raw) ? tidyExternalIds(raw) : undefined;
    }
  }

  // Relationships: factories default to [], preserve empty arrays when present.
  for (const id of Object.keys(model.relationships)) {
    const rel = model.relationships[id] as any;
    if (Object.prototype.hasOwnProperty.call(rel, 'externalIds')) {
      const raw = rel.externalIds;
      if (Array.isArray(raw)) {
        const t = tidyExternalIds(raw);
        rel.externalIds = t ?? (raw.length === 0 ? [] : undefined);
      } else {
        rel.externalIds = undefined;
      }
    }
  }

  // Views: optional extensions; keep undefined when empty/invalid.
  for (const id of Object.keys(model.views)) {
    const v = model.views[id] as any;
    if (Object.prototype.hasOwnProperty.call(v, 'externalIds')) {
      const raw = v.externalIds;
      v.externalIds = Array.isArray(raw) ? tidyExternalIds(raw) : undefined;
    }
  }

  return model;
}


export function sanitizeModelRelationshipAttrs(model: Model): Model {
  for (const id of Object.keys(model.relationships)) {
    const rel = model.relationships[id] as any;
    if (Object.prototype.hasOwnProperty.call(rel, 'attrs')) {
      rel.attrs = sanitizeRelationshipAttrs(rel.type, rel.attrs);
    }
  }
  return model;
}

export function sanitizeModelUnknownTypes(model: Model): Model {
  for (const id of Object.keys(model.elements)) {
    const el = model.elements[id] as any;
    if (Object.prototype.hasOwnProperty.call(el, 'type') || Object.prototype.hasOwnProperty.call(el, 'unknownType')) {
      model.elements[id] = sanitizeUnknownTypeForElement(el);
    }
  }
  for (const id of Object.keys(model.relationships)) {
    const rel = model.relationships[id] as any;
    if (Object.prototype.hasOwnProperty.call(rel, 'type') || Object.prototype.hasOwnProperty.call(rel, 'unknownType')) {
      model.relationships[id] = sanitizeUnknownTypeForRelationship(rel);
    }
  }
  return model;
}

/**
 * Ensure new optional array fields are present as arrays at runtime.
 * This makes the rest of the codebase simpler (no `?.` needed).
 */
export function ensureModelFolderExtensions(model: Model): Model {
  const m: any = model as any;
  if (!Array.isArray(m.externalIds)) m.externalIds = [];
  if (!Array.isArray(m.taggedValues)) m.taggedValues = [];

  // Connectors (introduced later): keep runtime shape predictable.
  if (!isRecord((m as any).connectors)) (m as any).connectors = {};

  for (const fid of Object.keys(model.folders)) {
    const f: any = model.folders[fid] as any;
    if (!Array.isArray(f.externalIds)) f.externalIds = [];
    if (!Array.isArray(f.taggedValues)) f.taggedValues = [];
    if (!Array.isArray(f.relationshipIds)) f.relationshipIds = [];
  }

  // Note: Elements and Views may have external IDs / tagged values, but those are optional.
  // Relationships may also have these, but we preserve the loaded shape (do not force defaults here).
  // (Factories provide defaults for new objects; older files are sanitized in the passes above.)

  // View-only objects (introduced in v6): keep runtime shape predictable.
  for (const vid of Object.keys(model.views)) {
    const v: any = model.views[vid] as any;
    // View connections (introduced in v8): keep runtime shape predictable.
    if (!Array.isArray(v.connections)) {
      model.views[vid] = { ...(v as any), connections: [] };
    }
    if (!isRecord(v.objects)) {
      model.views[vid] = { ...(v as any), objects: {} };
    }
  }
  return model;
}

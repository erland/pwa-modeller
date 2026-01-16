import type { Model } from '../../domain';
import {
  sanitizeRelationshipAttrs,
  sanitizeTaggedValuesList,
  sanitizeUnknownTypeForElement,
  sanitizeUnknownTypeForRelationship,
  tidyExternalIds,
} from '../../domain';
import { isRecord } from './utils';


export function sanitizeModelTaggedValues(model: Model): Model {
  // Model-level tagged values (v4+: always present, keep empty arrays)
  const m: any = model as any;
  if (Object.prototype.hasOwnProperty.call(m, 'taggedValues')) {
    const raw = m.taggedValues;
    if (Array.isArray(raw)) {
      const s = sanitizeTaggedValuesList(raw);
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
        const s = sanitizeTaggedValuesList(raw);
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
      el.taggedValues = sanitizeTaggedValuesList(el.taggedValues);
    }
  }

  // Relationships: factories default to [], preserve empty arrays when present.
  for (const id of Object.keys(model.relationships)) {
    const rel = model.relationships[id] as any;
    if (Object.prototype.hasOwnProperty.call(rel, 'taggedValues')) {
      const raw = rel.taggedValues;
      if (Array.isArray(raw)) {
        const s = sanitizeTaggedValuesList(raw);
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
      v.taggedValues = sanitizeTaggedValuesList(v.taggedValues);
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


export function sanitizeModelViewConnections(model: Model): Model {
  // Ensure view.connections exists (v8+) for predictable runtime shape.
  for (const vid of Object.keys(model.views)) {
    const v: any = model.views[vid] as any;
    if (!Array.isArray(v.connections)) {
      model.views[vid] = { ...(v as any), connections: [] };
    }
  }
  return model;
}

export function sanitizeModelViewKinds(model: Model): Model {
  // Ensure view.kind exists (v9+) for predictable runtime shape.
  for (const vid of Object.keys(model.views)) {
    const v: any = model.views[vid] as any;
    const raw = v?.kind;
    const kind = raw === 'archimate' || raw === 'uml' || raw === 'bpmn' ? raw : 'archimate';
    if (v.kind !== kind) {
      model.views[vid] = { ...(v as any), kind };
    }
  }
  return model;
}

export function sanitizeModelUmlClassifierNodeLegacyMemberText(model: Model): Model {
  // Drop legacy node-level class/interface member text fields (attrs.attributesText/attrs.operationsText).
  // Member data is now stored on the UML element itself.
  for (const vid of Object.keys(model.views)) {
    const v: any = model.views[vid] as any;
    const nodes: any = v?.layout?.nodes;
    if (!Array.isArray(nodes)) continue;

    for (let i = 0; i < nodes.length; i++) {
      const n: any = nodes[i];
      const elementId = typeof n?.elementId === 'string' ? String(n.elementId).trim() : '';
      if (!elementId) continue;

      const el: any = (model.elements as any)[elementId];
      if (!el) continue;
      if (el.type !== 'uml.class' && el.type !== 'uml.interface') continue;

      const rawAttrs = n?.attrs;
      if (!isRecord(rawAttrs)) continue;
      if (!Object.prototype.hasOwnProperty.call(rawAttrs, 'attributesText') && !Object.prototype.hasOwnProperty.call(rawAttrs, 'operationsText')) {
        continue;
      }

      const nextAttrs: any = { ...rawAttrs };
      delete nextAttrs.attributesText;
      delete nextAttrs.operationsText;
      nodes[i] = { ...(n as any), attrs: nextAttrs };
    }
  }

  return model;
}

export function sanitizeModelViewOwnerRefs(model: Model): Model {
  // ownerRef is optional; if present, ensure it has a valid shape.
  for (const vid of Object.keys(model.views)) {
    const v: any = model.views[vid] as any;
    if (!Object.prototype.hasOwnProperty.call(v, 'ownerRef')) continue;

    const raw = v.ownerRef;
    if (!isRecord(raw)) {
      if (raw !== undefined) model.views[vid] = { ...(v as any), ownerRef: undefined };
      continue;
    }

    const kind = (raw as any).kind;
    const id = (raw as any).id;
    const okKind = kind === 'archimate' || kind === 'uml' || kind === 'bpmn';
    const okId = typeof id === 'string' && id.trim().length > 0;
    if (!okKind || !okId) {
      model.views[vid] = { ...(v as any), ownerRef: undefined };
      continue;
    }

    // Normalize to { kind, id } only (drop extra fields).
    if (raw.kind !== kind || raw.id !== id || Object.keys(raw).length !== 2) {
      model.views[vid] = { ...(v as any), ownerRef: { kind, id } };
    }
  }
  return model;
}

/**
 * Migration for legacy "centered views".
 *
 * Older persisted models stored the owning element on `centerElementId`.
 * The ownership model now uses `ownerRef`.
 *
 * This pass:
 *  - Adds a best-effort `ownerRef` when `centerElementId` exists and `ownerRef` is missing
 *  - Removes `centerElementId` from the persisted view object
 */
export function sanitizeModelViewOwnerRefsFromCentered(model: Model): Model {
  for (const vid of Object.keys(model.views)) {
    const v: any = model.views[vid] as any;
    const centered = typeof (v as any)?.centerElementId === 'string' ? String((v as any).centerElementId).trim() : '';
    if (!centered) continue;

    const hasOwnerProp = Object.prototype.hasOwnProperty.call(v, 'ownerRef');
    const owner = (v as any).ownerRef;
    // If ownerRef is missing (or explicitly undefined), add one.
    if (!hasOwnerProp || owner === undefined) {
      model.views[vid] = { ...(v as any), ownerRef: { kind: 'archimate', id: centered } };
    }
    // Drop the legacy field after migration.
    if (Object.prototype.hasOwnProperty.call(model.views[vid] as any, 'centerElementId')) {
      const next = { ...(model.views[vid] as any) };
      delete (next as any).centerElementId;
      model.views[vid] = next as any;
    }
  }
  return model;
}


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
    // View kind (introduced in v9): keep runtime shape predictable.
    const rawKind = v?.kind;
    const kind = rawKind === 'archimate' || rawKind === 'uml' || rawKind === 'bpmn' ? rawKind : 'archimate';
    if (v.kind !== kind) {
      model.views[vid] = { ...(v as any), kind };
    }
    // View connections (introduced in v8): keep runtime shape predictable.
    if (!Array.isArray(v.connections)) {
      model.views[vid] = { ...(v as any), connections: [] };
    }
    if (!isRecord(v.objects)) {
      model.views[vid] = { ...(v as any), objects: {} };
    }

    // Optional ownerRef (introduced in v10+ conceptually): keep shape predictable when present.
    if (Object.prototype.hasOwnProperty.call(v, 'ownerRef') && v.ownerRef !== undefined) {
      const raw = v.ownerRef;
      if (!isRecord(raw)) {
        model.views[vid] = { ...(v as any), ownerRef: undefined };
      } else {
        const kind = (raw as any).kind;
        const id = (raw as any).id;
        const okKind = kind === 'archimate' || kind === 'uml' || kind === 'bpmn';
        const okId = typeof id === 'string' && id.trim().length > 0;
        if (!okKind || !okId) {
          model.views[vid] = { ...(v as any), ownerRef: undefined };
        } else if (Object.keys(raw).length !== 2 || raw.kind !== kind || raw.id !== id) {
          model.views[vid] = { ...(v as any), ownerRef: { kind, id } };
        }
      }
    }
  }
  return model;
}

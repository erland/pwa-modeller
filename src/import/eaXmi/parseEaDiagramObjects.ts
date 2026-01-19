import type { ImportReport } from '../importReport';
import type { IRBounds, IRExternalId, IRView, IRViewNode, IRViewNodeKind } from '../framework/ir';
import { attrAny, localName, qa } from '../framework/xml';

type ParseEaDiagramObjectsResult = {
  views: IRView[];
};

const EA_EXTENDER_ATTRS = ['extender'] as const;

// Diagram ids
const EA_DIAGRAM_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid', 'uuid'] as const;
const EA_DIAGRAM_ID_ATTRS = ['xmi:id', 'xmi:idref', 'id', 'diagramid', 'diagram_id', 'diagramID'] as const;

// Diagram object ids
const EA_OBJ_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid', 'uuid'] as const;
const EA_OBJ_ID_ATTRS = ['xmi:id', 'id', 'objectid', 'object_id', 'diagramobjectid', 'diagram_object_id'] as const;

// Diagram object bounds (variants)
const EA_L_ATTRS = ['l', 'left', 'x1', 'lx'] as const;
const EA_R_ATTRS = ['r', 'right', 'x2', 'rx'] as const;
const EA_T_ATTRS = ['t', 'top', 'y1', 'ty'] as const;
const EA_B_ATTRS = ['b', 'bottom', 'y2', 'by'] as const;
const EA_X_ATTRS = ['x', 'px', 'posx', 'pos_x'] as const;
const EA_Y_ATTRS = ['y', 'py', 'posy', 'pos_y'] as const;
const EA_W_ATTRS = ['w', 'width'] as const;
const EA_H_ATTRS = ['h', 'height'] as const;
const EA_BOUNDS_STR_ATTRS = ['geometry', 'bounds', 'rect', 'rectangle', 'position', 'pos'] as const;

const EA_REF_ATTRS = [
  // Common EA diagram-object references to model elements
  'subject',
  'subjectid',
  'subject_id',
  'element',
  'elementid',
  'element_id',
  'classifier',
  'classifierid',
  'classifier_id',
  'instance',
  'instanceid',
  'instance_id',
  // Generic ref patterns
  'xmi:idref',
  'idref',
  'ref',
  'href'
] as const;

function isEaExtension(el: Element): boolean {
  const extender = (attrAny(el, [...EA_EXTENDER_ATTRS]) ?? '').toLowerCase();
  return extender.includes('enterprise architect');
}

function isDiagramCandidate(el: Element): boolean {
  const ln = localName(el);
  if (ln === 'diagram') return true;
  if (ln.endsWith('diagram') && !ln.includes('diagramobject') && !ln.includes('diagramlink')) return true;
  return false;
}

function isDiagramObjectCandidate(el: Element): boolean {
  const ln = localName(el);
  // Be liberal: different EA versions / export options use different tag names.
  if (ln === 'diagramobject') return true;
  if (ln.endsWith('diagramobject')) return true;
  if (ln === 'object' || ln.endsWith('object')) {
    // Avoid capturing unrelated UML/XMI "ownedAttribute" etc.
    const hasGeometryHint =
      !!attrAny(el, [...EA_L_ATTRS, ...EA_X_ATTRS, ...EA_BOUNDS_STR_ATTRS]) ||
      !!attrAny(el, [...EA_REF_ATTRS]);
    return hasGeometryHint;
  }
  return false;
}

function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseBoundsFromLTRB(l: number, t: number, r: number, b: number): IRBounds | null {
  const w = r - l;
  const h = b - t;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { x: l, y: t, width: w, height: h };
}

function parseBoundsString(raw: string): IRBounds | null {
  const s = raw.trim();
  if (!s) return null;

  // Key/value form: "l=10;r=110;t=20;b=70" (any separators)
  if (s.includes('=')) {
    const kvs = s
      .split(/[;,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const map: Record<string, number> = {};
    for (const kv of kvs) {
      const m = /^([a-zA-Z]+)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(kv);
      if (!m) continue;
      map[m[1]!.toLowerCase()] = Number(m[2]);
    }
    const l = map.l ?? map.left;
    const r = map.r ?? map.right;
    const t = map.t ?? map.top;
    const b = map.b ?? map.bottom;
    if ([l, r, t, b].every((x) => typeof x === 'number' && Number.isFinite(x))) {
      return parseBoundsFromLTRB(l!, t!, r!, b!);
    }
    const x = map.x;
    const y = map.y;
    const w = map.w ?? map.width;
    const h = map.h ?? map.height;
    if ([x, y, w, h].every((x) => typeof x === 'number' && Number.isFinite(x)) && w! > 0 && h! > 0) {
      return { x: x!, y: y!, width: w!, height: h! };
    }
  }

  // Numeric list form: "10,20,110,70" or "10 20 110 70" etc.
  const nums = s
    .split(/[^0-9.+-]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => Number(p))
    .filter((n) => Number.isFinite(n));
  if (nums.length >= 4) {
    const [a, b, c, d] = nums;
    if (a == null || b == null || c == null || d == null) return null;
    // Prefer l,t,r,b when it makes sense.
    if (c > a && d > b) {
      const maybeLTRB = parseBoundsFromLTRB(a, b, c, d);
      if (maybeLTRB) return maybeLTRB;
    }
    // Fallback to x,y,w,h
    if (c > 0 && d > 0) return { x: a, y: b, width: c, height: d };
  }

  return null;
}

function parseBounds(el: Element): IRBounds | undefined {
  const l = parseNum(attrAny(el, [...EA_L_ATTRS]));
  const r = parseNum(attrAny(el, [...EA_R_ATTRS]));
  const t = parseNum(attrAny(el, [...EA_T_ATTRS]));
  const b = parseNum(attrAny(el, [...EA_B_ATTRS]));
  if (l != null && r != null && t != null && b != null) {
    const lr = parseBoundsFromLTRB(l, t, r, b);
    if (lr) return lr;
  }

  const x = parseNum(attrAny(el, [...EA_X_ATTRS]));
  const y = parseNum(attrAny(el, [...EA_Y_ATTRS]));
  const w = parseNum(attrAny(el, [...EA_W_ATTRS]));
  const h = parseNum(attrAny(el, [...EA_H_ATTRS]));
  if (x != null && y != null && w != null && h != null && w > 0 && h > 0) {
    return { x, y, width: w, height: h };
  }

  const raw = attrAny(el, [...EA_BOUNDS_STR_ATTRS]);
  if (raw) {
    const b2 = parseBoundsString(raw);
    if (b2) return b2;
  }

  return undefined;
}

function nodeKindFromObject(el: Element): IRViewNodeKind {
  const ln = localName(el);
  const t = (attrAny(el, ['type', 'kind', 'objecttype', 'objectType', 'style', 'stereotype']) ?? '').toLowerCase();

  if (ln.includes('note') || t.includes('note')) return 'note';
  if (t.includes('group') || t.includes('boundary') || t.includes('container')) return 'group';
  if (t.includes('image') || t.includes('bitmap') || t.includes('icon')) return 'image';
  if (t.includes('shape') || t.includes('rectangle') || t.includes('line')) return 'shape';

  // Default: treat as an element placeholder (will be resolved in B2).
  return 'element';
}

function pickObjectId(el: Element, synthIdx: number): { id: string; externalIds: IRExternalId[] } {
  const guid = attrAny(el, [...EA_OBJ_GUID_ATTRS])?.trim();
  const xmiId = attrAny(el, ['xmi:id'])?.trim();
  const anyId = attrAny(el, [...EA_OBJ_ID_ATTRS])?.trim();

  const externalIds: IRExternalId[] = [];
  if (xmiId) externalIds.push({ system: 'xmi', id: xmiId, kind: 'diagram-object-xmi-id' });
  if (guid) externalIds.push({ system: 'sparx-ea', id: guid, kind: 'diagram-object-guid' });
  if (anyId && anyId !== xmiId && anyId !== guid) externalIds.push({ system: 'sparx-ea', id: anyId, kind: 'diagram-object-id' });

  const picked = guid || xmiId || anyId || `eaDiagramObject_synth_${synthIdx}`;
  return { id: picked, externalIds };
}

function buildRefRaw(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of EA_REF_ATTRS) {
    const v = attrAny(el, [k]);
    if (v != null && v.trim()) out[k] = v.trim();
  }
  return out;
}

function diagramKeyCandidates(diagramEl: Element): string[] {
  const vals: string[] = [];
  const guid = attrAny(diagramEl, [...EA_DIAGRAM_GUID_ATTRS])?.trim();
  const xmiId = attrAny(diagramEl, ['xmi:id'])?.trim();
  const anyId = attrAny(diagramEl, [...EA_DIAGRAM_ID_ATTRS])?.trim();
  for (const v of [guid, xmiId, anyId]) {
    if (v && !vals.includes(v)) vals.push(v);
  }
  return vals;
}

function viewKeyCandidates(view: IRView): string[] {
  const vals: string[] = [];
  if (view.id) vals.push(view.id);
  for (const ex of view.externalIds ?? []) {
    if (ex?.id && !vals.includes(ex.id)) vals.push(ex.id);
  }
  return vals;
}

/**
 * Step B1b: parse EA diagram objects and their geometry into IRView.nodes, leaving element references unresolved.
 */
export function parseEaDiagramObjects(doc: Document, views: IRView[], report: ImportReport): ParseEaDiagramObjectsResult {
  if (!views.length) return { views };

  const extensions = qa(doc, 'extension').filter(isEaExtension);
  if (!extensions.length) return { views };

  // Build a fast lookup from any diagram id/guid/xmi:id -> diagram element.
  const diagramByKey = new Map<string, Element>();
  for (const ext of extensions) {
    const all = ext.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all.item(i);
      if (!el) continue;
      if (!isDiagramCandidate(el)) continue;
      for (const k of diagramKeyCandidates(el)) {
        if (!diagramByKey.has(k)) diagramByKey.set(k, el);
      }
    }
  }

  const nextViews: IRView[] = [];
  let synthCounter = 0;

  for (const v of views) {
    const keys = viewKeyCandidates(v);
    const diagramEl = keys.map((k) => diagramByKey.get(k)).find(Boolean) ?? null;
    if (!diagramEl) {
      report.warnings.push(`EA XMI: Could not find diagram element for view "${v.name}" (id="${v.id}"); leaving it empty.`);
      nextViews.push(v);
      continue;
    }

    // Scan for diagram-object candidates under this diagram.
    const objs: Element[] = [];
    const all = diagramEl.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all.item(i);
      if (!el) continue;
      if (isDiagramObjectCandidate(el)) objs.push(el);
    }

    const nodes: IRViewNode[] = [];
    const seenNodeIds = new Set<string>();

    for (const obj of objs) {
      synthCounter++;
      const { id, externalIds } = pickObjectId(obj, synthCounter);
      const nodeId = seenNodeIds.has(id) ? `${id}__dup_${synthCounter}` : id;
      if (seenNodeIds.has(id)) {
        report.warnings.push(`EA XMI: Duplicate diagram object id "${id}" in view "${v.name}"; disambiguated to "${nodeId}".`);
      }
      seenNodeIds.add(nodeId);

      const bounds = parseBounds(obj);
      const kind = nodeKindFromObject(obj);
      const refRaw = buildRefRaw(obj);

      nodes.push({
        id: nodeId,
        kind,
        bounds,
        ...(externalIds.length ? { externalIds } : {}),
        meta: {
          ...(v.meta ?? {}),
          sourceSystem: 'sparx-ea',
          refRaw
        }
      });
    }

    nextViews.push({
      ...v,
      nodes
    });
  }

  return { views: nextViews };
}

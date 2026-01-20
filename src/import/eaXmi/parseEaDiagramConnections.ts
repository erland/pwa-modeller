import type { ImportReport } from '../importReport';
import type { IRExternalId, IRPoint, IRView, IRViewConnection } from '../framework/ir';
import { attrAny, localName, qa } from '../framework/xml';

type ParseEaDiagramConnectionsResult = {
  views: IRView[];
};

const EA_EXTENDER_ATTRS = ['extender'] as const;

// Diagram ids
const EA_DIAGRAM_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid', 'uuid'] as const;
const EA_DIAGRAM_ID_ATTRS = ['xmi:id', 'xmi:idref', 'id', 'diagramid', 'diagram_id', 'diagramID'] as const;

// Diagram link ids
const EA_LINK_GUID_ATTRS = ['ea_guid', 'ea:guid', 'guid', 'uuid'] as const;
const EA_LINK_ID_ATTRS = ['xmi:id', 'id', 'linkid', 'link_id', 'diagramlinkid', 'diagram_link_id'] as const;

// Relationship reference on a diagram link
const EA_LINK_REL_ATTRS = [
  'connector',
  'connectorid',
  'connector_id',
  'relationship',
  'relationshipid',
  'relationship_id',
  'rel',
  'relid',
  'xmi:idref',
  'idref',
  'ref',
  'href'
] as const;

// Endpoint reference on a diagram link
const EA_LINK_SRC_ATTRS = ['source', 'sourceid', 'source_id', 'src', 'from', 'start', 'startid', 'start_id', 'object1', 'client'] as const;
const EA_LINK_TGT_ATTRS = ['target', 'targetid', 'target_id', 'tgt', 'to', 'end', 'endid', 'end_id', 'object2', 'supplier'] as const;

// Waypoint-ish attributes
const EA_LINK_POINTS_ATTRS = ['points', 'waypoints', 'bendpoint', 'bendpoints', 'path', 'route', 'routing', 'geometry'] as const;

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

function isDiagramLinkCandidate(el: Element): boolean {
  const ln = localName(el);
  if (ln === 'diagramlink' || ln === 'diagramconnector') return true;
  if (ln.endsWith('diagramlink') || ln.endsWith('diagramconnector')) return true;

  // EA can encode connectors inside <diagram><elements> as <element … subject="…" style="…EOID=…;SOID=…"/>
  // where subject points to the model connector id and EOID/SOID reference DUIDs of the endpoint nodes.
  if (ln === 'element') {
    const subject = (attrAny(el, ['subject']) ?? '').toString().trim();
    const style = (attrAny(el, ['style']) ?? '').toString();
    const geo = (attrAny(el, ['geometry']) ?? '').toString();
    const hasEndpoints = /\bEOID=[0-9A-Fa-f]+\b/.test(style) && /\bSOID=[0-9A-Fa-f]+\b/.test(style);
    const looksLikeEdge = geo.toLowerCase().includes('edge=') || geo.toLowerCase().includes('sx=') || geo.toLowerCase().includes('sy=');
    if (subject && hasEndpoints && looksLikeEdge) return true;
  }
  if (ln === 'link' || ln.endsWith('link')) {
    const hasRel = !!attrAny(el, [...EA_LINK_REL_ATTRS]);
    const hasPts = !!attrAny(el, [...EA_LINK_POINTS_ATTRS]);
    return hasRel || hasPts;
  }
  return false;
}

function parsePoints(raw: string | null | undefined): IRPoint[] | undefined {
  const s = (raw ?? '').trim();
  if (!s) return undefined;

  // Extract numeric tokens in order; pair them as x,y.
  const nums = s
    .split(/[^0-9.+-]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => Number(p))
    .filter((n) => Number.isFinite(n));

  if (nums.length < 4) return undefined;
  const pts: IRPoint[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i]!, y: nums[i + 1]! });
  }
  // Require at least 2 points to be meaningful.
  if (pts.length < 2) return undefined;
  return pts;
}

function pickLinkId(el: Element, synthIdx: number, report: ImportReport): { id: string; externalIds: IRExternalId[] } {
  const guid = attrAny(el, [...EA_LINK_GUID_ATTRS])?.trim();
  const xmiId = attrAny(el, ['xmi:id'])?.trim();
  const anyId = attrAny(el, [...EA_LINK_ID_ATTRS])?.trim();

  const externalIds: IRExternalId[] = [];
  if (xmiId) externalIds.push({ system: 'xmi', id: xmiId, kind: 'diagram-link-xmi-id' });
  if (guid) externalIds.push({ system: 'sparx-ea', id: guid, kind: 'diagram-link-guid' });
  if (anyId && anyId !== xmiId && anyId !== guid) externalIds.push({ system: 'sparx-ea', id: anyId, kind: 'diagram-link-id' });

  const picked = guid || xmiId || anyId;
  if (picked) return { id: picked, externalIds };

  // For <element … subject="EAID_…" style="…EOID…;SOID…"/> connectors, use the subject as a stable-ish id.
  const subject = (attrAny(el, ['subject']) ?? '').toString().trim();
  if (subject) {
    externalIds.push({ system: 'sparx-ea', id: subject, kind: 'diagram-link-subject' });
    return { id: subject, externalIds };
  }

  const id = `eaDiagramLink_synth_${synthIdx}`;
  report.warnings.push(`EA XMI: Diagram link missing id; generated synthetic link id "${id}".`);
  return { id, externalIds };
}

function buildRefRawFromAttrs(el: Element, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = attrAny(el, [k]);
    if (v != null && v.trim()) out[k] = v.trim();
  }
  return out;
}

function buildRefRaw(el: Element): Record<string, string> {
  const out: Record<string, string> = {
    ...buildRefRawFromAttrs(el, EA_LINK_REL_ATTRS),
    ...buildRefRawFromAttrs(el, EA_LINK_SRC_ATTRS),
    ...buildRefRawFromAttrs(el, EA_LINK_TGT_ATTRS)
  };

  // Connector-as-<element> form: subject is the relationship reference; endpoints are in the style string.
  const ln = localName(el);
  if (ln === 'element') {
    const subject = (attrAny(el, ['subject']) ?? '').toString().trim();
    if (subject) out.connector = subject;

    const style = (attrAny(el, ['style']) ?? '').toString();
    const soid = /\bSOID=([0-9A-Fa-f]+)\b/.exec(style)?.[1]?.trim();
    const eoid = /\bEOID=([0-9A-Fa-f]+)\b/.exec(style)?.[1]?.trim();

    // Normalize to the keys expected by the resolver.
    if (soid) out.source = soid;
    if (eoid) out.target = eoid;
  }

  // Also accept common child ref patterns: <source xmi:idref="…"/>
  for (const ch of Array.from(el.children)) {
    const ln = localName(ch);
    if (ln === 'source' || ln === 'from' || ln === 'start') {
      const ref = attrAny(ch, ['xmi:idref', 'idref', 'ref', 'href', 'xmi:id'])?.trim();
      if (ref) out.source = ref;
    }
    if (ln === 'target' || ln === 'to' || ln === 'end') {
      const ref = attrAny(ch, ['xmi:idref', 'idref', 'ref', 'href', 'xmi:id'])?.trim();
      if (ref) out.target = ref;
    }
    if (ln === 'connector' || ln === 'relationship') {
      const ref = attrAny(ch, ['xmi:idref', 'idref', 'ref', 'href', 'xmi:id'])?.trim();
      if (ref) out.connector = ref;
    }
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
 * Step B2b (part 1): Parse EA diagram links/connectors into IR view connections.
 *
 * Relationship matching and endpoint resolution is done later in normalizeEaXmiImportIR.
 */
export function parseEaDiagramConnections(doc: Document, views: IRView[], report: ImportReport): ParseEaDiagramConnectionsResult {
  if (!views.length) return { views };

  const extensions = qa(doc, 'extension').filter(isEaExtension);
  if (!extensions.length) return { views };

  // Build a lookup from diagram id/guid/xmi:id to diagram element.
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

  let synthCounter = 0;
  const nextViews: IRView[] = [];

  for (const v of views) {
    const diagramEl = viewKeyCandidates(v)
      .map((k) => diagramByKey.get(k))
      .find(Boolean) ?? null;

    if (!diagramEl) {
      nextViews.push(v);
      continue;
    }

    const links: Element[] = [];
    const all = diagramEl.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all.item(i);
      if (!el) continue;
      if (isDiagramLinkCandidate(el)) links.push(el);
    }

    const connections: IRViewConnection[] = [];
    const seenConnIds = new Set<string>();

    for (const link of links) {
      synthCounter++;
      const { id, externalIds } = pickLinkId(link, synthCounter, report);
      const connId = seenConnIds.has(id) ? `${id}__dup_${synthCounter}` : id;
      if (seenConnIds.has(id)) {
        report.warnings.push(`EA XMI: Duplicate diagram link id "${id}" in view "${v.name}"; disambiguated to "${connId}".`);
      }
      seenConnIds.add(connId);

      const ptsRaw = attrAny(link, [...EA_LINK_POINTS_ATTRS]);
      const points = parsePoints(ptsRaw);
      const refRaw = buildRefRaw(link);

      connections.push({
        id: connId,
        points,
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
      connections
    });
  }

  return { views: nextViews };
}

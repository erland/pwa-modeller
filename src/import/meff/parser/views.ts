import type { ImportReport } from '../../importReport';
import type { IRBounds, IRId, IRPoint, IRView, IRViewConnection, IRViewNode } from '../../framework/ir';

import { addWarning } from '../../importReport';
import { attrAny, childText, getType, isElementNode, localName } from '../../framework/xml';

import { findFirstByLocalName, hasDescendantWithLocalName } from './xmlScan';
import { parsePropertiesToRecord } from './properties';
import { parseTaggedValues } from './taggedValues';

function parseNumber(raw: string | null): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseBounds(el: Element): IRBounds | undefined {
  const tryFrom = (e: Element): IRBounds | undefined => {
    const x = parseNumber(attrAny(e, ['x', 'left', 'posx', 'posX']));
    const y = parseNumber(attrAny(e, ['y', 'top', 'posy', 'posY']));
    const w = parseNumber(attrAny(e, ['width', 'w']));
    const h = parseNumber(attrAny(e, ['height', 'h']));
    if (x == null || y == null || w == null || h == null) return undefined;
    return { x, y, width: w, height: h };
  };

  // First: attributes on the node itself.
  const direct = tryFrom(el);
  if (direct) return direct;

  // Second: a direct <bounds>/<geometry>/<rect> child.
  for (const c of Array.from(el.children)) {
    const ln = localName(c);
    if (ln === 'bounds' || ln === 'geometry' || ln === 'rect') {
      const b = tryFrom(c);
      if (b) return b;
    }
  }

  // Third: any descendant <bounds>/<geometry>/<rect>.
  const descendants = Array.from(el.getElementsByTagName('*')) as Element[];
  for (const d of descendants) {
    const ln = localName(d);
    if (ln === 'bounds' || ln === 'geometry' || ln === 'rect') {
      const b = tryFrom(d);
      if (b) return b;
    }
  }

  return undefined;
}

function parsePoints(el: Element): IRPoint[] | undefined {
  const out: IRPoint[] = [];
  const candidates = Array.from(el.getElementsByTagName('*')) as Element[];
  for (const c of candidates) {
    const ln = localName(c);
    if (ln !== 'point' && ln !== 'bendpoint' && ln !== 'waypoint') continue;

    const x = parseNumber(attrAny(c, ['x', 'posx', 'posX']));
    const y = parseNumber(attrAny(c, ['y', 'posy', 'posY']));
    if (x == null || y == null) continue;

    out.push({ x, y });
  }

  return out.length ? out : undefined;
}

function meffNodeKindFromType(rawType: string | null): { kind: IRViewNode['kind']; objectType?: 'Label' | 'Note' | 'GroupBox' } {
  const t = (rawType ?? '').toLowerCase();
  if (t.includes('note')) return { kind: 'note', objectType: 'Note' };
  if (t.includes('group')) return { kind: 'group', objectType: 'GroupBox' };
  if (t.includes('label')) return { kind: 'shape', objectType: 'Label' };
  return { kind: 'other', objectType: 'Label' };
}

/**
 * Parse views/diagrams from a MEFF document into IR views.
 */
export function parseViews(
  doc: Document,
  report: ImportReport,
  refToFolder: Map<IRId, IRId>,
  refToParentRef: Map<IRId, IRId>
): IRView[] {
  // Some exporters namespace/prefix the tags (e.g. <ns0:views>), so we must match localName.
  const viewsRoot = findFirstByLocalName(doc, ['views', 'diagrams']);

  if (!viewsRoot || !isElementNode(viewsRoot)) return [];

  const views: IRView[] = [];

  const isViewCandidate = (el: Element): boolean => {
    const ln = localName(el);
    if (ln !== 'view' && ln !== 'diagram') return false;
    const id = attrAny(el, ['identifier', 'id']);
    if (!id) return false;
    // Ensure it actually contains view content.
    // NOTE: do NOT use getElementsByTagName('node') because <ns0:node> won't match.
    const hasNodes = hasDescendantWithLocalName(el, ['node']);
    const hasConnections = hasDescendantWithLocalName(el, ['connection', 'edge']);
    return hasNodes || hasConnections;
  };

  const candidates = Array.from(viewsRoot.getElementsByTagName('*')) as Element[];
  const viewEls = candidates.filter(isViewCandidate);

  let autoViewId = 0;

  for (const vEl of viewEls) {
    const id = (attrAny(vEl, ['identifier', 'id']) ?? '').trim() || `view-auto-${++autoViewId}`;
    const name =
      (attrAny(vEl, ['name', 'label']) ?? childText(vEl, 'name') ?? childText(vEl, 'label') ?? '').trim() || 'View';
    const documentation = childText(vEl, 'documentation') ?? childText(vEl, 'documentationText') ?? undefined;

    const viewpoint =
      attrAny(vEl, ['viewpoint', 'viewpointid', 'viewpointId', 'viewpointref', 'viewpointRef']) ??
      childText(vEl, 'viewpoint') ??
      undefined;

    const folderId = refToFolder.get(id) ?? null;
    const owningElementId = refToParentRef.get(id) ?? undefined;

    const nodes: IRViewNode[] = [];
    const connections: IRViewConnection[] = [];

    let autoNodeId = 0;

    const parseNodeRec = (nodeEl: Element, parentNodeId: IRId | null) => {
      const nodeId =
        (attrAny(nodeEl, ['identifier', 'id']) ?? '').trim() ||
        (attrAny(nodeEl, ['elementref', 'elementRef', 'conceptref', 'conceptRef']) ?? '').trim() ||
        `node-auto-${++autoNodeId}`;

      const elementId =
        (attrAny(nodeEl, ['elementref', 'elementRef', 'conceptref', 'conceptRef', 'element', 'ref']) ??
          childText(nodeEl, 'elementRef') ??
          childText(nodeEl, 'conceptRef') ??
          null)?.trim() || undefined;

      const typeToken = getType(nodeEl);
      const label =
        (attrAny(nodeEl, ['label', 'name']) ??
          childText(nodeEl, 'label') ??
          childText(nodeEl, 'name') ??
          childText(nodeEl, 'text'))?.trim() || undefined;

      const bounds = parseBounds(nodeEl);
      const zIndex = parseNumber(attrAny(nodeEl, ['z', 'zindex', 'zIndex', 'order']));

      if (elementId) {
        nodes.push({
          id: nodeId,
          kind: 'element',
          elementId,
          parentNodeId,
          label,
          bounds,
          properties: parsePropertiesToRecord(nodeEl),
          taggedValues: parseTaggedValues(nodeEl),
          meta: {
            source: 'archimate-meff',
            ...(zIndex != null ? { zIndex } : {})
          }
        });
      } else {
        const kindInfo = meffNodeKindFromType(typeToken);
        nodes.push({
          id: nodeId,
          kind: kindInfo.kind,
          parentNodeId,
          label,
          bounds,
          properties: parsePropertiesToRecord(nodeEl),
          taggedValues: parseTaggedValues(nodeEl),
          meta: {
            source: 'archimate-meff',
            ...(kindInfo.objectType ? { objectType: kindInfo.objectType } : {}),
            ...(zIndex != null ? { zIndex } : {})
          }
        });
      }

      for (const c of Array.from(nodeEl.children)) {
        if (localName(c) === 'node') parseNodeRec(c, nodeId);
      }
    };

    // Parse top-level nodes (recursive for nested nodes).
    for (const c of Array.from(vEl.children)) {
      if (!isElementNode(c)) continue;
      if (localName(c) === 'node') parseNodeRec(c, null);
      // Some exporters wrap nodes in <nodes> container
      if (localName(c) === 'nodes') {
        for (const nn of Array.from(c.children)) {
          if (isElementNode(nn) && localName(nn) === 'node') parseNodeRec(nn, null);
        }
      }
    }

    let autoConnId = 0;
    const connCandidates = Array.from(vEl.getElementsByTagName('*')) as Element[];
    for (const cEl of connCandidates) {
      const ln = localName(cEl);
      if (ln !== 'connection' && ln !== 'edge' && ln !== 'relationship') continue;

      const relationshipId =
        (attrAny(cEl, ['relationshipref', 'relationshipRef', 'relationref', 'relationRef', 'ref']) ??
          childText(cEl, 'relationshipRef') ??
          childText(cEl, 'ref') ??
          null)?.trim() || undefined;

      const hasEndpoints =
        attrAny(cEl, ['source', 'target', 'sourcenode', 'targetnode', 'sourceRef', 'targetRef', 'sourceNode', 'targetNode']) != null;

      if (!relationshipId && !hasEndpoints) continue;

      const id =
        (attrAny(cEl, ['identifier', 'id']) ?? '').trim() ||
        (relationshipId ? `${relationshipId}#${++autoConnId}` : `conn-auto-${++autoConnId}`);

      const sourceNodeId =
        (attrAny(cEl, ['sourcenode', 'sourceNode', 'sourceNodeRef', 'sourceRef', 'source']) ?? null)?.trim() || undefined;
      const targetNodeId =
        (attrAny(cEl, ['targetnode', 'targetNode', 'targetNodeRef', 'targetRef', 'target']) ?? null)?.trim() || undefined;

      const sourceElementId = (attrAny(cEl, ['sourceelementref', 'sourceElementRef']) ?? null)?.trim() || undefined;
      const targetElementId = (attrAny(cEl, ['targetelementref', 'targetElementRef']) ?? null)?.trim() || undefined;

      const zIndex = parseNumber(attrAny(cEl, ['z', 'zindex', 'zIndex', 'order']));

      connections.push({
        id,
        relationshipId,
        sourceNodeId,
        targetNodeId,
        sourceElementId,
        targetElementId,
        label: (childText(cEl, 'label') ?? attrAny(cEl, ['label', 'name']) ?? undefined)?.trim() || undefined,
        points: parsePoints(cEl),
        properties: parsePropertiesToRecord(cEl),
        taggedValues: parseTaggedValues(cEl),
        meta: {
          source: 'archimate-meff',
          ...(zIndex != null ? { zIndex } : {})
        }
      });
    }
    views.push({
      id,
      name,
      documentation: documentation ?? undefined,
      folderId,
      viewpoint: viewpoint ?? undefined,
      nodes,
      connections,
      meta: {
        source: 'archimate-meff',
        ...(owningElementId ? { owningElementId } : {})
      }
    });
  }

  if (!views.length) {
    // Presence of <views> but no parseable <view> objects shouldn't be fatal, but it helps troubleshooting.
    addWarning(report, 'MEFF: Found <views> section, but did not recognize any <view> / <diagram> entries.');
  }

  return views;
}

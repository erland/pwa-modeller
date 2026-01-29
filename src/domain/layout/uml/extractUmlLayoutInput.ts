import type { AutoLayoutOptions, LayoutInput, LayoutEdgeInput, LayoutNodeInput } from '../types';
import type { Model, View, ViewNodeLayout, Relationship } from '../../types';

const DEFAULTS = {
  element: { width: 170, height: 90 },
  connector: { width: 26, height: 26 }
};

type BBox = { x: number; y: number; width: number; height: number };

function bboxContains(outer: BBox, inner: BBox, margin = 10): boolean {
  const ox1 = outer.x + margin;
  const oy1 = outer.y + margin;
  const ox2 = outer.x + outer.width - margin;
  const oy2 = outer.y + outer.height - margin;

  const ix1 = inner.x;
  const iy1 = inner.y;
  const ix2 = inner.x + inner.width;
  const iy2 = inner.y + inner.height;

  return ix1 >= ox1 && iy1 >= oy1 && ix2 <= ox2 && iy2 <= oy2;
}

function nodeIdFromLayoutNode(n: ViewNodeLayout): string | null {
  if (typeof n.elementId === 'string' && n.elementId.length > 0) return n.elementId;
  if (typeof n.connectorId === 'string' && n.connectorId.length > 0) return n.connectorId;
  // Ignore view-local objects (notes/labels/group boxes) for now
  return null;
}

function sizeForLayoutNode(n: ViewNodeLayout): { width: number; height: number } {
  const isConnector = Boolean(n.connectorId);
  const d = isConnector ? DEFAULTS.connector : DEFAULTS.element;
  const width = typeof n.width === 'number' ? n.width : d.width;
  const height = typeof n.height === 'number' ? n.height : d.height;
  return { width, height };
}

function edgeEndpointsFromRelationship(rel: Relationship): { sourceId: string; targetId: string } | null {
  const sourceId = rel.sourceElementId ?? rel.sourceConnectorId;
  const targetId = rel.targetElementId ?? rel.targetConnectorId;
  if (!sourceId || !targetId) return null;
  return { sourceId, targetId };
}

function edgeWeightForUmlRelationshipType(relType?: string): number {
  // v1 heuristics: keep "hierarchy" edges more stable.
  if (relType === 'uml.generalization' || relType === 'uml.realization') return 5;
  // Strong containment-ish relationships.
  if (relType === 'uml.composition' || relType === 'uml.aggregation') return 3;
  return 1;
}

function edgesFromConnections(model: Model, view: View, nodeIdSet: Set<string>): LayoutEdgeInput[] {
  const out: LayoutEdgeInput[] = [];
  const seen = new Set<string>();
  for (const c of view.connections ?? []) {
    const sourceId = c.source?.id;
    const targetId = c.target?.id;
    if (!sourceId || !targetId) continue;
    if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) continue;

    const id = c.id;
    if (seen.has(id)) continue;
    seen.add(id);

    const relType = model.relationships[c.relationshipId]?.type;
    const weight = edgeWeightForUmlRelationshipType(relType);
    out.push({ id, sourceId, targetId, weight, ...(relType ? { kind: relType } : {}) });
  }
  return out;
}

function edgesFromLegacyLayout(model: Model, view: View, nodeIdSet: Set<string>): LayoutEdgeInput[] {
  const relLayouts = view.layout?.relationships ?? [];
  const out: LayoutEdgeInput[] = [];
  const seen = new Set<string>();
  for (const r of relLayouts) {
    const rel = model.relationships[r.relationshipId];
    if (!rel) continue;
    const ep = edgeEndpointsFromRelationship(rel);
    if (!ep) continue;
    if (!nodeIdSet.has(ep.sourceId) || !nodeIdSet.has(ep.targetId)) continue;

    const id = r.relationshipId;
    if (seen.has(id)) continue;
    seen.add(id);
    const weight = edgeWeightForUmlRelationshipType(rel.type);
    out.push({ id, sourceId: ep.sourceId, targetId: ep.targetId, weight, kind: rel.type });
  }
  return out;
}

/**
 * UML auto-layout extraction (v1: packages as containers).
 *
 * - Converts element/connector nodes in the view into layout nodes.
 * - Converts view connections (or legacy relationship layouts) into layout edges.
 * - Models UML packages as containers (parentId) using geometry-based containment.
 */
export function extractUmlLayoutInput(
  model: Model,
  viewId: string,
  options: AutoLayoutOptions = {},
  selectionNodeIds?: string[]
): LayoutInput {
  const view = model.views[viewId];
  if (!view) throw new Error(`extractUmlLayoutInput: view not found: ${viewId}`);
  if (view.kind !== 'uml') throw new Error(`extractUmlLayoutInput: expected uml view, got: ${view.kind}`);

  const rawNodes = view.layout?.nodes ?? [];

  type RawNodeInfo = {
    id: string;
    bbox: BBox;
    kind?: string;
    label?: string;
    locked?: boolean;
    isPackage: boolean;
  };

  const rawInfos: RawNodeInfo[] = [];
  for (const n of rawNodes) {
    const id = nodeIdFromLayoutNode(n);
    if (!id) continue;
    const { width, height } = sizeForLayoutNode(n);

    const el = n.elementId ? model.elements[n.elementId] : undefined;
    const conn = n.connectorId ? model.connectors?.[n.connectorId] : undefined;
    const kind = el?.type;
    const label = el?.name ?? conn?.name;
    const isPackage = kind === 'uml.package';

    rawInfos.push({
      id,
      bbox: { x: n.x, y: n.y, width, height },
      ...(kind ? { kind } : {}),
      ...(label ? { label } : {}),
      ...(options.respectLocked && n.locked ? { locked: true } : {}),
      isPackage
    });
  }

  // Compute package containment by geometry (flat UML "full support": packages as containers).
  // If a node is inside multiple packages, pick the smallest containing package (deepest).
  const packages = rawInfos.filter((n) => n.isPackage);

  const parentById = new Map<string, string>();
  if (packages.length > 0) {
    for (const n of rawInfos) {
      // Connectors don't participate in package grouping.
      if (n.kind == null || n.kind === 'uml.note') continue;

      const candidates: Array<{ id: string; area: number }> = [];
      for (const p of packages) {
        if (p.id === n.id) continue;
        if (!bboxContains(p.bbox, n.bbox, 12)) continue;
        candidates.push({ id: p.id, area: p.bbox.width * p.bbox.height });
      }
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => a.area - b.area);
      parentById.set(n.id, candidates[0].id);
    }
  }

  const allNodes: LayoutNodeInput[] = rawInfos.map((n) => ({
    id: n.id,
    width: n.bbox.width,
    height: n.bbox.height,
    ...(n.kind ? { kind: n.kind } : {}),
    ...(n.label ? { label: n.label } : {}),
    ...(n.locked ? { locked: true } : {}),
    ...(parentById.has(n.id) ? { parentId: parentById.get(n.id) } : {})
  }));

  const wantedNodeIds =
    options.scope === 'selection' && Array.isArray(selectionNodeIds) && selectionNodeIds.length > 0
      ? new Set(selectionNodeIds)
      : null;

  let nodes = wantedNodeIds ? allNodes.filter((n) => wantedNodeIds.has(n.id)) : allNodes;
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  // If a selection scope excludes the parent container, drop parentId to avoid dangling references.
  if (nodes.some((n) => typeof n.parentId === 'string' && n.parentId.length > 0)) {
    nodes = nodes.map((n) => {
      if (!n.parentId) return n;
      if (nodeIdSet.has(n.parentId)) return n;
      return { ...n, parentId: undefined };
    });
  }

  const edges =
    (view.connections?.length ?? 0) > 0 ? edgesFromConnections(model, view, nodeIdSet) : edgesFromLegacyLayout(model, view, nodeIdSet);

  return { nodes, edges };
}

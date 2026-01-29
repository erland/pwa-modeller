import type { AutoLayoutOptions, LayoutInput, LayoutEdgeInput, LayoutNodeInput } from '../types';
import type { Model, View, ViewNodeLayout, Relationship } from '../../types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Rect = { x: number; y: number; w: number; h: number };

function rectContains(a: Rect, b: Rect, padding = 0): boolean {
  return (
    b.x >= a.x + padding &&
    b.y >= a.y + padding &&
    b.x + b.w <= a.x + a.w - padding &&
    b.y + b.h <= a.y + a.h - padding
  );
}

function rectFromLayoutNode(n: ViewNodeLayout): Rect {
  return { x: n.x, y: n.y, w: n.width, h: n.height };
}

function isBpmnPoolType(t: string | undefined): boolean {
  return t === 'bpmn.pool';
}

function isBpmnLaneType(t: string | undefined): boolean {
  return t === 'bpmn.lane';
}

function isBpmnSubProcessType(t: string | undefined): boolean {
  return t === 'bpmn.subProcess';
}

const DEFAULTS = {
  element: { width: 160, height: 80 },
  connector: { width: 26, height: 26 }
};

const PORT_ID = {
  N: (nodeId: string) => `${nodeId}:N`,
  E: (nodeId: string) => `${nodeId}:E`,
  S: (nodeId: string) => `${nodeId}:S`,
  W: (nodeId: string) => `${nodeId}:W`
} as const;

function addDefaultPorts(node: LayoutNodeInput): void {
  // A simple 4-side port model gives ELK enough signal to improve routing/ordering.
  node.ports = [
    { id: PORT_ID.N(node.id), side: 'N' },
    { id: PORT_ID.E(node.id), side: 'E' },
    { id: PORT_ID.S(node.id), side: 'S' },
    { id: PORT_ID.W(node.id), side: 'W' }
  ];
}

function edgePortHints(kind: string | undefined): { sourceSide?: 'N' | 'E' | 'S' | 'W'; targetSide?: 'N' | 'E' | 'S' | 'W' } {
  const k = (kind ?? '').toLowerCase();
  // Sequence flows typically read left-to-right.
  if (k.includes('sequence')) return { sourceSide: 'E', targetSide: 'W' };
  // Message flows are often shown vertically to reduce crossings.
  if (k.includes('message')) return { sourceSide: 'S', targetSide: 'N' };
  // Generic flows (but not message) lean horizontal.
  if (k.includes('flow') && !k.includes('message')) return { sourceSide: 'E', targetSide: 'W' };
  return {};
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
    const hints = edgePortHints(relType);
    out.push({
      id,
      sourceId,
      targetId,
      weight: 1,
      ...(relType ? { kind: relType } : {}),
      ...(hints.sourceSide ? { sourcePortId: PORT_ID[hints.sourceSide](sourceId) } : {}),
      ...(hints.targetSide ? { targetPortId: PORT_ID[hints.targetSide](targetId) } : {})
    });
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
    const hints = edgePortHints(rel.type);
    out.push({
      id,
      sourceId: ep.sourceId,
      targetId: ep.targetId,
      weight: 1,
      kind: rel.type,
      ...(hints.sourceSide ? { sourcePortId: PORT_ID[hints.sourceSide](ep.sourceId) } : {}),
      ...(hints.targetSide ? { targetPortId: PORT_ID[hints.targetSide](ep.targetId) } : {})
    });
  }
  return out;
}

/**
 * BPMN auto-layout extraction.
 *
 * v1 (flat) extracts a simple graph.
 * v2 ("full") additionally emits `parentId` for containment:
 * - Pools contain Lanes (by geometry in the view)
 * - Lanes contain flow nodes (by semantic lane.flowNodeRefs, falling back to geometry)
 * - Sub-processes contain nodes drawn inside them (by geometry)
 */
export function extractBpmnLayoutInput(
  model: Model,
  viewId: string,
  options: AutoLayoutOptions = {},
  selectionNodeIds?: string[]
): LayoutInput {
  const view = model.views[viewId];
  if (!view) throw new Error(`extractBpmnLayoutInput: view not found: ${viewId}`);
  if (view.kind !== 'bpmn') throw new Error(`extractBpmnLayoutInput: expected bpmn view, got: ${view.kind}`);

  const rawNodes = view.layout?.nodes ?? [];

  const rawById = new Map<string, ViewNodeLayout>();
  const allNodes: LayoutNodeInput[] = [];

  // Pre-collect so we can compute containment parentId.
  for (const n of rawNodes) {
    const id = nodeIdFromLayoutNode(n);
    if (!id) continue;
    rawById.set(id, n);
    const { width, height } = sizeForLayoutNode(n);

    // Optional, but useful for downstream heuristics.
    const el = n.elementId ? model.elements[n.elementId] : undefined;
    const conn = n.connectorId ? model.connectors?.[n.connectorId] : undefined;

    const node: LayoutNodeInput = {
      id,
      width,
      height,
      ...(el ? { kind: el.type, label: el.name } : {}),
      ...(conn?.name ? { label: conn.name } : {}),
      ...(options.respectLocked && n.locked ? { locked: true } : {})
    };
    addDefaultPorts(node);
    allNodes.push(node);
  }

  // ------------------------------
  // Containment (Pools/Lanes/SubProcess)
  // ------------------------------
  const nodeById = new Map<string, LayoutNodeInput>();
  for (const n of allNodes) nodeById.set(n.id, n);

  const elementTypeById = (id: string): string | undefined => {
    const raw = rawById.get(id);
    if (!raw?.elementId) return undefined;
    return model.elements[raw.elementId]?.type;
  };

  const elementAttrsById = (id: string): Record<string, unknown> => {
    const raw = rawById.get(id);
    if (!raw?.elementId) return {};
    const el = model.elements[raw.elementId];
    return isRecord(el?.attrs) ? (el!.attrs as Record<string, unknown>) : {};
  };

  const poolIds = allNodes
    .map((n) => n.id)
    .filter((id) => isBpmnPoolType(elementTypeById(id)));
  const laneIds = allNodes
    .map((n) => n.id)
    .filter((id) => isBpmnLaneType(elementTypeById(id)));
  const subProcessIds = allNodes
    .map((n) => n.id)
    .filter((id) => isBpmnSubProcessType(elementTypeById(id)));

  const rectById = (id: string): Rect | null => {
    const raw = rawById.get(id);
    if (!raw) return null;
    return rectFromLayoutNode(raw);
  };

  const area = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);

  const findSmallestContaining = (containerIds: string[], childId: string, padding = 0): string | null => {
    const childRect = rectById(childId);
    if (!childRect) return null;
    let best: { id: string; area: number } | null = null;
    for (const cid of containerIds) {
      if (cid === childId) continue;
      const cr = rectById(cid);
      if (!cr) continue;
      if (!rectContains(cr, childRect, padding)) continue;
      const a = area(cr);
      if (!best || a < best.area) best = { id: cid, area: a };
    }
    return best?.id ?? null;
  };

  // 1) Lanes belong to Pools (by geometry).
  for (const laneId of laneIds) {
    const parentPool = findSmallestContaining(poolIds, laneId, 0);
    if (parentPool) {
      const n = nodeById.get(laneId);
      if (n) n.parentId = parentPool;
    }
  }

  // 2) Map lane.flowNodeRefs -> laneId for quick semantic assignment.
  const laneOfNode = new Map<string, string>();
  for (const laneId of laneIds) {
    const attrs = elementAttrsById(laneId);
    const flowNodeRefs = Array.isArray(attrs.flowNodeRefs) ? (attrs.flowNodeRefs as unknown[]).map(String) : [];
    for (const nid of flowNodeRefs) {
      // Keep first lane stable to avoid churn.
      if (!laneOfNode.has(nid)) laneOfNode.set(nid, laneId);
    }
  }

  // 3) Assign parentId for non-container nodes.
  for (const n of allNodes) {
    // Ignore connectors and view-local objects.
    const raw = rawById.get(n.id);
    if (!raw?.elementId) continue;

    const t = elementTypeById(n.id);
    const isPool = isBpmnPoolType(t);
    const isLane = isBpmnLaneType(t);

    // Pools already done; lanes done; everything else can be a child.
    if (isPool) continue;

    // a) Subprocess containment wins (if node is drawn inside a subprocess).
    const subParent = findSmallestContaining(subProcessIds, n.id, 6);
    if (subParent && subParent !== n.id) {
      n.parentId = subParent;
      continue;
    }

    // b) Lane membership (semantic first, then geometry).
    const laneParent = laneOfNode.get(n.id) ?? findSmallestContaining(laneIds, n.id, 4);
    if (laneParent && laneParent !== n.id) {
      n.parentId = laneParent;
      continue;
    }

    // c) If there are pools but no lanes, allow flow nodes to attach directly to a pool.
    const poolParent = findSmallestContaining(poolIds, n.id, 2);
    if (poolParent && poolParent !== n.id) {
      n.parentId = poolParent;
      continue;
    }

    // d) Lanes themselves can be members of a pool; if a lane wasn't geometrically inside a pool,
    // leave it top-level.
    if (isLane) continue;
  }

  const wantedNodeIds =
    options.scope === 'selection' && Array.isArray(selectionNodeIds) && selectionNodeIds.length > 0
      ? new Set(selectionNodeIds)
      : null;

  const nodes = wantedNodeIds ? allNodes.filter((n) => wantedNodeIds.has(n.id)) : allNodes;
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  const edges =
    (view.connections?.length ?? 0) > 0 ? edgesFromConnections(model, view, nodeIdSet) : edgesFromLegacyLayout(model, view, nodeIdSet);

  return { nodes, edges };
}

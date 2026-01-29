import type { AutoLayoutOptions, LayoutInput, LayoutEdgeInput, LayoutNodeInput } from '../types';
import type { Model, View, ViewNodeLayout, Relationship } from '../../types';

const DEFAULTS = {
  element: { width: 160, height: 80 },
  connector: { width: 26, height: 26 }
};

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
    out.push({ id, sourceId, targetId, weight: 1, ...(relType ? { kind: relType } : {}) });
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
    out.push({ id, sourceId: ep.sourceId, targetId: ep.targetId, weight: 1, kind: rel.type });
  }
  return out;
}

/**
 * BPMN auto-layout extraction (v1: flat).
 *
 * - Converts element/connector nodes in the view into layout nodes.
 * - Converts view connections (or legacy relationship layouts) into layout edges.
 * - Ignores BPMN containers (pools/lanes/subprocesses) for now — those come in the "full" step.
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

  const allNodes: LayoutNodeInput[] = [];
  for (const n of rawNodes) {
    const id = nodeIdFromLayoutNode(n);
    if (!id) continue;
    const { width, height } = sizeForLayoutNode(n);

    // Optional, but useful for downstream heuristics.
    const el = n.elementId ? model.elements[n.elementId] : undefined;
    const conn = n.connectorId ? model.connectors?.[n.connectorId] : undefined;

    allNodes.push({
      id,
      width,
      height,
      ...(el ? { kind: el.type, label: el.name } : {}),
      ...(conn?.name ? { label: conn.name } : {}),
      ...(options.respectLocked && n.locked ? { locked: true } : {})
    });
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

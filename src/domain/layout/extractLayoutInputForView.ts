import type { AutoLayoutOptions, LayoutInput, LayoutEdgeInput, LayoutNodeInput } from './types';
import type { Model, View, ViewNodeLayout, Relationship } from '../types';
import { extractArchiMateLayoutInput } from './archimate/extractArchiMateLayoutInput';
import { extractBpmnLayoutInput } from './bpmn/extractBpmnLayoutInput';
import { extractUmlLayoutInput } from './uml/extractUmlLayoutInput';
import { normalizeLayoutInput } from './normalizeLayoutInput';

const DEFAULTS_BY_KIND: Record<View['kind'], { element: { width: number; height: number }; connector: { width: number; height: number } }> = {
  archimate: { element: { width: 120, height: 60 }, connector: { width: 24, height: 24 } },
  bpmn: { element: { width: 160, height: 80 }, connector: { width: 26, height: 26 } },
  uml: { element: { width: 170, height: 90 }, connector: { width: 26, height: 26 } }
};

function dedupSelection(selectionNodeIds?: string[]): string[] {
  if (!Array.isArray(selectionNodeIds) || selectionNodeIds.length === 0) return [];
  return Array.from(new Set(selectionNodeIds.filter((id) => typeof id === 'string' && id.length > 0))).sort((a, b) => a.localeCompare(b));
}

function nodeIdFromLayoutNode(n: ViewNodeLayout): string | null {
  if (typeof n.elementId === 'string' && n.elementId.length > 0) return n.elementId;
  if (typeof n.connectorId === 'string' && n.connectorId.length > 0) return n.connectorId;
  // Ignore view-local objects (notes/labels/group boxes) for now
  return null;
}

function sizeForLayoutNode(
  n: ViewNodeLayout,
  defaults: { element: { width: number; height: number }; connector: { width: number; height: number } }
): { width: number; height: number } {
  const isConnector = Boolean(n.connectorId);
  const d = isConnector ? defaults.connector : defaults.element;
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

function edgesFromConnections(view: View, nodeIdSet: Set<string>): LayoutEdgeInput[] {
  const out: LayoutEdgeInput[] = [];
  const seen = new Set<string>();
  for (const c of view.connections ?? []) {
    const sourceId = c.source?.id;
    const targetId = c.target?.id;
    if (!sourceId || !targetId) continue;
    if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) continue;

    const id = c.id || c.relationshipId;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, sourceId, targetId, weight: 1 });
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
    out.push({ id, sourceId: ep.sourceId, targetId: ep.targetId, weight: 1 });
  }
  return out;
}

export function extractGenericLayoutInput(
  model: Model,
  viewId: string,
  options: AutoLayoutOptions = {},
  selectionNodeIds?: string[]
): LayoutInput {
  const view = model.views[viewId];
  if (!view) throw new Error(`extractGenericLayoutInput: view not found: ${viewId}`);

  const defaults = DEFAULTS_BY_KIND[view.kind] ?? DEFAULTS_BY_KIND.archimate;
  const rawNodes = view.layout?.nodes ?? [];

  const allNodes: LayoutNodeInput[] = [];
  for (const n of rawNodes) {
    const id = nodeIdFromLayoutNode(n);
    if (!id) continue;
    const { width, height } = sizeForLayoutNode(n, defaults);
    allNodes.push({
      id,
      width,
      height,
      ...(options.respectLocked && n.locked ? { locked: true } : {})
    });
  }

  const selection = dedupSelection(selectionNodeIds);

  const wantedNodeIds = options.scope === 'selection' && selection.length > 0 ? new Set(selection) : null;

  const nodes = wantedNodeIds ? allNodes.filter((n) => wantedNodeIds.has(n.id)) : allNodes;
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  const edges =
    (view.connections?.length ?? 0) > 0 ? edgesFromConnections(view, nodeIdSet) : edgesFromLegacyLayout(model, view, nodeIdSet);

  return normalizeLayoutInput({ nodes, edges });
}

/**
 * Dispatcher that extracts a layout graph based on view kind.
 *
 * - ArchiMate uses ArchiMate-specific policy hints (layer/group/edge weights).
 * - BPMN/UML use notation-specific extractors.
 */
export function extractLayoutInputForView(
  model: Model,
  viewId: string,
  options: AutoLayoutOptions = {},
  selectionNodeIds?: string[]
): LayoutInput {
  const view = model.views[viewId];
  if (!view) throw new Error(`extractLayoutInputForView: view not found: ${viewId}`);

  const selection = dedupSelection(selectionNodeIds);

  let input: LayoutInput;
  if (view.kind === 'archimate') {
    input = extractArchiMateLayoutInput(model, viewId, options, selection);
  } else if (view.kind === 'bpmn') {
    input = extractBpmnLayoutInput(model, viewId, options, selection);
  } else if (view.kind === 'uml') {
    input = extractUmlLayoutInput(model, viewId, options, selection);
  } else {
    input = extractGenericLayoutInput(model, viewId, options, selection);
  }

  // Optional, non-mutating "keep my manual positions" behavior.
  if (options.lockSelection && selection.length > 0) {
    const locked = new Set(selection);
    input = {
      ...input,
      nodes: input.nodes.map((n) => (locked.has(n.id) ? { ...n, locked: true } : n))
    };
  }

  return normalizeLayoutInput(input);
}

import type { Model, ViewNodeLayout } from '../../../domain';
import type { PptxDiagramIR, PptxEdgeIR, PptxNodeIR } from '../ir/types';
import type { PptxPostProcessMeta } from '../pptxPostProcessMeta';

export type ModelViewToIrResult = { handled: boolean; diagram?: PptxDiagramIR; meta?: PptxPostProcessMeta; note?: string };

/**
 * Build a PPTX Diagram IR from a model workspace view (layout nodes + view connections).
 *
 * This does NOT render anything; it only maps model/view data to a stable IR,
 * plus post-process meta used to rebuild PPTX connectors.
 */
export function modelViewToPptxDiagramIR(
  model: Model,
  viewId: string,
  env: { pageW: number; pageH: number },
): ModelViewToIrResult {
  const view = model.views[viewId];
  if (!view?.layout) return { handled: false, note: 'Missing view/layout.' };

  const nodes = view.layout.nodes ?? [];
  const connections = view.connections ?? [];

  if (nodes.length === 0) return { handled: false, note: 'No nodes in view.' };

  // Compute bounds for fitting to slide.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  // Include routed points if present (so we don't clip long edges)
  for (const cxn of connections) {
    for (const p of cxn.points ?? []) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return { handled: false, note: 'Invalid bounds.' };
  }

  const marginIn = 0.5;
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const scale = Math.min((env.pageW - marginIn * 2) / contentW, (env.pageH - marginIn * 2) / contentH);

  const pxToIn = (v: number) => v * scale;
  const xToIn = (x: number) => marginIn + pxToIn(x - minX);
  const yToIn = (y: number) => marginIn + pxToIn(y - minY);

  // Map view nodes → IR nodes
  const irNodes: PptxNodeIR[] = [];
  const metaNodes: PptxPostProcessMeta['nodes'] = [];

  // Endpoint ref -> chosen view-node id (best effort)
  const endpointToNodeId = new Map<string, string>();

  for (const n of nodes) {
    const nodeId = viewNodeStableId(n, irNodes.length);
    const element = n.elementId ? model.elements[n.elementId] : undefined;
    const connector = n.connectorId ? model.connectors?.[n.connectorId] : undefined;
    const label = element?.name ?? connector?.name ?? nodeId;

    const x = xToIn(n.x);
    const y = yToIn(n.y);
    const w = pxToIn(n.width);
    const h = pxToIn(n.height);

    irNodes.push({
      id: nodeId,
      x,
      y,
      w,
      h,
      shape: 'roundRect',
      text: label,
      fill: 'FFFFFF',
      stroke: '333333',
      strokeWidth: 1,
      textColor: '111111',
    });

    if (n.elementId) endpointToNodeId.set(`element:${n.elementId}`, nodeId);
    if (n.connectorId) endpointToNodeId.set(`connector:${n.connectorId}`, nodeId);

    // IMPORTANT: Post-process uses `nodes[].elementId` as the primary key for connector attachment.
    // Use the *view-stable node id* here so `edges[].fromNodeId/toNodeId` can reference it consistently.
    metaNodes.push({
      elementId: nodeId,
      name: label,
      typeLabel: element?.type ?? connector?.type,
      rectIn: { x, y, w, h },
      fillHex: 'FFFFFF',
      strokeHex: '333333',
      textHex: '111111',
    });
  }

  // Map view connections → IR edges (connector mode by default)
  const irEdges: PptxEdgeIR[] = [];
  const metaEdges: PptxPostProcessMeta['edges'] = [];

  for (const cxn of connections) {
    const rel = model.relationships[cxn.relationshipId];
    const fromNodeId = endpointToNodeId.get(`${cxn.source.kind}:${cxn.source.id}`);
    const toNodeId = endpointToNodeId.get(`${cxn.target.kind}:${cxn.target.id}`);
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) continue;

    const edgeId = cxn.id;
    const dashed = false;

    irEdges.push({
      id: edgeId,
      kind: 'connector',
      fromId: fromNodeId,
      toId: toNodeId,
      label: rel?.name ?? undefined,
      stroke: '333333',
      strokeWidth: 1,
      dashed,
      relType: rel?.type,
      linePattern: dashed ? 'dashed' : 'solid',
      markerEnd: 'arrow',
      pptxHeadEnd: 'arrow',
      pptxTailEnd: 'none',
    });

    // Use centers as preferred endpoints for now.
    const fromN = irNodes.find((n) => n.id === fromNodeId);
    const toN = irNodes.find((n) => n.id === toNodeId);
    const x1In = fromN ? fromN.x + fromN.w / 2 : 0;
    const y1In = fromN ? fromN.y + fromN.h / 2 : 0;
    const x2In = toN ? toN.x + toN.w / 2 : 0;
    const y2In = toN ? toN.y + toN.h / 2 : 0;

    // Placeholder line rect (writer uses it for markers, so approximate bbox here)
    const rx = Math.min(x1In, x2In);
    const ry = Math.min(y1In, y2In);
    const rw = Math.max(0.01, Math.abs(x2In - x1In));
    const rh = Math.max(0.01, Math.abs(y2In - y1In));

    metaEdges.push({
      edgeId,
      fromNodeId,
      toNodeId,
      relType: rel?.type,
      dashed,
      linePattern: dashed ? 'dashed' : 'solid',
      markerStart: undefined,
      markerEnd: 'arrow',
      pptxHeadEnd: 'arrow',
      pptxTailEnd: 'none',
      strokeHex: '333333',
      strokeWidthPt: 1,
      x1In,
      y1In,
      x2In,
      y2In,
      rectIn: { x: rx, y: ry, w: rw, h: rh },
    });
  }

  const diagram: PptxDiagramIR = { nodes: irNodes, edges: irEdges };

  const meta: PptxPostProcessMeta = {
    nodes: metaNodes,
    edges: metaEdges,
  };

  return { handled: true, diagram, meta };
}

function viewNodeStableId(n: ViewNodeLayout, index: number): string {
  if (n.elementId) return `el:${n.elementId}`;
  if (n.connectorId) return `cx:${n.connectorId}`;
  if (n.objectId) return `obj:${n.objectId}`;
  return `node:${index}`;
}

import type { IRPoint, IRViewConnection, IRViewNode, IRBounds } from '../../framework/ir';

import { ensureViewComplete } from '../../framework/ensureViewComplete';

import { applyContainerZOrder } from '../../../diagram/zOrder/applyContainerZOrder';

import { attr, childByLocalName, childrenByLocalName, localName, numberAttr, q, qa } from '../xml';

import type { ParseContext } from './context';

function isBpmnContainerType(t: string | undefined): boolean {
  return t === 'bpmn.pool' || t === 'bpmn.lane';
}

function isBpmnVisualElementType(t: string | undefined): boolean {
  if (!t) return false;
  if (!t.startsWith('bpmn.')) return false;

  // Exclude global definitions (they belong in the model tree, not on diagrams).
  switch (t) {
    case 'bpmn.message':
    case 'bpmn.signal':
    case 'bpmn.error':
    case 'bpmn.escalation':
    case 'bpmn.dataObject':
    case 'bpmn.dataStore':
    case 'bpmn.process':
      return false;
    default:
      return true;
  }
}

function defaultSizeForBpmnType(t: string | undefined): { width: number; height: number } {
  switch (t) {
    case 'bpmn.startEvent':
    case 'bpmn.endEvent':
    case 'bpmn.intermediateCatchEvent':
    case 'bpmn.intermediateThrowEvent':
    case 'bpmn.boundaryEvent':
      return { width: 36, height: 36 };
    case 'bpmn.gatewayExclusive':
    case 'bpmn.gatewayParallel':
    case 'bpmn.gatewayInclusive':
    case 'bpmn.gatewayEventBased':
      return { width: 50, height: 50 };
    case 'bpmn.subProcess':
      return { width: 220, height: 120 };
    case 'bpmn.textAnnotation':
      return { width: 180, height: 70 };
    case 'bpmn.dataObjectReference':
    case 'bpmn.dataStoreReference':
      return { width: 140, height: 60 };
    case 'bpmn.pool':
      return { width: 1200, height: 420 };
    case 'bpmn.lane':
      return { width: 1100, height: 180 };
    default:
      // Tasks and other activities
      return { width: 160, height: 70 };
  }
}

function ensureViewShowsAllBpmnElements(
  nodes: IRViewNode[],
  connections: IRViewConnection[],
  ctx: Pick<ParseContext, 'elements' | 'relationships' | 'elementById'>
) {
  const { elements, relationships, elementById } = ctx;

  // Semantic containment: lane -> flow nodes (via lane.attrs.flowNodeRefs)
  // This lets us place DI-missing nodes into the correct lane when possible.
  const preferredLaneByFlowNodeId = new Map<string, string>();
  for (const e of elements) {
    if (e.type !== 'bpmn.lane') continue;
    const refs = (e as any).attrs?.flowNodeRefs;
    if (!Array.isArray(refs)) continue;
    for (const r of refs) {
      if (typeof r !== 'string' || !r.trim()) continue;
      if (!preferredLaneByFlowNodeId.has(r)) preferredLaneByFlowNodeId.set(r, e.id);
    }
  }

  ensureViewComplete(
    nodes,
    connections,
    { elements, relationships, elementById },
    {
      isVisualElementType: isBpmnVisualElementType,
      defaultSizeForType: defaultSizeForBpmnType,
      isContainerElementType: isBpmnContainerType,
      containerPriority: (t) => (t === 'bpmn.lane' ? 0 : t === 'bpmn.pool' ? 1 : 2),
      preferredContainerIdByElementId: preferredLaneByFlowNodeId,
      enableNeighborVoting: true,
      enableAutoConnections: true,
      skipAutoplaceContainers: true,
      autoIdPrefix: 'auto:'
    }
  );
}

export function parseViews(ctx: ParseContext) {
  const { defs, warnings, views, elementById, relById, elements, relationships } = ctx;

  // Views (BPMNDI)
  // If BPMNDI is present, recreate diagram layout using BPMNShape bounds and BPMNEdge waypoints.
  const diagrams = qa(defs, 'BPMNDiagram');

  const parseBounds = (boundsEl: Element | null, context: string): IRBounds | undefined => {
    if (!boundsEl) return undefined;
    const x = numberAttr(boundsEl, 'x', warnings, context);
    const y = numberAttr(boundsEl, 'y', warnings, context);
    const width = numberAttr(boundsEl, 'width', warnings, context);
    const height = numberAttr(boundsEl, 'height', warnings, context);
    if (x == null || y == null || width == null || height == null) return undefined;
    return { x, y, width, height };
  };

  const parseWaypoints = (edgeEl: Element, context: string): IRPoint[] | undefined => {
    const wps = childrenByLocalName(edgeEl, 'waypoint');
    const points: IRPoint[] = [];
    for (let i = 0; i < wps.length; i++) {
      const wp = wps[i];
      const x = numberAttr(wp, 'x', warnings, `${context} waypoint[${i}]`);
      const y = numberAttr(wp, 'y', warnings, `${context} waypoint[${i}]`);
      if (x == null || y == null) continue;
      points.push({ x, y });
    }
    return points.length >= 2 ? points : undefined;
  };

  if (diagrams.length > 0) {
    let diIndex = 0;
    for (const diagramEl of diagrams) {
      diIndex++;
      const diagramIdRaw = (attr(diagramEl, 'id') ?? '').trim();
      const diagramNameRaw = (attr(diagramEl, 'name') ?? '').trim();

      const plane = childByLocalName(diagramEl, 'BPMNPlane');
      if (!plane) {
        warnings.push(`BPMNDiagram ${diagramIdRaw || diIndex} is missing BPMNPlane (skipped).`);
        continue;
      }

      const planeRef = (attr(plane, 'bpmnElement') ?? '').trim();
      const viewId = diagramIdRaw || (planeRef ? `bpmndi:${planeRef}` : `bpmndi:diagram:${diIndex}`);

      const inferredName =
        diagramNameRaw ||
        (planeRef && elementById.get(planeRef)?.name ? `${elementById.get(planeRef)!.name}` : '') ||
        (planeRef ? `Diagram (${planeRef})` : `Diagram ${diIndex}`);

      const nodes: IRViewNode[] = [];
      const connections: IRViewConnection[] = [];

      // Shapes
      const shapes = qa(plane, 'BPMNShape');
      for (const shape of shapes) {
        const shapeId = (attr(shape, 'id') ?? '').trim();
        const bpmnElementId = (attr(shape, 'bpmnElement') ?? '').trim();
        const boundsEl = q(shape, 'Bounds');
        const bounds = parseBounds(boundsEl, `BPMNShape ${shapeId || bpmnElementId || '(no-id)'}`);

        if (!bpmnElementId) {
          // No referenced BPMN element. Keep as a view-local note/label if bounds exist.
          if (bounds) {
            nodes.push({
              id: shapeId || `shape:${diIndex}:${nodes.length + 1}`,
              kind: 'note',
              bounds
            });
          }
          continue;
        }

        if (!elementById.has(bpmnElementId)) {
          warnings.push(`BPMNShape references unknown element '${bpmnElementId}' (skipped).`);
          continue;
        }

        nodes.push({
          id: shapeId || `shape:${bpmnElementId}`,
          kind: 'element',
          elementId: bpmnElementId,
          bounds
        });
      }

      // Edges
      const edges = qa(plane, 'BPMNEdge');
      for (const edge of edges) {
        const edgeId = (attr(edge, 'id') ?? '').trim();
        const bpmnRelId = (attr(edge, 'bpmnElement') ?? '').trim();
        if (!bpmnRelId) continue;
        if (!relById.has(bpmnRelId)) {
          warnings.push(`BPMNEdge references unknown relationship '${bpmnRelId}' (skipped).`);
          continue;
        }

        const points = parseWaypoints(edge, `BPMNEdge ${edgeId || bpmnRelId}`);

        connections.push({
          id: edgeId || `edge:${bpmnRelId}`,
          relationshipId: bpmnRelId,
          points
        });
      }

      // If the BPMN file contains partial BPMNDI (common), auto-place missing nodes and add
      // basic straight-line connections so the diagram shows the full model.
      ensureViewShowsAllBpmnElements(nodes, connections, { elements, relationships, elementById });

      // Ensure background containers (pool/lane) do not hide connections or nested nodes.
      applyContainerZOrder(nodes, elementById, isBpmnContainerType);

      views.push({
        id: viewId,
        name: inferredName,
        viewpoint: 'bpmn-process',
        nodes,
        connections,
        externalIds: [{ system: 'bpmn2', id: viewId, kind: 'diagram' }],
        meta: {
          sourceLocalName: localName(diagramEl),
          planeRef: planeRef || undefined
        }
      });
    }
  }
}

export function addFallbackAutoLayoutView(ctx: ParseContext) {
  const { elements, relationships, views, elementById } = ctx;

  if (views.length === 0) {
    // Fallback: create a single auto-layout view.
    const gridW = 220;
    const gridH = 140;
    const nodeW = 140;
    const nodeH = 80;

    const nodes: IRViewNode[] = elements.map((e, i) => ({
      id: `auto:${e.id}`,
      kind: 'element',
      elementId: e.id,
      bounds: {
        x: (i % 8) * gridW,
        y: Math.floor(i / 8) * gridH,
        width: nodeW,
        height: nodeH
      }
    }));

    applyContainerZOrder(nodes, elementById, isBpmnContainerType);

    const connections: IRViewConnection[] = relationships.map((r) => ({
      id: `auto:${r.id}`,
      relationshipId: r.id
    }));

    views.push({
      id: 'bpmn2:auto',
      name: 'BPMN (auto layout)',
      viewpoint: 'bpmn-process',
      nodes,
      connections,
      externalIds: [{ system: 'bpmn2', id: 'bpmn2:auto', kind: 'diagram' }]
    });
  }
}

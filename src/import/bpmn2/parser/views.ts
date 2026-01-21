import type { IRElement, IRPoint, IRViewConnection, IRViewNode, IRBounds } from '../../framework/ir';

import { attr, childByLocalName, childrenByLocalName, localName, numberAttr, q, qa } from '../xml';

import type { ParseContext } from './context';

function applyBpmnZOrder(nodes: IRViewNode[], elementById: Map<string, IRElement>) {
  type Info = { node: IRViewNode; area: number; isContainer: boolean; key: string };
  const infos: Info[] = nodes.map((n) => {
    const b = n.bounds;
    const area = b ? Math.max(0, b.width) * Math.max(0, b.height) : 0;
    const elType = n.elementId ? elementById.get(n.elementId)?.type : undefined;
    const isContainer = elType === 'bpmn.pool' || elType === 'bpmn.lane';
    const key = (n.elementId ?? n.id) as string;
    return { node: n, area, isContainer, key };
  });

  infos.sort((a, b) => {
    // Containers first; within containers sort by area (bigger behind smaller), then stable key.
    if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
    if (a.isContainer && b.isContainer) {
      if (a.area !== b.area) return b.area - a.area;
      return a.key.localeCompare(b.key);
    }
    // Non-containers: stable by key.
    return a.key.localeCompare(b.key);
  });

  // IRViewNode has no zIndex field; instead we order nodes so containers come first (rendered behind).
  const ordered = infos.map((i) => i.node);
  nodes.splice(0, nodes.length, ...ordered);
}

export function parseViews(ctx: ParseContext) {
  const { defs, warnings, views, elementById, relById } = ctx;

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

      // Ensure background containers (pool/lane) do not hide connections or nested nodes.
      applyBpmnZOrder(nodes, elementById);

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

    applyBpmnZOrder(nodes, elementById);

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

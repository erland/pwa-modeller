import type { IRElement, IRPoint, IRViewConnection, IRViewNode, IRBounds } from '../../framework/ir';

import { attr, childByLocalName, childrenByLocalName, localName, numberAttr, q, qa } from '../xml';

import type { ParseContext } from './context';

type Rect = { x: number; y: number; width: number; height: number };

function isBpmnVisualElementType(t: string | undefined): boolean {
  if (!t) return false;
  return t.startsWith('bpmn.');
}

function defaultSizeForBpmnType(t: string | undefined): { width: number; height: number } {
  switch (t) {
    case 'bpmn.startEvent':
    case 'bpmn.endEvent':
    case 'bpmn.intermediateCatchEvent':
    case 'bpmn.intermediateThrowEvent':
    case 'bpmn.boundaryEvent':
      return { width: 36, height: 36 };
    case 'bpmn.exclusiveGateway':
    case 'bpmn.parallelGateway':
    case 'bpmn.inclusiveGateway':
    case 'bpmn.eventBasedGateway':
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

function boundsOrDefault(n: IRViewNode, elementById: Map<string, IRElement>): Rect | undefined {
  if (n.bounds) return n.bounds;
  if (n.kind !== 'element' || !n.elementId) return undefined;
  const t = elementById.get(n.elementId)?.type;
  const s = defaultSizeForBpmnType(t);
  return { x: 0, y: 0, width: s.width, height: s.height };
}

function rectContains(container: Rect, inner: Rect): boolean {
  return (
    inner.x >= container.x &&
    inner.y >= container.y &&
    inner.x + inner.width <= container.x + container.width &&
    inner.y + inner.height <= container.y + container.height
  );
}

function centerOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function ensureViewShowsAllBpmnElements(
  nodes: IRViewNode[],
  connections: IRViewConnection[],
  ctx: Pick<ParseContext, 'elements' | 'relationships' | 'elementById'>
) {
  const { elements, relationships, elementById } = ctx;

  const existingElementNodeIds = new Set<string>();
  for (const n of nodes) {
    if (n.kind === 'element' && n.elementId) existingElementNodeIds.add(n.elementId);
  }

  // Determine layout containers from DI: prefer lanes, otherwise pools, otherwise a global canvas.
  const laneRects: { id: string; rect: Rect }[] = [];
  const poolRects: { id: string; rect: Rect }[] = [];
  for (const n of nodes) {
    if (n.kind !== 'element' || !n.elementId) continue;
    const elType = elementById.get(n.elementId)?.type;
    const b = n.bounds;
    if (!b) continue;
    if (elType === 'bpmn.lane') laneRects.push({ id: n.elementId, rect: b });
    if (elType === 'bpmn.pool') poolRects.push({ id: n.elementId, rect: b });
  }

  laneRects.sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x) || a.id.localeCompare(b.id));
  poolRects.sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x) || a.id.localeCompare(b.id));

  const containers = laneRects.length ? laneRects.map((x) => x.rect) : poolRects.length ? poolRects.map((x) => x.rect) : [];

  const globalRect: Rect = (() => {
    // If we have any DI bounds at all, grow from them. Otherwise default to an origin canvas.
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    let seen = false;
    for (const n of nodes) {
      const b = n.bounds;
      if (!b) continue;
      seen = true;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    if (!seen) return { x: 0, y: 0, width: 1600, height: 900 };
    return { x: minX, y: minY, width: Math.max(800, maxX - minX + 400), height: Math.max(600, maxY - minY + 300) };
  })();

  const pickContainerFor = (elId: string): Rect => {
    // If the element is already inside a lane/pool by DI, keep it. Otherwise place in first container.
    // (We do not yet parse lane membership from semantic BPMN; this is a simple best-effort.)
    void elId;
    if (containers.length) return containers[0];
    return globalRect;
  };

  // Compute a starting cursor based on existing non-container nodes, so we append rather than overlap.
  const computeStartForContainer = (container: Rect): { x: number; y: number } => {
    const padX = 80;
    const padY = 60;
    let maxY = container.y + padY;
    for (const n of nodes) {
      if (n.kind !== 'element' || !n.elementId) continue;
      const t = elementById.get(n.elementId)?.type;
      if (t === 'bpmn.pool' || t === 'bpmn.lane') continue;
      const b = n.bounds;
      if (!b) continue;
      if (!rectContains(container, b)) continue;
      maxY = Math.max(maxY, b.y + b.height);
    }
    return { x: container.x + padX, y: maxY + 40 };
  };

  const cursorByContainer = new Map<string, { x: number; y: number }>();
  const keyFor = (r: Rect) => `${r.x},${r.y},${r.width},${r.height}`;
  const getCursor = (r: Rect) => {
    const k = keyFor(r);
    let cur = cursorByContainer.get(k);
    if (!cur) {
      cur = computeStartForContainer(r);
      cursorByContainer.set(k, cur);
    }
    return cur;
  };

  const pad = { x: 80, y: 60 };
  const gap = { x: 40, y: 40 };

  // 1) Add missing element view nodes.
  for (const e of elements) {
    if (!isBpmnVisualElementType(e.type)) continue;
    if (existingElementNodeIds.has(e.id)) continue;

    // Do not auto-place container elements if they already exist as DI-less; they tend to cover everything.
    if (e.type === 'bpmn.pool' || e.type === 'bpmn.lane') continue;

    const container = pickContainerFor(e.id);
    const cur = getCursor(container);
    const size = defaultSizeForBpmnType(e.type);

    const innerW = Math.max(300, container.width - pad.x * 2);
    const maxX = container.x + pad.x + innerW;

    // Wrap when reaching container width.
    if (cur.x + size.width > maxX) {
      cur.x = container.x + pad.x;
      cur.y += size.height + gap.y;
    }

    const bounds: Rect = {
      x: cur.x,
      y: cur.y,
      width: size.width,
      height: size.height
    };

    nodes.push({
      id: `auto:${e.id}`,
      kind: 'element',
      elementId: e.id,
      bounds
    });

    existingElementNodeIds.add(e.id);
    cur.x += size.width + gap.x;
  }

  // 2) Add missing view connections for relationships where both ends exist in the view.
  const existingRelIds = new Set<string>();
  for (const c of connections) {
    if (c.relationshipId) existingRelIds.add(c.relationshipId);
  }

  // Build quick lookup for node centers.
  const nodeCenterByElementId = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (n.kind !== 'element' || !n.elementId) continue;
    const b = boundsOrDefault(n, elementById);
    if (!b) continue;
    nodeCenterByElementId.set(n.elementId, centerOf(b));
  }

  for (const r of relationships) {
    if (existingRelIds.has(r.id)) continue;
    if (!nodeCenterByElementId.has(r.sourceId) || !nodeCenterByElementId.has(r.targetId)) continue;

    const a = nodeCenterByElementId.get(r.sourceId)!;
    const b = nodeCenterByElementId.get(r.targetId)!;

    connections.push({
      id: `auto:${r.id}`,
      relationshipId: r.id,
      points: [a, b]
    });
    existingRelIds.add(r.id);
  }
}

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

  // Keep ordering stable/predictable AND assign an explicit zIndex via meta so the renderer can
  // reliably layer pools/lanes behind relationships even if DOM order changes.
  //
  // zIndex policy:
  // - Containers (pool/lane): very low negative zIndex, larger containers even further back.
  // - Others: leave as-is (default/undefined), letting user/layout decide.
  const ordered = infos.map((i) => i.node);

  let containerBase = -1000;
  let containerRank = 0;
  for (const info of infos) {
    if (!info.isContainer) continue;
    const n = info.node;
    n.meta = { ...(n.meta ?? {}), zIndex: containerBase - containerRank };
    containerRank++;
  }

  nodes.splice(0, nodes.length, ...ordered);
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

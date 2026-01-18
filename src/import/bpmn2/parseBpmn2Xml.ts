import type { ImportIR } from '../framework/importer';
import type { IRElement, IRPoint, IRRelationship, IRView, IRViewConnection, IRViewNode } from '../framework/ir';

import { attr, childByLocalName, childrenByLocalName, localName, numberAttr, parseXml, q, qa, text } from './xml';

export type ParseBpmn2Result = {
  importIR: ImportIR;
  warnings: string[];
};

function bpmnTypeForNodeLocalName(nameLc: string): string | null {
  switch (nameLc) {
    // Containers
    case 'participant':
      return 'bpmn.pool';
    case 'lane':
      return 'bpmn.lane';

    // Activities
    case 'task':
      return 'bpmn.task';
    case 'usertask':
      return 'bpmn.userTask';
    case 'servicetask':
      return 'bpmn.serviceTask';
    case 'scripttask':
      return 'bpmn.scriptTask';
    case 'manualtask':
      return 'bpmn.manualTask';
    case 'callactivity':
      return 'bpmn.callActivity';
    case 'subprocess':
      return 'bpmn.subProcess';

    // Events
    case 'startevent':
      return 'bpmn.startEvent';
    case 'endevent':
      return 'bpmn.endEvent';
    case 'intermediatecatchevent':
      return 'bpmn.intermediateCatchEvent';
    case 'intermediatethrowevent':
      return 'bpmn.intermediateThrowEvent';
    case 'boundaryevent':
      return 'bpmn.boundaryEvent';

    // Gateways
    case 'exclusivegateway':
      return 'bpmn.gatewayExclusive';
    case 'parallelgateway':
      return 'bpmn.gatewayParallel';
    case 'inclusivegateway':
      return 'bpmn.gatewayInclusive';
    case 'eventbasedgateway':
      return 'bpmn.gatewayEventBased';

    // Artifacts (minimal support; helpful for association)
    case 'textannotation':
      return 'bpmn.textAnnotation';
    case 'dataobjectreference':
      return 'bpmn.dataObjectReference';
    case 'datastorereference':
      return 'bpmn.dataStoreReference';
    case 'group':
      return 'bpmn.group';

    default:
      return null;
  }
}

function bpmnTypeForRelLocalName(nameLc: string): string | null {
  switch (nameLc) {
    case 'sequenceflow':
      return 'bpmn.sequenceFlow';
    case 'messageflow':
      return 'bpmn.messageFlow';
    case 'association':
      return 'bpmn.association';
    default:
      return null;
  }
}

function defaultName(typeId: string, id: string): string {
  // Names are required by the domain factories, so always provide a fallback.
  const short = typeId.replace(/^bpmn\./, '');
  return `${short} (${id})`;
}

function extractExtensionSummary(el: Element): Record<string, string> | undefined {
  const ext = childByLocalName(el, 'extensionElements');
  if (!ext) return undefined;

  const out: Record<string, string> = {};
  let count = 0;
  const max = 50;

  const add = (key: string, value: string) => {
    if (count >= max) return;
    const k = key.trim();
    const v = value.trim();
    if (!k || !v) return;
    if (k.length > 80) return;
    if (v.length > 500) return;
    if (out[k] != null) return;
    out[k] = v;
    count += 1;
  };

  const captureFrom = (prefix: string, node: Element) => {
    // Attributes
    for (const a of Array.from(node.attributes)) {
      const name = a.name;
      if (!name) continue;
      add(`${prefix}@${name}`, a.value);
    }
    // Text content
    const t = (node.textContent ?? '').trim();
    if (t) add(`${prefix}#text`, t);
  };

  for (const c of Array.from(ext.children)) {
    const ln = localName(c);
    captureFrom(ln, c);

    // Shallow grandchildren (EA often nests a level).
    for (const gc of Array.from(c.children)) {
      const ln2 = `${ln}.${localName(gc)}`;
      captureFrom(ln2, gc);
      if (count >= max) break;
    }
    if (count >= max) break;
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * Parse BPMN 2.0 XML into the app's ImportIR.
 *
 * Step 1 skeleton: validates that the document contains a <definitions> root.
 * Later steps will populate elements, relationships, views and geometry.
 */
export function parseBpmn2Xml(xmlText: string): ParseBpmn2Result {
  const warnings: string[] = [];
  const doc = parseXml(xmlText);

  const defs = q(doc, 'definitions');
  if (!defs || localName(defs) !== 'definitions') {
    throw new Error('Not a BPMN 2.0 XML document: missing <definitions> element.');
  }

  const elements: IRElement[] = [];
  const relationships: IRRelationship[] = [];
  const views: IRView[] = [];

  const idIndex = new Set<string>();
  const elementById = new Map<string, IRElement>();
  const relById = new Map<string, IRRelationship>();
  const unsupportedNodeTypes = new Set<string>();

  // ------------------------------
  // Nodes (elements)
  // ------------------------------
  // We intentionally keep this permissive: collect supported node types anywhere in <definitions>.
  // Later steps can refine containment (process/pool/lane) and add DI-based view layout.
  const supportedNodeLocalNames = [
    // Containers
    'participant',
    'lane',
    // Activities
    'task',
    'userTask',
    'serviceTask',
    'scriptTask',
    'manualTask',
    'callActivity',
    'subProcess',
    // Events
    'startEvent',
    'endEvent',
    'intermediateCatchEvent',
    'intermediateThrowEvent',
    'boundaryEvent',
    // Gateways
    'exclusiveGateway',
    'parallelGateway',
    'inclusiveGateway',
    'eventBasedGateway',
    // Artifacts
    'textAnnotation',
    'dataObjectReference',
    'dataStoreReference',
    'group'
  ];

  for (const ln of supportedNodeLocalNames) {
    for (const el of qa(defs, ln)) {
      const id = (attr(el, 'id') ?? '').trim();
      if (!id) {
        warnings.push(`Skipping BPMN element without @id (<${localName(el)}>)`);
        continue;
      }

      const typeId = bpmnTypeForNodeLocalName(localName(el));
      if (!typeId) {
        // Shouldn't happen because we only query supported names, but keep defensive.
        const key = localName(el);
        if (!unsupportedNodeTypes.has(key)) {
          unsupportedNodeTypes.add(key);
          warnings.push(`Unsupported BPMN node element <${key}> (skipped)`);
        }
        continue;
      }

      if (idIndex.has(id)) {
        // Avoid duplicates across different traversals.
        continue;
      }
      idIndex.add(id);

      const name = (attr(el, 'name') ?? '').trim() || defaultName(typeId, id);
      const docEl = childByLocalName(el, 'documentation');
      const documentation = text(docEl) || undefined;

      const extTags = extractExtensionSummary(el);

      elements.push({
        id,
        type: typeId,
        name,
        documentation,
        externalIds: [{ system: 'bpmn2', id, kind: 'element' }],
        meta: {
          sourceLocalName: localName(el),
          ...(extTags ? { extensionElements: { tags: extTags } } : {})
        }
      });

      elementById.set(id, elements[elements.length - 1]);
    }
  }

  // Warn (once per type) for common BPMN nodes we see but don't yet support.
  // We do this by scanning a few high-frequency element names.
  const maybeUnsupported = ['sendTask', 'receiveTask', 'businessRuleTask', 'complexGateway', 'transaction', 'eventSubProcess'];
  for (const ln of maybeUnsupported) {
    const found = qa(defs, ln);
    if (!found.length) continue;
    const typeId = bpmnTypeForNodeLocalName(ln.toLowerCase());
    if (!typeId) {
      if (!unsupportedNodeTypes.has(ln)) {
        unsupportedNodeTypes.add(ln);
        warnings.push(`BPMN node type <${ln}> is present but not supported yet (will be skipped).`);
      }
    }
  }

  // ------------------------------
  // Relationships (flows)
  // ------------------------------
  const supportedRelLocalNames = ['sequenceFlow', 'messageFlow', 'association'];
  const missingEndpointsWarnings = new Set<string>();

  for (const ln of supportedRelLocalNames) {
    for (const relEl of qa(defs, ln)) {
      const id = (attr(relEl, 'id') ?? '').trim();
      if (!id) {
        warnings.push(`Skipping BPMN relationship without @id (<${localName(relEl)}>)`);
        continue;
      }

      const typeId = bpmnTypeForRelLocalName(localName(relEl));
      if (!typeId) continue;

      const sourceRef = (attr(relEl, 'sourceRef') ?? '').trim();
      const targetRef = (attr(relEl, 'targetRef') ?? '').trim();
      if (!sourceRef || !targetRef) {
        warnings.push(`Skipping ${typeId} (${id}) because sourceRef/targetRef is missing.`);
        continue;
      }

      if (!idIndex.has(sourceRef) || !idIndex.has(targetRef)) {
        const key = `${typeId}:${sourceRef}->${targetRef}`;
        if (!missingEndpointsWarnings.has(key)) {
          missingEndpointsWarnings.add(key);
          warnings.push(
            `Skipping ${typeId} (${id}) because endpoint(s) were not imported (source=${sourceRef}, target=${targetRef}).`
          );
        }
        continue;
      }

      const name = (attr(relEl, 'name') ?? '').trim() || undefined;
      const docEl = childByLocalName(relEl, 'documentation');
      const documentation = text(docEl) || undefined;

      const extTags = extractExtensionSummary(relEl);

      relationships.push({
        id,
        type: typeId,
        name,
        documentation,
        sourceId: sourceRef,
        targetId: targetRef,
        externalIds: [{ system: 'bpmn2', id, kind: 'relationship' }],
        meta: {
          sourceLocalName: localName(relEl),
          ...(extTags ? { extensionElements: { tags: extTags } } : {})
        }
      });

      relById.set(id, relationships[relationships.length - 1]);
    }
  }

  // ------------------------------
  // Views (BPMNDI)
  // ------------------------------
  // If BPMNDI is present, recreate diagram layout using BPMNShape bounds and BPMNEdge waypoints.
  // If missing, fall back to a simple auto layout view.
  const diagrams = qa(defs, 'BPMNDiagram');

  /**
   * Compute a stable zIndex ordering for view nodes.
   *
   * BPMN-friendly behavior:
   * - Background containers (pool/lane) should render behind both connections and nested nodes.
   * - Other semantic nodes should render above connections.
   *
   * Implementation:
   * - Pools/lanes get large negative zIndex values (keeps them behind the relationship SVG layer).
   * - Other nodes get non-negative zIndex values.
   * - We use bounds area as a heuristic so larger containers go further back.
   */
  const applyBpmnZOrder = (nodes: IRViewNode[]) => {
    type Info = { node: IRViewNode; area: number; isContainer: boolean; key: string };
    const infos: Info[] = nodes.map((n) => {
      const b = n.bounds;
      const area = b ? Math.max(0, b.width) * Math.max(0, b.height) : 0;
      const elType = n.elementId ? elementById.get(n.elementId)?.type : undefined;
      const isContainer = elType === 'bpmn.pool' || elType === 'bpmn.lane';
      const key = (n.elementId ?? n.id) as string;
      return { node: n, area, isContainer, key };
    });

    const byAreaDescThenKey = (a: Info, b: Info) => {
      if (a.area !== b.area) return b.area - a.area;
      return a.key.localeCompare(b.key);
    };

    // Containers: push behind everything (and behind the relationship layer).
    const containers = infos.filter((x) => x.isContainer).sort(byAreaDescThenKey);
    for (let i = 0; i < containers.length; i += 1) {
      const n = containers[i].node;
      n.meta = { ...(n.meta ?? {}), zIndex: -20000 + i };
    }

    // Non-containers: keep above connections.
    const others = infos.filter((x) => !x.isContainer).sort(byAreaDescThenKey);
    for (let i = 0; i < others.length; i += 1) {
      const n = others[i].node;
      // If already set by importer, keep it.
      const existing = (n.meta as Record<string, unknown> | undefined)?.zIndex;
      if (typeof existing === 'number') continue;
      n.meta = { ...(n.meta ?? {}), zIndex: i };
    }
  };

  const parseBounds = (boundsEl: Element | null, ctx: string): { x: number; y: number; width: number; height: number } | undefined => {
    if (!boundsEl) return undefined;
    const x = numberAttr(boundsEl, 'x', warnings, ctx);
    const y = numberAttr(boundsEl, 'y', warnings, ctx);
    const width = numberAttr(boundsEl, 'width', warnings, ctx);
    const height = numberAttr(boundsEl, 'height', warnings, ctx);
    if (x == null || y == null || width == null || height == null) return undefined;
    return { x, y, width, height };
  };

  const parseWaypoints = (edgeEl: Element, ctx: string): IRPoint[] | undefined => {
    const wps = childrenByLocalName(edgeEl, 'waypoint');
    const points: IRPoint[] = [];
    for (let i = 0; i < wps.length; i++) {
      const wp = wps[i];
      const x = numberAttr(wp, 'x', warnings, `${ctx} waypoint[${i}]`);
      const y = numberAttr(wp, 'y', warnings, `${ctx} waypoint[${i}]`);
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

      // Assign stable z-order so background containers (pool/lane) do not hide
      // connections or nested nodes in the interactive canvas.
      applyBpmnZOrder(nodes);

      views.push({
        id: viewId,
        name: inferredName,
        // Use a built-in viewpoint id to keep the app happy; BPMN-specific
        // viewpoint taxonomy can be introduced later if desired.
        viewpoint: 'layered',
        nodes,
        connections,
        externalIds: [{ system: 'bpmn2', id: viewId, kind: 'diagram' }],
        meta: {
          sourceLocalName: 'BPMNDiagram',
          planeRef: planeRef || undefined
        }
      });
    }
  }

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

    applyBpmnZOrder(nodes);

    applyBpmnZOrder(nodes);

    const connections: IRViewConnection[] = relationships.map((r) => ({
      id: `auto:${r.id}`,
      relationshipId: r.id
    }));

    views.push({
      id: 'bpmn2:auto',
      name: 'BPMN (auto layout)',
      viewpoint: 'layered',
      nodes,
      connections,
      externalIds: [{ system: 'bpmn2', id: 'bpmn2:auto', kind: 'diagram' }]
    });
  }

  const ir: ImportIR = {
    folders: [],
    elements,
    relationships,
    views,
    meta: {
      format: 'bpmn2'
    }
  };

  return { importIR: ir, warnings };
}

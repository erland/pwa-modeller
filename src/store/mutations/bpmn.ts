import type { ElementType, Model } from '../../domain';

import * as elementMutations from './elements';
import * as relationshipMutations from './relationships';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pruneAttrs(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    next[k] = v;
  }
  return Object.keys(next).length ? next : undefined;
}

/** Merge a partial attrs patch into an element's attrs, preserving unknown keys. */
export function setBpmnElementAttrs(model: Model, elementId: string, patch: Record<string, unknown>): void {
  const el = model.elements[elementId];
  if (!el) throw new Error(`Element not found: ${elementId}`);
  const base = isRecord(el.attrs) ? (el.attrs as Record<string, unknown>) : {};
  elementMutations.updateElement(model, elementId, { attrs: pruneAttrs({ ...base, ...patch }) });
}

/** Merge a partial attrs patch into a relationship's attrs, preserving unknown keys. */
export function setBpmnRelationshipAttrs(model: Model, relationshipId: string, patch: Record<string, unknown>): void {
  const rel = model.relationships[relationshipId];
  if (!rel) throw new Error(`Relationship not found: ${relationshipId}`);
  const base = isRecord(rel.attrs) ? (rel.attrs as Record<string, unknown>) : {};
  relationshipMutations.updateRelationship(model, relationshipId, { attrs: pruneAttrs({ ...base, ...patch }) });
}

export function setSequenceFlowCondition(model: Model, relationshipId: string, conditionExpression: string | undefined): void {
  setBpmnRelationshipAttrs(model, relationshipId, {
    conditionExpression: conditionExpression?.trim() ? conditionExpression.trim() : undefined
  });
}

function ensureElementType(model: Model, elementId: string, expectedType: string, label: string): void {
  const el = model.elements[elementId];
  if (!el) throw new Error(`Element not found: ${elementId}`);
  if (String(el.type) !== expectedType) throw new Error(`${label} must be a ${expectedType}`);
}

function ensureOptionalRefType(
  model: Model,
  refId: string | null | undefined,
  expectedType: string,
  label: string
): string | undefined {
  const id = refId && String(refId).trim() ? String(refId).trim() : '';
  if (!id) return undefined;
  const el = model.elements[id];
  if (!el) throw new Error(`${label} not found: ${id}`);
  if (String(el.type) !== expectedType) throw new Error(`${label} must reference a ${expectedType}`);
  return id;
}

/** Pool (Participant): set/clear its owning process reference. */
export function setPoolProcessRef(model: Model, poolId: string, processId: string | null): void {
  ensureElementType(model, poolId, 'bpmn.pool', 'Pool');
  const ref = ensureOptionalRefType(model, processId, 'bpmn.process', 'Process');
  setBpmnElementAttrs(model, poolId, { processRef: ref });
}

/** Lane: replace its semantic membership list (flowNodeRefs) with a sanitized set of element ids. */
export function setLaneFlowNodeRefs(model: Model, laneId: string, nodeIds: string[]): void {
  ensureElementType(model, laneId, 'bpmn.lane', 'Lane');
  const next: string[] = [];
  const seen = new Set<string>();
  for (const raw of nodeIds ?? []) {
    const id = String(raw).trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    // Only keep ids that exist. We intentionally do NOT enforce "flow node" typing yet,
    // because the app's BPMN type system is still growing.
    if (!model.elements[id]) continue;
    seen.add(id);
    next.push(id);
  }
  setBpmnElementAttrs(model, laneId, { flowNodeRefs: next.length ? next : undefined });
}

/** Text annotation: set/clear its text content. */
export function setTextAnnotationText(model: Model, annotationId: string, text: string): void {
  ensureElementType(model, annotationId, 'bpmn.textAnnotation', 'Text annotation');
  const t = String(text ?? '').trim();
  setBpmnElementAttrs(model, annotationId, { text: t.length ? t : undefined });
}

/** DataObjectReference: set/clear its referenced global DataObject. */
export function setDataObjectReferenceRef(model: Model, refId: string, dataObjectId: string | null): void {
  ensureElementType(model, refId, 'bpmn.dataObjectReference', 'Data object reference');
  const target = ensureOptionalRefType(model, dataObjectId, 'bpmn.dataObject', 'Data Object');
  setBpmnElementAttrs(model, refId, { dataObjectRef: target });
}

/** DataStoreReference: set/clear its referenced global DataStore. */
export function setDataStoreReferenceRef(model: Model, refId: string, dataStoreId: string | null): void {
  ensureElementType(model, refId, 'bpmn.dataStoreReference', 'Data store reference');
  const target = ensureOptionalRefType(model, dataStoreId, 'bpmn.dataStore', 'Data Store');
  setBpmnElementAttrs(model, refId, { dataStoreRef: target });
}

/**
 * Sets a gateway's default flow.
 *
 * Also maintains `isDefault` on outgoing sequence flows for convenience.
 */
export function setGatewayDefaultFlow(model: Model, gatewayId: string, relationshipId: string | null): void {
  const gateway = model.elements[gatewayId];
  if (!gateway) throw new Error(`Element not found: ${gatewayId}`);

  const relId = relationshipId && relationshipId.trim() ? relationshipId : null;

  // Update gateway semantic attrs.
  const base = isRecord(gateway.attrs) ? (gateway.attrs as Record<string, unknown>) : {};
  elementMutations.updateElement(model, gatewayId, { attrs: pruneAttrs({ ...base, defaultFlowRef: relId ?? undefined }) });

  // Update outgoing sequence flow flags.
  for (const rel of Object.values(model.relationships)) {
    if (!rel || rel.type !== 'bpmn.sequenceFlow') continue;
    if (rel.sourceElementId !== gatewayId) continue;
    const rBase = isRecord(rel.attrs) ? (rel.attrs as Record<string, unknown>) : {};
    const isDefault = relId ? rel.id === relId : false;
    relationshipMutations.updateRelationship(model, rel.id, { attrs: pruneAttrs({ ...rBase, isDefault: isDefault ? true : undefined }) });
  }
}

function isBpmnBoundaryEventType(t: unknown): boolean {
  return String(t) === 'bpmn.boundaryEvent';
}

function isBpmnContainerType(t: unknown): boolean {
  const s = String(t);
  return s === 'bpmn.pool' || s === 'bpmn.lane';
}

function isBpmnTextAnnotation(t: unknown): boolean {
  return String(t) === 'bpmn.textAnnotation';
}

function isBpmnGatewayType(t: unknown): boolean {
  const s = String(t);
  return s === 'bpmn.gatewayExclusive' || s === 'bpmn.gatewayParallel' || s === 'bpmn.gatewayInclusive' || s === 'bpmn.gatewayEventBased';
}

function isBpmnEventType(t: unknown): boolean {
  const s = String(t);
  return (
    s === 'bpmn.startEvent' ||
    s === 'bpmn.endEvent' ||
    s === 'bpmn.intermediateCatchEvent' ||
    s === 'bpmn.intermediateThrowEvent' ||
    s === 'bpmn.boundaryEvent'
  );
}

function isBpmnActivityType(t: unknown): boolean {
  const s = String(t);
  if (!s.startsWith('bpmn.')) return false;
  if (isBpmnContainerType(s) || isBpmnTextAnnotation(s) || isBpmnGatewayType(s) || isBpmnEventType(s)) return false;
  return true;
}

/**
 * Attach/detach a boundary event to a host activity.
 *
 * - Updates `attachedToRef` in the boundary element attrs.
 * - Stores per-view offset in the boundary node layout attrs so it can follow the host.
 */
export function attachBoundaryEvent(model: Model, boundaryId: string, hostActivityId: string | null): void {
  const boundary = model.elements[boundaryId];
  if (!boundary) throw new Error(`Element not found: ${boundaryId}`);

  const hostId = hostActivityId && hostActivityId.trim() ? hostActivityId : null;
  if (hostId) {
    const host = model.elements[hostId];
    if (!host) throw new Error(`Element not found: ${hostId}`);
    if (!isBpmnActivityType(host.type)) throw new Error('Host element must be a BPMN activity');
  }

  const baseAttrs = isRecord(boundary.attrs) ? (boundary.attrs as Record<string, unknown>) : {};

  const boundaryPatch: Record<string, unknown> = { attachedToRef: hostId ?? undefined };
  // Default interrupting behavior when attaching.
  if (hostId && typeof baseAttrs.cancelActivity !== 'boolean') {
    boundaryPatch.cancelActivity = true;
  }

  elementMutations.updateElement(model, boundaryId, {
    type: isBpmnBoundaryEventType(boundary.type) ? boundary.type : ('bpmn.boundaryEvent' as ElementType),
    attrs: pruneAttrs({ ...baseAttrs, ...boundaryPatch })
  });

  // Update per-view offsets for views where both nodes exist.
  for (const view of Object.values(model.views)) {
    if (!view || view.kind !== 'bpmn') continue;
    const layout = view.layout;
    if (!layout) continue;
    const bIdx = layout.nodes.findIndex((n) => n.elementId === boundaryId);
    if (bIdx < 0) continue;
    const bNode = layout.nodes[bIdx];

    const nodeAttrs = isRecord(bNode.attrs) ? (bNode.attrs as Record<string, unknown>) : {};

    if (!hostId) {
      // Detach: drop the attachment metadata but keep position.
      const nextAttrs = { ...nodeAttrs } as Record<string, unknown>;
      delete nextAttrs.bpmnAttachment;
      const nextNode = { ...bNode, attrs: Object.keys(nextAttrs).length ? nextAttrs : undefined };
      const nextNodes = layout.nodes.slice();
      nextNodes[bIdx] = nextNode;
      model.views[view.id] = { ...view, layout: { ...layout, nodes: nextNodes } };
      continue;
    }

    const hostNode = layout.nodes.find((n) => n.elementId === hostId);
    if (!hostNode) continue;

    const dx = bNode.x - hostNode.x;
    const dy = bNode.y - hostNode.y;
    const nextNode = { ...bNode, attrs: { ...nodeAttrs, bpmnAttachment: { hostId, dx, dy } } };
    const nextNodes = layout.nodes.slice();
    nextNodes[bIdx] = nextNode;
    model.views[view.id] = { ...view, layout: { ...layout, nodes: nextNodes } };
  }
}

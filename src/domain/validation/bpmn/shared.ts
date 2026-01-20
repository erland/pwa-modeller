import type { Model, ViewNodeLayout } from '../../types';
import { kindFromTypeId } from '../../kindFromTypeId';

export type Rect = { x: number; y: number; w: number; h: number; elementId: string };

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function rectForNode(node: ViewNodeLayout): Rect {
  return {
    x: node.x,
    y: node.y,
    w: node.width ?? 120,
    h: node.height ?? 60,
    elementId: node.elementId!,
  };
}

export function centerOf(r: Rect): { cx: number; cy: number } {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

export function contains(r: Rect, cx: number, cy: number): boolean {
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

export function pickSmallestContaining(rs: Rect[], cx: number, cy: number): Rect | null {
  let best: Rect | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const r of rs) {
    if (!contains(r, cx, cy)) continue;
    const area = r.w * r.h;
    if (area < bestArea) {
      best = r;
      bestArea = area;
    }
  }
  return best;
}

export function nodeForElementInView(nodes: ViewNodeLayout[], elementId: string): ViewNodeLayout | undefined {
  return nodes.find((n) => n.elementId === elementId);
}

export function poolOfElementInView(args: {
  model: Model;
  viewId: string;
  elementId: string;
  poolRects: Rect[];
}): string | null {
  const view = args.model.views[args.viewId];
  const nodes = view?.layout?.nodes;
  if (!nodes) return null;

  const el = args.model.elements[args.elementId];
  if (!el) return null;
  if (el.type === 'bpmn.pool') return args.elementId;

  const n = nodeForElementInView(nodes, args.elementId);
  if (!n?.elementId) return null;
  const r = rectForNode(n);
  const { cx, cy } = centerOf(r);
  const pool = pickSmallestContaining(args.poolRects, cx, cy);
  return pool?.elementId ?? null;
}

export function firstBpmnViewWithBothEndpoints(model: Model, a: string, b: string): string | null {
  for (const v of Object.values(model.views)) {
    if (v.kind !== 'bpmn') continue;
    const nodes = v.layout?.nodes;
    if (!nodes) continue;
    const hasA = nodes.some((n) => n.elementId === a);
    const hasB = nodes.some((n) => n.elementId === b);
    if (hasA && hasB) return v.id;
  }
  return null;
}

export function isBpmnContainerType(type: string): boolean {
  return type === 'bpmn.pool' || type === 'bpmn.lane';
}

export function isBpmnTextAnnotationType(type: string): boolean {
  return type === 'bpmn.textAnnotation';
}

/**
 * "Flow nodes" (connectable endpoints) for BPMN in this app.
 *
 * This is intentionally permissive and aligns with the notation rules:
 * - allow all BPMN types except containers and text annotations.
 */
export function isBpmnFlowNodeType(type: string): boolean {
  if (!type.startsWith('bpmn.')) return false;
  if (isBpmnContainerType(type)) return false;
  if (isBpmnTextAnnotationType(type)) return false;
  return true;
}

export function isBpmnGatewayType(type: string): boolean {
  return (
    type === 'bpmn.gatewayExclusive' ||
    type === 'bpmn.gatewayParallel' ||
    type === 'bpmn.gatewayInclusive' ||
    type === 'bpmn.gatewayEventBased'
  );
}

export function isBpmnActivityType(type: string): boolean {
  if (!type.startsWith('bpmn.')) return false;
  if (isBpmnContainerType(type) || isBpmnTextAnnotationType(type) || isBpmnGatewayType(type)) return false;
  // Events are flow nodes but not activities.
  if (
    type === 'bpmn.startEvent' ||
    type === 'bpmn.endEvent' ||
    type === 'bpmn.intermediateCatchEvent' ||
    type === 'bpmn.intermediateThrowEvent' ||
    type === 'bpmn.boundaryEvent'
  ) {
    return false;
  }
  return true;
}

export function isExclusiveOrInclusiveGateway(type: string): boolean {
  return type === 'bpmn.gatewayExclusive' || type === 'bpmn.gatewayInclusive';
}

export function getStringAttr(attrs: unknown, key: string): string | undefined {
  if (!isRecord(attrs)) return undefined;
  const v = attrs[key];
  return typeof v === 'string' ? v : undefined;
}

export function getBooleanAttr(attrs: unknown, key: string): boolean | undefined {
  if (!isRecord(attrs)) return undefined;
  const v = attrs[key];
  return typeof v === 'boolean' ? v : undefined;
}

export function getNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

export function isBpmnElement(model: Model, elementId: string): boolean {
  const el = model.elements[elementId];
  if (!el) return false;
  const kind = el.kind ?? kindFromTypeId(el.type);
  return kind === 'bpmn';
}

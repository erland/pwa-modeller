import type { Model, RelationshipType } from '../../../domain';
import { getViewpointById, STRONGEST_RELATIONSHIP_VALIDATION_MODE } from '../../../domain';
import { getNotation } from '../../../notations';
import type { ConnectableRef } from '../connectable';
import { getBpmnRelationshipHints } from './bpmnHints';

export function prioritizeRelationshipTypes(all: RelationshipType[], preferred: RelationshipType[]): RelationshipType[] {
  const preferredSet = new Set(preferred);
  const first: RelationshipType[] = [];
  const rest: RelationshipType[] = [];
  for (const t of all) {
    if (preferredSet.has(t)) first.push(t);
    else rest.push(t);
  }
  // Ensure stable preferred order
  first.sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b));
  return [...first, ...rest];
}

export function defaultRelTypeForViewKind(kind: string | undefined): RelationshipType {
  if (kind === 'uml') return 'uml.association';
  if (kind === 'bpmn') return 'bpmn.sequenceFlow';
  return 'Association';
}

export function isRelTypeForViewKind(kind: string | undefined, t: RelationshipType): boolean {
  const s = String(t);
  if (kind === 'uml') return s.startsWith('uml.');
  if (kind === 'bpmn') return s.startsWith('bpmn.');
  // ArchiMate: known types are unqualified (no dot) + Unknown.
  return !s.includes('.') || s === 'Unknown';
}

export function computePendingRelationshipTypeOptions(args: {
  model: Model;
  viewId: string;
  sourceRef: ConnectableRef;
  targetRef: ConnectableRef;
  showAll: boolean;
}): RelationshipType[] {
  const { model, viewId, sourceRef, targetRef, showAll } = args;

  const view = model.views[viewId];
  const viewKind = view?.kind ?? 'archimate';

  // Start with the notation's types for this kind.
  const notation = getNotation(viewKind);
  const allTypes = notation.getRelationshipTypeOptions().map((o) => o.id) as RelationshipType[];
  let allowed: RelationshipType[] = allTypes;

  // If both endpoints are elements, filter by notation rules (mode-aware).
  if (sourceRef.kind === 'element' && targetRef.kind === 'element') {
    const sourceType = model.elements[sourceRef.id]?.type;
    const targetType = model.elements[targetRef.id]?.type;
    if (sourceType && targetType) {
      allowed = allTypes.filter((t) =>
        notation.canCreateRelationship({ relationshipType: t, sourceType, targetType, mode: STRONGEST_RELATIONSHIP_VALIDATION_MODE }).allowed
      );
    }
  } else {
    // Otherwise, fall back to viewpoint guidance (connectors etc.).
    const vp = view ? getViewpointById(view.viewpointId) : undefined;
    allowed = (vp?.allowedRelationshipTypes?.length ? vp.allowedRelationshipTypes : allTypes) as RelationshipType[];
  }

  // BPMN ordering hints: Message Flow vs Sequence Flow.
  if (viewKind === 'bpmn' && sourceRef.kind === 'element' && targetRef.kind === 'element') {
    const { preferredOrder } = getBpmnRelationshipHints({ model, viewId, sourceElementId: sourceRef.id, targetElementId: targetRef.id });
    allowed = prioritizeRelationshipTypes(allowed, preferredOrder);
  }

  if (!showAll) return allowed;

  // "Show all" mode: keep the allowed ones first, then append the rest (unique).
  const seen = new Set<RelationshipType>();
  const out: RelationshipType[] = [];
  for (const rt of allowed) {
    if (!seen.has(rt)) {
      seen.add(rt);
      out.push(rt);
    }
  }
  for (const rt of allTypes) {
    if (!seen.has(rt)) {
      seen.add(rt);
      out.push(rt);
    }
  }
  return out;
}

export function pickDefaultPendingRelationshipType(args: {
  model: Model;
  viewId: string;
  sourceRef: ConnectableRef;
  targetRef: ConnectableRef;
  lastRelType: RelationshipType;
  options: RelationshipType[];
}): RelationshipType {
  const { model, viewId, sourceRef, targetRef, lastRelType, options } = args;

  const view = model.views[viewId];
  const viewKind = view?.kind;

  if (viewKind === 'bpmn' && sourceRef.kind === 'element' && targetRef.kind === 'element') {
    const { preferredDefault } = getBpmnRelationshipHints({ model, viewId, sourceElementId: sourceRef.id, targetElementId: targetRef.id });
    return options.includes(preferredDefault) ? preferredDefault : (options[0] ?? preferredDefault);
  }

  const preferred =
    isRelTypeForViewKind(viewKind, lastRelType) && options.includes(lastRelType)
      ? lastRelType
      : defaultRelTypeForViewKind(viewKind);

  return options.includes(preferred) ? preferred : (options[0] ?? defaultRelTypeForViewKind(viewKind));
}

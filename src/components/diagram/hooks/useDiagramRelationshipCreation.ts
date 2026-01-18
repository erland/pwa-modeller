import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Model, RelationshipType } from '../../../domain';
import { createRelationship, getViewpointById, STRONGEST_RELATIONSHIP_VALIDATION_MODE } from '../../../domain';
import { getNotation } from '../../../notations';

import { modelStore } from '../../../store';
import type { Selection } from '../../model/selection';
import type { Point } from '../geometry';
import { hitTestConnectable } from '../geometry';
import type { ViewNodeLayout } from '../../../domain';
import type { DiagramLinkDrag } from '../DiagramNode';
import type { ConnectableRef } from '../connectable';
import { sameRef } from '../connectable';

type Rect = { x: number; y: number; w: number; h: number; elementId: string };

function rectForNode(node: ViewNodeLayout): Rect {
  return { x: node.x, y: node.y, w: node.width ?? 120, h: node.height ?? 60, elementId: node.elementId! };
}

function centerOf(r: Rect): { cx: number; cy: number } {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

function contains(r: Rect, cx: number, cy: number): boolean {
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

function pickSmallestContaining(rs: Rect[], cx: number, cy: number): Rect | null {
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

function poolIdForElementInBpmnView(model: Model, viewId: string, elementId: string): string | null {
  const view = model.views[viewId];
  if (!view || view.kind !== 'bpmn') return null;
  const nodes = view.layout?.nodes;
  if (!nodes?.length) return null;

  const el = model.elements[elementId];
  if (!el) return null;
  if (String(el.type) === 'bpmn.pool') return elementId;

  const node = nodes.find((n) => n.elementId === elementId);
  if (!node?.elementId) return null;

  const poolRects: Rect[] = [];
  for (const n of nodes) {
    if (!n.elementId) continue;
    const t = model.elements[n.elementId]?.type;
    if (String(t) === 'bpmn.pool') poolRects.push(rectForNode(n));
  }
  if (!poolRects.length) return null;

  const r = rectForNode(node);
  const { cx, cy } = centerOf(r);
  const pool = pickSmallestContaining(poolRects, cx, cy);
  return pool?.elementId ?? null;
}

function prioritizeRelationshipTypes(all: RelationshipType[], preferred: RelationshipType[]): RelationshipType[] {
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

type PendingCreateRel = {
  viewId: string;
  sourceRef: ConnectableRef;
  targetRef: ConnectableRef;
};

type Args = {
  model: Model | null;
  nodes: ViewNodeLayout[];
  clientToModelPoint: (clientX: number, clientY: number) => Point | null;
  onSelect: (sel: Selection) => void;
};

export function useDiagramRelationshipCreation({ model, nodes, clientToModelPoint, onSelect }: Args) {
  const [validationDataTick, setValidationDataTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // Best-effort: allow notations to lazily load rule tables. For ArchiMate,
    // this enables strict relationship validation via a bundled XML matrix.
    const arch = getNotation('archimate');
    const p = arch.prepareRelationshipValidation?.(STRONGEST_RELATIONSHIP_VALIDATION_MODE);
    if (p && typeof (p as Promise<void>).then === 'function') {
      void (p as Promise<void>).then(() => {
        if (!cancelled) setValidationDataTick((t) => t + 1);
      });
    } else {
      // Even if it is synchronous, bump a tick so dependent memos can recompute.
      setValidationDataTick((t) => t + 1);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const [linkDrag, setLinkDrag] = useState<DiagramLinkDrag | null>(null);

  const [pendingCreateRel, setPendingCreateRel] = useState<PendingCreateRel | null>(null);

  const [lastRelType, setLastRelType] = useState<RelationshipType>('Association');
  const [pendingRelType, setPendingRelType] = useState<RelationshipType>('Association');
  const [pendingRelError, setPendingRelError] = useState<string | null>(null);
  const [showAllPendingRelTypes, setShowAllPendingRelTypes] = useState(false);

  // Relationship creation: drag a "wire" from a node handle to another node.
  useEffect(() => {
    if (!linkDrag) return;

    function filterDropTarget(args: {
      viewId: string;
      sourceRef: ConnectableRef;
      targetRef: ConnectableRef | null;
    }): ConnectableRef | null {
      const { viewId, targetRef } = args;
      if (!model || !targetRef) return targetRef;

      const view = model.views[viewId];
      const viewKind = view?.kind ?? 'archimate';

      // BPMN v2 containers (pool/lane) should not be offered as relationship drop targets.
      // They are model elements, but Sequence Flow / Message Flow are intended to connect flow nodes.
      if (viewKind === 'bpmn' && targetRef.kind === 'element') {
        const t = model.elements[targetRef.id]?.type;
        if (t === 'bpmn.pool' || t === 'bpmn.lane') return null;
      }

      return targetRef;
    }

    function onMove(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;
      // IMPORTANT: the relationship handle typically uses pointer capture.
      // That prevents pointerenter/leave from firing on other nodes, so we hit-test
      // in model coordinates to detect the current drop target.
      setLinkDrag((prev) => {
        if (!prev) return prev;
        const rawTargetRef = hitTestConnectable(nodes, p, prev.sourceRef);
        const targetRef = filterDropTarget({ viewId: prev.viewId, sourceRef: prev.sourceRef, targetRef: rawTargetRef });
        return { ...prev, currentPoint: p, targetRef };
      });
    }

    function onUp(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      setLinkDrag((prev) => {
        if (!prev) return prev;
        const rawTarget = p ? hitTestConnectable(nodes, p, prev.sourceRef) : prev.targetRef;
        const target = filterDropTarget({ viewId: prev.viewId, sourceRef: prev.sourceRef, targetRef: rawTarget });
        if (target && !sameRef(target, prev.sourceRef)) {
          setPendingCreateRel({ viewId: prev.viewId, sourceRef: prev.sourceRef, targetRef: target });
          setPendingRelType(lastRelType);
          setPendingRelError(null);
          setShowAllPendingRelTypes(false);
        }
        return null;
      });
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [linkDrag, clientToModelPoint, lastRelType, nodes, model]);

function defaultRelTypeForViewKind(kind: string | undefined): RelationshipType {
  if (kind === 'uml') return 'uml.association';
  if (kind === 'bpmn') return 'bpmn.sequenceFlow';
  return 'Association';
}

function isRelTypeForViewKind(kind: string | undefined, t: RelationshipType): boolean {
  const s = String(t);
  if (kind === 'uml') return s.startsWith('uml.');
  if (kind === 'bpmn') return s.startsWith('bpmn.');
  // ArchiMate: known types are unqualified (no dot) + Unknown.
  return !s.includes('.') || s === 'Unknown';
}

const pendingRelTypeOptions = useMemo(() => {
  // Dependency tick to recompute when validation data loads/changes.
  void validationDataTick;
  if (!model || !pendingCreateRel) {
    return getNotation('archimate').getRelationshipTypeOptions().map((o) => o.id) as RelationshipType[];
  }

  const { sourceRef, targetRef } = pendingCreateRel;

  const view = model.views[pendingCreateRel.viewId];
  const viewKind = view?.kind ?? 'archimate';

  // Start with the "best effort" allowed list (notation kind aware).
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



  // Connection assists for BPMN:
  // - If endpoints appear in different Pools, prefer Message Flow.
  // - If dragging from a boundary event, prefer Sequence Flow.
  if (viewKind === 'bpmn' && sourceRef.kind === 'element' && targetRef.kind === 'element') {
    const sourceType = model.elements[sourceRef.id]?.type;
    const isBoundarySource = String(sourceType) === 'bpmn.boundaryEvent';

    const sp = poolIdForElementInBpmnView(model, pendingCreateRel.viewId, sourceRef.id);
    const tp = poolIdForElementInBpmnView(model, pendingCreateRel.viewId, targetRef.id);
    const crossPool = Boolean(sp && tp && sp !== tp);

    const preferred: RelationshipType[] = isBoundarySource
      ? ['bpmn.sequenceFlow', 'bpmn.messageFlow', 'bpmn.association']
      : crossPool
        ? ['bpmn.messageFlow', 'bpmn.sequenceFlow', 'bpmn.association']
        : ['bpmn.sequenceFlow', 'bpmn.messageFlow', 'bpmn.association'];

    allowed = prioritizeRelationshipTypes(allowed, preferred);
  }

  if (!showAllPendingRelTypes) return allowed;

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
}, [model, pendingCreateRel, validationDataTick, showAllPendingRelTypes]);

  // When the dialog opens, default the type to last used (if allowed), otherwise first option.
  useEffect(() => {
    if (!pendingCreateRel) return;
    const opts = pendingRelTypeOptions;
    const view = model?.views[pendingCreateRel.viewId];
    const viewKind = view?.kind;

    const isBpmn = viewKind === 'bpmn';

    let preferred: RelationshipType;

    if (isBpmn && pendingCreateRel.sourceRef.kind === 'element' && pendingCreateRel.targetRef.kind === 'element') {
      const sourceType = model?.elements[pendingCreateRel.sourceRef.id]?.type;
      const isBoundarySource = String(sourceType) === 'bpmn.boundaryEvent';

      const sp = model ? poolIdForElementInBpmnView(model, pendingCreateRel.viewId, pendingCreateRel.sourceRef.id) : null;
      const tp = model ? poolIdForElementInBpmnView(model, pendingCreateRel.viewId, pendingCreateRel.targetRef.id) : null;
      const crossPool = Boolean(sp && tp && sp !== tp);

      // Boundary events generally connect via Sequence Flow; cross-pool suggests Message Flow.
      preferred = isBoundarySource ? 'bpmn.sequenceFlow' : crossPool ? 'bpmn.messageFlow' : 'bpmn.sequenceFlow';
    } else {
      preferred =
        isRelTypeForViewKind(viewKind, lastRelType) && opts.includes(lastRelType)
          ? lastRelType
          : defaultRelTypeForViewKind(viewKind);
    }

    const next = opts.includes(preferred) ? preferred : (opts[0] ?? defaultRelTypeForViewKind(viewKind));
    setPendingRelType(next);
    setPendingRelError(null);
  }, [pendingCreateRel, pendingRelTypeOptions, lastRelType, model]);

  const closePendingRelationshipDialog = useCallback(() => {
    setPendingCreateRel(null);
    setPendingRelError(null);
  }, []);

  const confirmCreatePendingRelationship = useCallback(() => {
    if (!model || !pendingCreateRel) return;
    setPendingRelError(null);

    const { sourceRef, targetRef } = pendingCreateRel;

    const sourceOk =
      sourceRef.kind === 'element' ? Boolean(model.elements[sourceRef.id]) : Boolean(model.connectors?.[sourceRef.id]);
    const targetOk =
      targetRef.kind === 'element' ? Boolean(model.elements[targetRef.id]) : Boolean(model.connectors?.[targetRef.id]);
    if (!sourceOk || !targetOk) {
      setPendingRelError('Both source and target endpoints must exist.');
      return;
    }

    // Only apply semantic relationship rule validation when both endpoints are elements.
    if (sourceRef.kind === 'element' && targetRef.kind === 'element') {
      const sourceType = model.elements[sourceRef.id]?.type;
      const targetType = model.elements[targetRef.id]?.type;
      if (sourceType && targetType) {
        const view = model.views[pendingCreateRel.viewId];
        const notation = getNotation(view?.kind ?? 'archimate');
        const v = notation.canCreateRelationship({
          relationshipType: pendingRelType,
          sourceType,
          targetType,
          mode: STRONGEST_RELATIONSHIP_VALIDATION_MODE,
        });
        if (!v.allowed) {
          setPendingRelError(v.reason ?? 'Invalid relationship');
          if (!showAllPendingRelTypes) return;
        }
      }
    }

    const rel = createRelationship({
      type: pendingRelType,
      sourceElementId: sourceRef.kind === 'element' ? sourceRef.id : undefined,
      sourceConnectorId: sourceRef.kind === 'connector' ? sourceRef.id : undefined,
      targetElementId: targetRef.kind === 'element' ? targetRef.id : undefined,
      targetConnectorId: targetRef.kind === 'connector' ? targetRef.id : undefined,
    });
    modelStore.addRelationship(rel);
    modelStore.ensureViewConnections(pendingCreateRel.viewId);
    setLastRelType(pendingRelType);
    setPendingCreateRel(null);
    onSelect({ kind: 'relationship', relationshipId: rel.id, viewId: pendingCreateRel.viewId });
  }, [model, pendingCreateRel, pendingRelType, onSelect, showAllPendingRelTypes]);

  const startLinkDrag = useCallback((drag: DiagramLinkDrag) => {
    setLinkDrag(drag);
  }, []);

  const hoverAsRelationshipTarget = useCallback((ref: ConnectableRef | null) => {
    setLinkDrag((prev) => (prev ? { ...prev, targetRef: ref } : prev));
  }, []);

  return {
    linkDrag,
    setLinkDrag,
    startLinkDrag,
    hoverAsRelationshipTarget,

    pendingCreateRel,
    pendingRelType,
    setPendingRelType,
    pendingRelError,
    pendingRelTypeOptions,
    showAllPendingRelTypes,
    setShowAllPendingRelTypes,

    closePendingRelationshipDialog,
    confirmCreatePendingRelationship,
  };
}

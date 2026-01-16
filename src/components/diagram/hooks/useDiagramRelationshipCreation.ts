import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Model, RelationshipType } from '../../../domain';
import { createRelationship, getViewpointById } from '../../../domain';
import { getNotation } from '../../../notations';

import { modelStore, useModelStore } from '../../../store';
import type { Selection } from '../../model/selection';
import type { Point } from '../geometry';
import { hitTestConnectable } from '../geometry';
import type { ViewNodeLayout } from '../../../domain';
import type { DiagramLinkDrag } from '../DiagramNode';
import type { ConnectableRef } from '../connectable';
import { sameRef } from '../connectable';

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

  const { relationshipValidationMode } = useModelStore((s) => ({ relationshipValidationMode: s.relationshipValidationMode }));

  const [validationDataTick, setValidationDataTick] = useState(0);
  useEffect(() => {
    if (relationshipValidationMode === 'minimal') return;
    let cancelled = false;
    // Best-effort: allow notations to lazily load rule tables. For ArchiMate,
    // this enables strict relationship validation via a bundled XML matrix.
    const arch = getNotation('archimate');
    const p = arch.prepareRelationshipValidation?.(relationshipValidationMode);
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
  }, [relationshipValidationMode]);

  const [linkDrag, setLinkDrag] = useState<DiagramLinkDrag | null>(null);

  const [pendingCreateRel, setPendingCreateRel] = useState<PendingCreateRel | null>(null);

  const [lastRelType, setLastRelType] = useState<RelationshipType>('Association');
  const [pendingRelType, setPendingRelType] = useState<RelationshipType>('Association');
  const [pendingRelError, setPendingRelError] = useState<string | null>(null);
  const [showAllPendingRelTypes, setShowAllPendingRelTypes] = useState(false);

  // Relationship creation: drag a "wire" from a node handle to another node.
  useEffect(() => {
    if (!linkDrag) return;

    function onMove(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;
      // IMPORTANT: the relationship handle typically uses pointer capture.
      // That prevents pointerenter/leave from firing on other nodes, so we hit-test
      // in model coordinates to detect the current drop target.
      setLinkDrag((prev) => {
        if (!prev) return prev;
        const targetRef = hitTestConnectable(nodes, p, prev.sourceRef);
        return { ...prev, currentPoint: p, targetRef };
      });
    }

    function onUp(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      setLinkDrag((prev) => {
        if (!prev) return prev;
        const target = p ? hitTestConnectable(nodes, p, prev.sourceRef) : prev.targetRef;
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
  }, [linkDrag, clientToModelPoint, lastRelType, nodes]);

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
        notation.canCreateRelationship({ relationshipType: t, sourceType, targetType, mode: relationshipValidationMode }).allowed
      );
    }
  } else {
    // Otherwise, fall back to viewpoint guidance (connectors etc.).
    const vp = view ? getViewpointById(view.viewpointId) : undefined;
    allowed = (vp?.allowedRelationshipTypes?.length ? vp.allowedRelationshipTypes : allTypes) as RelationshipType[];
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
}, [model, pendingCreateRel, relationshipValidationMode, validationDataTick, showAllPendingRelTypes]);

  // When the dialog opens, default the type to last used (if allowed), otherwise first option.
  useEffect(() => {
    if (!pendingCreateRel) return;
    const opts = pendingRelTypeOptions;
    const view = model?.views[pendingCreateRel.viewId];
    const viewKind = view?.kind;

    const preferred =
      isRelTypeForViewKind(viewKind, lastRelType) && opts.includes(lastRelType)
        ? lastRelType
        : defaultRelTypeForViewKind(viewKind);

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
          mode: relationshipValidationMode,
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
  }, [model, pendingCreateRel, pendingRelType, onSelect, relationshipValidationMode, showAllPendingRelTypes]);

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

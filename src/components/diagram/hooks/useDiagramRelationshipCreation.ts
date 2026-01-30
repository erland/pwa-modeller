import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Model, RelationshipType } from '../../../domain';
import { createRelationship, STRONGEST_RELATIONSHIP_VALIDATION_MODE } from '../../../domain';
import { getNotation } from '../../../notations';

import { modelStore } from '../../../store';
import type { Selection } from '../../model/selection';
import type { Point } from '../geometry';
import type { ViewNodeLayout } from '../../../domain';
import type { DiagramLinkDrag } from '../DiagramNode';
import type { ConnectableRef } from '../connectable';
import { sameRef } from '../connectable';

import { updateLinkDragOnMove, resolveLinkDragTargetOnUp } from '../relationshipCreation/linkDrag';
import { computePendingRelationshipTypeOptions, pickDefaultPendingRelationshipType } from '../relationshipCreation/typeResolver';

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

    function onMove(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      if (!p) return;

      // IMPORTANT: the relationship handle typically uses pointer capture.
      // That prevents pointerenter/leave from firing on other nodes, so we hit-test
      // in model coordinates to detect the current drop target.
      setLinkDrag((prev) => {
        if (!prev) return prev;
        return updateLinkDragOnMove({ prev, model, nodes, point: p });
      });
    }

    function onUp(e: PointerEvent) {
      const p = clientToModelPoint(e.clientX, e.clientY);
      setLinkDrag((prev) => {
        if (!prev) return prev;

        const target = resolveLinkDragTargetOnUp({ prev, model, nodes, point: p });

        if (target && !sameRef(target, prev.sourceRef)) {
          setPendingCreateRel({ viewId: prev.viewId, sourceRef: prev.sourceRef, targetRef: target });
          // We'll pick the dialog default via effect below, but set a safe initial value immediately.
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

  const pendingRelTypeOptions = useMemo(() => {
    // Dependency tick to recompute when validation data loads/changes.
    void validationDataTick;

    if (!model || !pendingCreateRel) {
      return getNotation('archimate').getRelationshipTypeOptions().map((o) => o.id) as RelationshipType[];
    }

    return computePendingRelationshipTypeOptions({
      model,
      viewId: pendingCreateRel.viewId,
      sourceRef: pendingCreateRel.sourceRef,
      targetRef: pendingCreateRel.targetRef,
      showAll: showAllPendingRelTypes,
    });
  }, [model, pendingCreateRel, validationDataTick, showAllPendingRelTypes]);

  // When the dialog opens, default the type to last used (if allowed), otherwise first option.
  useEffect(() => {
    if (!model || !pendingCreateRel) return;

    const next = pickDefaultPendingRelationshipType({
      model,
      viewId: pendingCreateRel.viewId,
      sourceRef: pendingCreateRel.sourceRef,
      targetRef: pendingCreateRel.targetRef,
      lastRelType,
      options: pendingRelTypeOptions,
    });

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
    // If the view is an "explicit" relationship view (e.g. created from Sandbox save),
    // ensure the newly created relationship is included.
    modelStore.includeRelationshipInView(pendingCreateRel.viewId, rel.id);
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

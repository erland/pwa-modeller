import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Model, RelationshipType } from '../../../domain';
import { RELATIONSHIP_TYPES, createRelationship, getViewpointById } from '../../../domain';
import { getAllowedRelationshipTypes, initRelationshipValidationMatrixFromBundledTable, validateRelationship } from '../../../domain/config/archimatePalette';

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

  const [matrixLoadTick, setMatrixLoadTick] = useState(0);
  useEffect(() => {
    if (relationshipValidationMode === 'minimal') return;
    let cancelled = false;
    void initRelationshipValidationMatrixFromBundledTable().then(() => {
      if (!cancelled) setMatrixLoadTick((t) => t + 1);
    });
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

const pendingRelTypeOptions = useMemo(() => {
  // Dependency tick to recompute when the relationship matrix loads/changes.
  void matrixLoadTick;
  if (!model || !pendingCreateRel) return RELATIONSHIP_TYPES;

  const { sourceRef, targetRef } = pendingCreateRel;

  // Start with the "best effort" allowed list (either ArchiMate rules or viewpoint guidance).
  let allowed: RelationshipType[] = RELATIONSHIP_TYPES;

  // If both endpoints are elements, filter by ArchiMate rules (mode-aware).
  if (sourceRef.kind === 'element' && targetRef.kind === 'element') {
    const sourceType = model.elements[sourceRef.id]?.type;
    const targetType = model.elements[targetRef.id]?.type;
    if (sourceType && targetType) {
      allowed = getAllowedRelationshipTypes(sourceType, targetType, relationshipValidationMode);
    }
  } else {
    // Otherwise, fall back to viewpoint guidance (connectors etc.).
    const view = model.views[pendingCreateRel.viewId];
    const vp = view ? getViewpointById(view.viewpointId) : undefined;
    allowed = (vp?.allowedRelationshipTypes?.length ? vp.allowedRelationshipTypes : RELATIONSHIP_TYPES) as RelationshipType[];
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
  for (const rt of RELATIONSHIP_TYPES as RelationshipType[]) {
    if (!seen.has(rt)) {
      seen.add(rt);
      out.push(rt);
    }
  }
  return out;
}, [model, pendingCreateRel, relationshipValidationMode, matrixLoadTick, showAllPendingRelTypes]);

  // When the dialog opens, default the type to last used (if allowed), otherwise first option.
  useEffect(() => {
    if (!pendingCreateRel) return;
    const opts = pendingRelTypeOptions;
    const next = opts.includes(lastRelType) ? lastRelType : opts[0] ?? 'Association';
    setPendingRelType(next);
    setPendingRelError(null);
  }, [pendingCreateRel, pendingRelTypeOptions, lastRelType]);

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

    // Only apply ArchiMate relationship rule validation when both endpoints are elements.
    if (sourceRef.kind === 'element' && targetRef.kind === 'element') {
      const sourceType = model.elements[sourceRef.id]?.type;
      const targetType = model.elements[targetRef.id]?.type;
      if (sourceType && targetType) {
        const v = validateRelationship(sourceType, targetType, pendingRelType, relationshipValidationMode);
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

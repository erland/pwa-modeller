import { useEffect, useMemo } from 'react';

import type { Relationship } from '../../../domain';

import type { SandboxRelationshipsState, SandboxNode } from '../workspace/controller/sandboxTypes';

import type { SandboxRenderableRelationship } from './SandboxEdgesLayer';

export type UseSandboxRelationshipsResult = {
  baseVisibleRelationships: SandboxRenderableRelationship[];
  availableRelationshipTypes: string[];
  selectedTypeCount: number;
  visibleRelationships: SandboxRenderableRelationship[];
  edgeOverflow: number;
  renderedRelationships: SandboxRenderableRelationship[];
};

export function useSandboxRelationships({
  modelRelationships,
  nodes,
  relationships,
  maxEdges,
  onSetEnabledRelationshipTypes,
}: {
  modelRelationships: Record<string, Relationship>;
  nodes: SandboxNode[];
  relationships: SandboxRelationshipsState;
  maxEdges: number;
  onSetEnabledRelationshipTypes: (types: string[]) => void;
}): UseSandboxRelationshipsResult {
  const baseVisibleRelationships = useMemo<SandboxRenderableRelationship[]>(() => {
    const ids = new Set(nodes.map((n) => n.elementId));
    const rels = Object.values(modelRelationships).filter(
      (r): r is Relationship & { sourceElementId: string; targetElementId: string } => {
        if (!r.sourceElementId || !r.targetElementId) return false;
        return ids.has(r.sourceElementId) && ids.has(r.targetElementId);
      }
    );

    return rels
      .map((r) => ({
        id: r.id,
        type: String(r.type),
        sourceElementId: r.sourceElementId,
        targetElementId: r.targetElementId,
        attrs: r.attrs,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [modelRelationships, nodes]);

  const availableRelationshipTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of baseVisibleRelationships) set.add(r.type);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseVisibleRelationships]);

  const enabledTypeSet = useMemo(() => new Set(relationships.enabledTypes), [relationships.enabledTypes]);
  const explicitIdSet = useMemo(() => new Set(relationships.explicitIds), [relationships.explicitIds]);

  // When switching to type filtering, default to enabling all available types.
  useEffect(() => {
    if (!relationships.show) return;
    if (relationships.mode !== 'types') return;
    if (relationships.enabledTypes.length > 0) return;
    if (availableRelationshipTypes.length === 0) return;
    onSetEnabledRelationshipTypes(availableRelationshipTypes);
  }, [
    availableRelationshipTypes,
    onSetEnabledRelationshipTypes,
    relationships.enabledTypes.length,
    relationships.mode,
    relationships.show,
  ]);

  const selectedTypeCount = useMemo(() => {
    if (availableRelationshipTypes.length === 0) return 0;
    return availableRelationshipTypes.filter((t) => enabledTypeSet.has(t)).length;
  }, [availableRelationshipTypes, enabledTypeSet]);

  const visibleRelationships = useMemo(() => {
    if (!relationships.show) return [];
    if (relationships.mode === 'all') return baseVisibleRelationships;
    if (relationships.mode === 'types') return baseVisibleRelationships.filter((r) => enabledTypeSet.has(r.type));
    // explicit ids
    return baseVisibleRelationships.filter((r) => explicitIdSet.has(r.id));
  }, [baseVisibleRelationships, enabledTypeSet, explicitIdSet, relationships.mode, relationships.show]);

  const edgeOverflow = useMemo(() => {
    if (!relationships.show) return 0;
    return Math.max(0, visibleRelationships.length - maxEdges);
  }, [maxEdges, relationships.show, visibleRelationships.length]);

  const renderedRelationships = useMemo(() => {
    if (edgeOverflow <= 0) return visibleRelationships;
    return visibleRelationships.slice(0, maxEdges);
  }, [edgeOverflow, maxEdges, visibleRelationships]);

  return {
    baseVisibleRelationships,
    availableRelationshipTypes,
    selectedTypeCount,
    visibleRelationships,
    edgeOverflow,
    renderedRelationships,
  };
}

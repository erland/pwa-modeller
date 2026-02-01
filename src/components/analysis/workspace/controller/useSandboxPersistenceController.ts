import { useCallback, useEffect } from 'react';

import type { Model } from '../../../../domain';

import type { PersistedSandboxStateV1 } from './sandboxPersistence';
import { clearPersistedSandboxState, loadPersistedSandboxState, savePersistedSandboxState } from './sandboxPersistence';
import type { SandboxAddRelatedDirection, SandboxNode, SandboxRelationshipVisibilityMode } from './sandboxTypes';
import { applyNodeCap } from './sandboxStateCaps';
import { clampInt, uniqSortedStrings } from './sandboxStateUtils';

export function useSandboxPersistenceController(args: {
  model: Model | null;
  modelId: string;

  maxNodes: number;
  emitWarning: (msg: string) => void;

  persistEnabled: boolean;
  setPersistEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  nodes: SandboxNode[];
  setNodes: React.Dispatch<React.SetStateAction<SandboxNode[]>>;
  setLastInsertedElementIds: React.Dispatch<React.SetStateAction<string[]>>;

  showRelationships: boolean;
  relationshipMode: SandboxRelationshipVisibilityMode;
  enabledRelationshipTypes: string[];
  explicitRelationshipIds: string[];
  setShowRelationships: React.Dispatch<React.SetStateAction<boolean>>;
  setRelationshipMode: React.Dispatch<React.SetStateAction<SandboxRelationshipVisibilityMode>>;
  setEnabledRelationshipTypes: React.Dispatch<React.SetStateAction<string[]>>;
  setExplicitRelationshipIds: React.Dispatch<React.SetStateAction<string[]>>;

  addRelatedDepth: number;
  addRelatedDirection: SandboxAddRelatedDirection;
  addRelatedEnabledTypes: string[];
  setAddRelatedDepth: React.Dispatch<React.SetStateAction<number>>;
  setAddRelatedDirection: React.Dispatch<React.SetStateAction<SandboxAddRelatedDirection>>;
  setAddRelatedEnabledTypes: React.Dispatch<React.SetStateAction<string[]>>;

  edgeRouting: 'straight' | 'orthogonal';
  setEdgeRouting: React.Dispatch<React.SetStateAction<'straight' | 'orthogonal'>>;
}) {
  const {
    model,
    modelId,
    maxNodes,
    emitWarning,
    persistEnabled,
    setPersistEnabled,
    nodes,
    setNodes,
    setLastInsertedElementIds,

    showRelationships,
    relationshipMode,
    enabledRelationshipTypes,
    explicitRelationshipIds,
    setShowRelationships,
    setRelationshipMode,
    setEnabledRelationshipTypes,
    setExplicitRelationshipIds,

    addRelatedDepth,
    addRelatedDirection,
    addRelatedEnabledTypes,
    setAddRelatedDepth,
    setAddRelatedDirection,
    setAddRelatedEnabledTypes,

    edgeRouting,
    setEdgeRouting,
  } = args;

  const hydrateFromPersisted = useCallback(() => {
    if (!model) return;
    const persisted = loadPersistedSandboxState(modelId);
    if (!persisted) return;

    const nextNodesRaw: SandboxNode[] = persisted.nodes.filter((n) => Boolean(model.elements[n.elementId]));
    const capped = applyNodeCap({ prev: [], toAdd: nextNodesRaw, maxNodes });
    if (capped.dropped > 0) {
      emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
    }

    setNodes(capped.next);
    setLastInsertedElementIds([]);

    setShowRelationships(persisted.relationships.show);
    setRelationshipMode(persisted.relationships.mode ?? 'all');
    setEnabledRelationshipTypes(uniqSortedStrings(persisted.relationships.enabledTypes));
    setExplicitRelationshipIds(uniqSortedStrings(persisted.relationships.explicitIds));

    setAddRelatedDepth(clampInt(persisted.addRelated.depth, 1, 6));
    setAddRelatedDirection(persisted.addRelated.direction ?? 'both');
    setAddRelatedEnabledTypes(uniqSortedStrings(persisted.addRelated.enabledTypes));

    setEdgeRouting(persisted.ui.edgeRouting === 'orthogonal' ? 'orthogonal' : 'straight');
  }, [
    emitWarning,
    maxNodes,
    model,
    modelId,
    setAddRelatedDepth,
    setAddRelatedDirection,
    setAddRelatedEnabledTypes,
    setEdgeRouting,
    setEnabledRelationshipTypes,
    setExplicitRelationshipIds,
    setLastInsertedElementIds,
    setNodes,
    setRelationshipMode,
    setShowRelationships,
  ]);

  const setPersistEnabledSafe = useCallback(
    (enabled: boolean) => {
      setPersistEnabled(enabled);
      if (!enabled) {
        clearPersistedSandboxState(modelId);
        return;
      }
      if (nodes.length === 0) {
        hydrateFromPersisted();
      }
    },
    [hydrateFromPersisted, modelId, nodes.length, setPersistEnabled]
  );

  useEffect(() => {
    if (!persistEnabled) return;
    if (!model) return;

    const payload: PersistedSandboxStateV1 = {
      v: 1,
      nodes,
      relationships: {
        show: showRelationships,
        mode: relationshipMode,
        enabledTypes: enabledRelationshipTypes,
        explicitIds: explicitRelationshipIds,
      },
      addRelated: {
        depth: addRelatedDepth,
        direction: addRelatedDirection,
        enabledTypes: addRelatedEnabledTypes,
      },
      ui: {
        edgeRouting,
      },
    };

    savePersistedSandboxState(modelId, payload);
  }, [
    addRelatedDepth,
    addRelatedDirection,
    addRelatedEnabledTypes,
    edgeRouting,
    enabledRelationshipTypes,
    explicitRelationshipIds,
    model,
    modelId,
    nodes,
    persistEnabled,
    relationshipMode,
    showRelationships,
  ]);

  return { hydrateFromPersisted, setPersistEnabledSafe } as const;
}

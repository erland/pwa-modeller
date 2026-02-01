import { useCallback } from 'react';

import type { Model, Relationship } from '../../../../domain';

import type { SandboxNode, SandboxRelationshipVisibilityMode } from './sandboxTypes';
import { applyNodeCap } from './sandboxStateCaps';
import { GRID_COLS, GRID_X, GRID_Y } from './sandboxStateConstants';
import {
  autoLayoutSandboxNodes,
  seedFromElementsLayout,
  seedFromViewLayout,
} from './sandboxStateLayout';
import { uniqSortedStrings } from './sandboxStateUtils';

export function useSandboxSeedingActions(args: {
  model: Model | null;
  maxNodes: number;
  emitWarning: (msg: string) => void;

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
}) {
  const {
    model,
    maxNodes,
    emitWarning,
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
  } = args;

  const seedFromElements = useCallback(
    (seedArgs: {
      elementIds: string[];
      relationshipIds?: string[];
      relationshipTypes?: string[];
      layout?: {
        mode: 'grid' | 'distance' | 'levels';
        levelById?: Record<string, number>;
        orderById?: Record<string, number>;
      };
    }) => {
      if (!model) return;

      const inputIds = seedArgs.elementIds ?? [];
      const validIds = inputIds.filter(
        (id) => typeof id === 'string' && id.length > 0 && Boolean(model.elements[id])
      );
      const uniqIds = Array.from(new Set(validIds));
      if (uniqIds.length === 0) return;

      const mode = seedArgs.layout?.mode ?? 'grid';
      const levelById = seedArgs.layout?.levelById ?? {};
      const orderById = seedArgs.layout?.orderById ?? {};

      const margin = { x: 120, y: 120 };
      const nextNodes: SandboxNode[] = seedFromElementsLayout({
        elementIds: uniqIds,
        mode,
        levelById,
        orderById,
        margin,
        gridX: GRID_X,
        gridY: GRID_Y,
        gridCols: GRID_COLS,
      });

      const capped = applyNodeCap({ prev: [], toAdd: nextNodes, maxNodes });
      if (capped.dropped > 0) {
        emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
      }
      setNodes(capped.next);

      setShowRelationships(true);

      const relationshipIds = seedArgs.relationshipIds ? uniqSortedStrings(seedArgs.relationshipIds) : [];
      const relationshipTypes = seedArgs.relationshipTypes ? uniqSortedStrings(seedArgs.relationshipTypes) : [];

      if (relationshipIds.length > 0) {
        const validRelIds = relationshipIds.filter((id) =>
          Boolean((model.relationships as Record<string, Relationship | undefined>)[id])
        );
        setRelationshipMode('explicit');
        setExplicitRelationshipIds(validRelIds);
      } else if (relationshipTypes.length > 0) {
        setRelationshipMode('types');
        setEnabledRelationshipTypes(relationshipTypes);
        setExplicitRelationshipIds([]);
      } else {
        setRelationshipMode('all');
        setEnabledRelationshipTypes([]);
        setExplicitRelationshipIds([]);
      }
    },
    [emitWarning, maxNodes, model, setEnabledRelationshipTypes, setExplicitRelationshipIds, setNodes, setRelationshipMode, setShowRelationships]
  );

  const seedFromView = useCallback(
    (viewId: string) => {
      if (!model) return;
      const next = seedFromViewLayout({ model, viewId, margin: { x: 120, y: 120 } });
      if (next.length === 0) return;

      const capped = applyNodeCap({ prev: [], toAdd: next, maxNodes });
      if (capped.dropped > 0) {
        emitWarning(`Sandbox node cap reached (${maxNodes}). Skipped ${capped.dropped} element(s).`);
      }
      setNodes(capped.next);
      setLastInsertedElementIds([]);
    },
    [emitWarning, maxNodes, model, setLastInsertedElementIds, setNodes]
  );

  const autoLayout = useCallback(() => {
    if (!model) return;
    setNodes((prev) =>
      autoLayoutSandboxNodes({
        model,
        nodes: prev,
        showRelationships,
        relationshipMode,
        enabledRelationshipTypes,
        explicitRelationshipIds,
        margin: { x: 120, y: 120 },
        gridX: GRID_X,
        gridY: GRID_Y,
        gridCols: GRID_COLS,
      })
    );
  }, [enabledRelationshipTypes, explicitRelationshipIds, model, relationshipMode, setNodes, showRelationships]);

  return { seedFromElements, seedFromView, autoLayout } as const;
}

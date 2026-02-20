import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../domain';
import { modelStore } from '../../../store';
import type { Selection } from '../../model/selection';

import type { SandboxAddRelatedDirection } from '../../analysis/workspace/controller/sandboxTypes';
import { collectAllRelationshipTypes } from '../../analysis/workspace/controller/sandboxStateUtils';

import type { SandboxInsertDialogProps } from '../../analysis/modes/sandboxInsert/useSandboxInsertDialogState';

type Args = {
  model: Model | null;
  activeViewId: string | null | undefined;
  selection: Selection;
  /** Element ids already present in the active view (used by dialog to avoid selecting existing). */
  existingElementIds: string[];
  /** Optional node cap; used only for dialog warnings (actual cap is enforced by sandbox state). */
  maxNodes?: number;
};

type Result = {
  isOpen: boolean;
  openAddRelatedDialog: () => void;
  /** Fully-typed props to pass to <SandboxInsertDialog /> (or null if model is missing). */
  dialogProps: SandboxInsertDialogProps | null;
};

type RelatedConfirmArgs = {
  enabledRelationshipTypes: string[];
  options: { depth: number; direction: SandboxAddRelatedDirection };
  selectedElementIds: string[];
};

function clampInt(n: number, min: number, max: number): number {
  const nn = Number.isFinite(n) ? Math.round(n) : min;
  return Math.min(max, Math.max(min, nn));
}

function readJsonStringArray(key: string): string[] {
  const v = localStorage.getItem(key);
  try {
    const parsed = v ? (JSON.parse(v) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Controller for the "Add related" dialog in diagram views.
 *
 * Owns dialog open state, localStorage-backed options, and the confirm/apply logic.
 */
export function useAddRelatedToViewController({ model, activeViewId, selection, existingElementIds, maxNodes }: Args): Result {
  const allRelationshipTypes = useMemo(() => (model ? collectAllRelationshipTypes(model) : []), [model]);

  const [isOpen, setIsOpen] = useState(false);
  const [anchorElementIds, setAnchorElementIds] = useState<string[]>([]);

  const [depth, setDepth] = useState<number>(() => {
    const v = localStorage.getItem('diagram.addRelated.depth');
    const n = v ? Number(v) : 1;
    return clampInt(n, 1, 6);
  });

  const [direction, setDirection] = useState<SandboxAddRelatedDirection>(() => {
    const v = localStorage.getItem('diagram.addRelated.direction');
    return v === 'incoming' || v === 'outgoing' || v === 'both' ? (v as SandboxAddRelatedDirection) : 'both';
  });

  const [enabledRelationshipTypes, setEnabledRelationshipTypes] = useState<string[]>(() => {
    return readJsonStringArray('diagram.addRelated.enabledTypes');
  });

  useEffect(() => {
    localStorage.setItem('diagram.addRelated.depth', String(depth));
  }, [depth]);

  useEffect(() => {
    localStorage.setItem('diagram.addRelated.direction', direction);
  }, [direction]);

  useEffect(() => {
    localStorage.setItem('diagram.addRelated.enabledTypes', JSON.stringify(enabledRelationshipTypes));
  }, [enabledRelationshipTypes]);

  const openAddRelatedDialog = useCallback(() => {
    if (!activeViewId) return;
    if (selection.kind === 'viewNode') {
      setAnchorElementIds([selection.elementId]);
      setIsOpen(true);
    } else if (selection.kind === 'viewNodes') {
      setAnchorElementIds(selection.elementIds);
      setIsOpen(true);
    }
  }, [activeViewId, selection]);

  const onCancel = useCallback(() => setIsOpen(false), []);

  const onConfirm = useCallback(
    ({ enabledRelationshipTypes: enabled, options, selectedElementIds }: RelatedConfirmArgs) => {
      setIsOpen(false);
      setDepth(options.depth);
      setDirection(options.direction);
      setEnabledRelationshipTypes(enabled);

      if (!activeViewId) return;
      if (selectedElementIds.length === 0) return;

      // Add selected elements to the current view via public store API.
      for (const eid of selectedElementIds) {
        modelStore.addElementToView(activeViewId, eid);
      }

      // If the view uses explicit relationship visibility, ensure relationships between
      // visible nodes are included so connections appear.
      const m = modelStore.getState().model;
      const v = m?.views?.[activeViewId];
      if (m && v?.relationshipVisibility?.mode === 'explicit') {
        const nodeSet = new Set(
          (v.layout?.nodes ?? [])
            .map((nn) => nn.elementId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        );
        for (const r of Object.values(m.relationships)) {
          const src = (r as any).sourceId ?? (r as any).sourceElementId;
          const tgt = (r as any).targetId ?? (r as any).targetElementId;
          if (!src || !tgt) continue;
          if (nodeSet.has(String(src)) && nodeSet.has(String(tgt))) {
            modelStore.includeRelationshipInView(activeViewId, r.id);
          }
        }
      }

      void modelStore.autoLayoutView(activeViewId);
    },
    [activeViewId]
  );

  const initialEnabledRelationshipTypes =
    enabledRelationshipTypes.length > 0 ? enabledRelationshipTypes : allRelationshipTypes;

  const dialogProps: SandboxInsertDialogProps | null = model
    ? {
        kind: 'related',
        isOpen,
        model,
        maxNodes,
        anchorElementIds,
        initialOptions: { depth, direction },
        onConfirm,
        existingElementIds,
        allRelationshipTypes,
        initialEnabledRelationshipTypes,
        onCancel,
      }
    : null;

  return { isOpen, openAddRelatedDialog, dialogProps };
}

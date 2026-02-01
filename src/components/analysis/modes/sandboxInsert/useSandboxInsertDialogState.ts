import { useCallback, useMemo } from 'react';

import type { Model } from '../../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
} from '../../workspace/controller/sandboxTypes';

import { computeRelationshipTypesForDialog, normalizeIntermediatesOptions, normalizeRelatedOptions } from './sandboxInsertPolicy';
import type { Candidate, PreviewState } from './types';
import { useSandboxInsertOptionsState } from './useSandboxInsertOptionsState';
import { useSandboxInsertPreviewState } from './useSandboxInsertPreviewState';
import { useSandboxInsertSelectionState } from './useSandboxInsertSelectionState';

type IntermediatesProps = {
  kind: 'intermediates';
  sourceElementId: string;
  targetElementId: string;
  contextLabel?: string;
  contextRelationshipType?: string;
  initialOptions: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
  onConfirm: (args: {
    enabledRelationshipTypes: string[];
    options: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
    selectedElementIds: string[];
  }) => void;
};

type RelatedProps = {
  kind: 'related';
  anchorElementIds: string[];
  initialOptions: { depth: number; direction: SandboxAddRelatedDirection };
  onConfirm: (args: {
    enabledRelationshipTypes: string[];
    options: { depth: number; direction: SandboxAddRelatedDirection };
    selectedElementIds: string[];
  }) => void;
};

type BaseProps = {
  isOpen: boolean;
  model: Model;
  existingElementIds: string[];
  /** Optional node cap; used only for dialog warnings (actual cap is enforced by sandbox state). */
  maxNodes?: number;
  allRelationshipTypes: string[];
  initialEnabledRelationshipTypes: string[];
  onCancel: () => void;
};

export type SandboxInsertDialogProps = BaseProps & (IntermediatesProps | RelatedProps);

export type SandboxInsertDialogViewModel = {
  title: string;
  isOpen: boolean;
  model: Model;
  kind: 'intermediates' | 'related';
  sourceElementId?: string;
  targetElementId?: string;
  anchorElementIds?: string[];
  contextLabel?: string;
  contextRelationshipType?: string;

  allElementTypesForModel: string[];
  relationshipTypesForDialog: string[];

  mode: SandboxInsertIntermediatesMode;
  setMode: React.Dispatch<React.SetStateAction<SandboxInsertIntermediatesMode>>;
  k: number;
  setK: React.Dispatch<React.SetStateAction<number>>;
  maxHops: number;
  setMaxHops: React.Dispatch<React.SetStateAction<number>>;
  depth: number;
  setDepth: React.Dispatch<React.SetStateAction<number>>;
  direction: SandboxAddRelatedDirection;
  setDirection: React.Dispatch<React.SetStateAction<SandboxAddRelatedDirection>>;

  enabledTypes: string[];
  setEnabledTypes: React.Dispatch<React.SetStateAction<string[]>>;
  enabledElementTypes: string[];
  setEnabledElementTypes: React.Dispatch<React.SetStateAction<string[]>>;

  preview: PreviewState | null;
  error: string | null;

  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;

  existingSet: Set<string>;
  selectedIds: Set<string>;
  toggleSelectedId: (id: string) => void;

  candidateById: Map<string, Candidate>;
  visibleCandidateIds: Set<string>;
  selectedCount: number;
  candidatesCount: number;
  selectedVisibleCount: number;
  selectedNewCount: number;
  maxNewNodes: number | null;

  canInsert: boolean;

  selectAllVisible: () => void;
  clearVisible: () => void;
  selectNone: () => void;

  onCancel: () => void;
  onConfirmClick: () => void;
};

export function useSandboxInsertDialogState(props: SandboxInsertDialogProps): SandboxInsertDialogViewModel {
  const { isOpen, model, existingElementIds, allRelationshipTypes, initialEnabledRelationshipTypes } = props;

  const existingSet = useMemo(() => new Set(existingElementIds), [existingElementIds]);

  const kind = props.kind;
  const sourceElementId = kind === 'intermediates' ? props.sourceElementId : undefined;
  const targetElementId = kind === 'intermediates' ? props.targetElementId : undefined;
  const anchorElementIds = kind === 'related' ? props.anchorElementIds : undefined;
  const anchorKey = useMemo(() => (anchorElementIds ? anchorElementIds.join('|') : ''), [anchorElementIds]);

  const relationshipTypesForDialog = useMemo(() => {
    return computeRelationshipTypesForDialog({
      model,
      kind,
      sourceElementId,
      targetElementId,
      anchorElementIds,
      allRelationshipTypes,
    });
  }, [allRelationshipTypes, anchorKey, kind, model, sourceElementId, targetElementId]);

  const optionsArgs = useMemo(() => {
    if (kind === 'intermediates') {
      return {
        kind: 'intermediates' as const,
        initialOptions: (props as IntermediatesProps).initialOptions,
      };
    }
    return {
      kind: 'related' as const,
      initialOptions: (props as RelatedProps).initialOptions,
    };
  }, [kind, props]);

  const options = useSandboxInsertOptionsState({
    isOpen,
    model,
    relationshipTypesForDialog,
    initialEnabledRelationshipTypes,
    ...optionsArgs,
  });

  const selection = useSandboxInsertSelectionState({ openNonce: options.openNonce });

  const previewArgs = useMemo(() => {
    if (kind === 'intermediates') {
      return {
        kind: 'intermediates' as const,
        sourceElementId: (props as IntermediatesProps).sourceElementId,
        targetElementId: (props as IntermediatesProps).targetElementId,
      };
    }
    return {
      kind: 'related' as const,
      anchorElementIds: (props as RelatedProps).anchorElementIds,
    };
  }, [anchorKey, kind, props]);

  const previewState = useSandboxInsertPreviewState({
    isOpen,
    model,
    existingSet,
    enabledTypes: options.enabledTypes,
    enabledElementTypesSet: options.enabledElementTypesSet,
    openNonce: options.openNonce,
    mode: options.mode,
    k: options.k,
    maxHops: options.maxHops,
    depth: options.depth,
    direction: options.direction,
    search: options.search,
    selectedIds: selection.selectedIds,
    selectedIdsRef: selection.selectedIdsRef,
    setSelectedIds: selection.setSelectedIds,
    ...previewArgs,
  });

  const title = kind === 'related' ? 'Add related elements' : 'Insert intermediate elements';

  const maxNodes = props.maxNodes;
  const maxNewNodes = maxNodes ? Math.max(0, maxNodes - existingElementIds.length) : null;

  const selectedCount = selection.selectedIds.size;
  const canInsert = previewState.preview !== null && selectedCount > 0 && options.enabledTypes.length > 0;

  const selectAllVisible = useCallback(() => {
    selection.setSelectedIds((prev) => {
      const next = new Set<string>(prev);
      for (const id of previewState.visibleCandidateIds) {
        if (existingSet.has(id)) continue;
        next.add(id);
      }
      return next;
    });
  }, [existingSet, previewState.visibleCandidateIds, selection]);

  const clearVisible = useCallback(() => {
    selection.setSelectedIds((prev) => {
      const next = new Set<string>(prev);
      for (const id of previewState.visibleCandidateIds) next.delete(id);
      return next;
    });
  }, [previewState.visibleCandidateIds, selection]);

  const onConfirmClick = useCallback(() => {
    const selectedElementIds = Array.from(selection.selectedIds);
    if (kind === 'intermediates') {
      (props as IntermediatesProps).onConfirm({
        enabledRelationshipTypes: options.enabledTypes,
        options: normalizeIntermediatesOptions({
          mode: options.mode,
          k: options.k,
          maxHops: options.maxHops,
          direction: options.direction,
        }),
        selectedElementIds,
      });
    } else {
      (props as RelatedProps).onConfirm({
        enabledRelationshipTypes: options.enabledTypes,
        options: normalizeRelatedOptions({ depth: options.depth, direction: options.direction }),
        selectedElementIds,
      });
    }
  }, [kind, options, props, selection.selectedIds]);

  return {
    title,
    isOpen,
    model,
    kind,
    sourceElementId,
    targetElementId,
    anchorElementIds,
    contextLabel: kind === 'intermediates' ? (props as IntermediatesProps).contextLabel : undefined,
    contextRelationshipType: kind === 'intermediates' ? (props as IntermediatesProps).contextRelationshipType : undefined,

    allElementTypesForModel: options.allElementTypesForModel,
    relationshipTypesForDialog,

    mode: options.mode,
    setMode: options.setMode,
    k: options.k,
    setK: options.setK,
    maxHops: options.maxHops,
    setMaxHops: options.setMaxHops,
    depth: options.depth,
    setDepth: options.setDepth,
    direction: options.direction,
    setDirection: options.setDirection,

    enabledTypes: options.enabledTypes,
    setEnabledTypes: options.setEnabledTypes,
    enabledElementTypes: options.enabledElementTypes,
    setEnabledElementTypes: options.setEnabledElementTypes,

    preview: previewState.preview,
    error: previewState.error,

    search: options.search,
    setSearch: options.setSearch,

    existingSet,
    selectedIds: selection.selectedIds,
    toggleSelectedId: selection.toggleSelectedId,

    candidateById: previewState.candidateById,
    visibleCandidateIds: previewState.visibleCandidateIds,

    selectedCount,
    candidatesCount: previewState.candidatesCount,
    selectedVisibleCount: previewState.selectedVisibleCount,
    selectedNewCount: previewState.selectedNewCount,
    maxNewNodes,

    canInsert,

    selectAllVisible,
    clearVisible,
    selectNone: selection.selectNone,

    onCancel: props.onCancel,
    onConfirmClick,
  };
}

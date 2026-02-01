import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Model } from '../../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
} from '../../workspace/controller/sandboxTypes';

import { computeIntermediatesPreview, computeRelatedPreview } from './computePreview';
import { buildCandidateById, computeVisibleCandidateIds, countSelectedNew, countSelectedVisible } from './sandboxInsertCandidates';
import {
  computeAllElementTypesForModel,
  computeDefaultSelectedIds,
  computeInitialEnabledRelationshipTypes,
  computeRelationshipTypesForDialog,
  keepEnabledRelationshipTypesValid,
  normalizeIntermediatesOptions,
  normalizeRelatedOptions,
} from './sandboxInsertPolicy';
import type { Candidate, PreviewState } from './types';

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

  const allElementTypesForModel = useMemo(() => computeAllElementTypesForModel(model), [model]);

  const relationshipTypesForDialog = useMemo(() => {
    return computeRelationshipTypesForDialog({
      model,
      kind: props.kind,
      sourceElementId: props.kind === 'intermediates' ? props.sourceElementId : undefined,
      targetElementId: props.kind === 'intermediates' ? props.targetElementId : undefined,
      anchorElementIds: props.kind === 'related' ? props.anchorElementIds : undefined,
      allRelationshipTypes,
    });
  }, [allRelationshipTypes, model, props]);

  // Shared settings
  const [direction, setDirection] = useState<SandboxAddRelatedDirection>('both');
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);
  const [enabledElementTypes, setEnabledElementTypes] = useState<string[]>([]);

  // Intermediates settings
  const [mode, setMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [k, setK] = useState(3);
  const [maxHops, setMaxHops] = useState(8);

  // Related settings
  const [depth, setDepth] = useState(1);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const selectedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const enabledElementTypesSet = useMemo(() => new Set(enabledElementTypes), [enabledElementTypes]);

  useEffect(() => {
    if (!isOpen) return;

    setEnabledTypes(
      computeInitialEnabledRelationshipTypes({
        relationshipTypesForDialog,
        initialEnabledRelationshipTypes,
      }),
    );
    setEnabledElementTypes(allElementTypesForModel);
    setPreview(null);
    setSelectedIds(new Set());
    setError(null);
    setSearch('');

    if (props.kind === 'intermediates') {
      const o = normalizeIntermediatesOptions(props.initialOptions);
      setMode(o.mode);
      setK(o.k);
      setMaxHops(o.maxHops);
      setDirection(o.direction);
      setDepth(1);
    } else {
      const o = normalizeRelatedOptions(props.initialOptions);
      setDepth(o.depth);
      setDirection(o.direction);
      setMode('shortest');
      setK(3);
      setMaxHops(8);
    }
  }, [allElementTypesForModel, initialEnabledRelationshipTypes, isOpen, props, relationshipTypesForDialog]);

  // Keep enabled relationship types valid when compatible types change.
  useEffect(() => {
    setEnabledTypes((prev) =>
      keepEnabledRelationshipTypesValid({ isOpen, enabledTypes: prev, relationshipTypesForDialog }),
    );
  }, [isOpen, relationshipTypesForDialog]);

  const computePreview = useCallback(() => {
    if (!isOpen) return;
    setError(null);

    if (enabledTypes.length === 0) {
      setError('Select at least one relationship type.');
      setPreview(null);
      return;
    }

    if (props.kind === 'intermediates') {
      const { sourceElementId, targetElementId } = props;
      if (!sourceElementId || !targetElementId) {
        setError('Missing endpoints.');
        setPreview(null);
        return;
      }
      if (sourceElementId === targetElementId) {
        setError('Endpoints must be different.');
        setPreview(null);
        return;
      }

      const res = computeIntermediatesPreview({
        model,
        enabledRelationshipTypes: enabledTypes,
        existingSet,
        enabledElementTypesSet,
        includeAlreadyInSandbox: false,
        sourceElementId,
        targetElementId,
        mode,
        k,
        maxHops,
        direction,
      });

      if (res.paths.length === 0) {
        setError('No paths found for the current settings.');
        setPreview({ kind: 'intermediates', paths: [], candidates: [] });
        setSelectedIds(new Set());
        return;
      }

      const nextSelected = computeDefaultSelectedIds({
        prevSelected: selectedIdsRef.current,
        candidates: res.candidates,
      });

      setPreview({ kind: 'intermediates', paths: res.paths, candidates: res.candidates });
      setSelectedIds(nextSelected);
      return;
    }

    const anchors = props.anchorElementIds.filter((id) => Boolean(model.elements[id]));
    if (anchors.length === 0) {
      setError('Select one or more anchor nodes.');
      setPreview(null);
      return;
    }

    const res = computeRelatedPreview({
      model,
      enabledRelationshipTypes: enabledTypes,
      existingSet,
      enabledElementTypesSet,
      includeAlreadyInSandbox: false,
      anchorElementIds: anchors,
      depth,
      direction,
    });

    const nextSelected = computeDefaultSelectedIds({
      prevSelected: selectedIdsRef.current,
      candidates: res.candidates,
    });

    if (res.candidates.length === 0) {
      setError('No related elements found for the current settings.');
    }

    setPreview({ kind: 'related', groups: res.groups, candidates: res.candidates });
    setSelectedIds(nextSelected);
  }, [depth, direction, enabledElementTypesSet, enabledTypes, existingSet, isOpen, k, maxHops, mode, model, props]);

  // Auto-preview on open + whenever settings change.
  useEffect(() => {
    if (!isOpen) return;
    if (enabledTypes.length === 0) return;
    const t = window.setTimeout(() => {
      computePreview();
    }, 120);
    return () => window.clearTimeout(t);
  }, [computePreview, enabledTypes.length, isOpen]);

  const title = props.kind === 'related' ? 'Add related elements' : 'Insert intermediate elements';

  const maxNodes = props.maxNodes;
  const maxNewNodes = maxNodes ? Math.max(0, maxNodes - existingElementIds.length) : null;

  const candidateById = useMemo(() => buildCandidateById(preview), [preview]);

  const visibleCandidateIds = useMemo(() => computeVisibleCandidateIds(preview, search), [preview, search]);

  const selectedCount = selectedIds.size;
  const candidatesCount = preview?.candidates.length ?? 0;

  const selectedNewCount = useMemo(() => {
    if (!preview) return 0;
    return countSelectedNew({ candidateById, selectedIds });
  }, [candidateById, preview, selectedIds]);

  const selectedVisibleCount = useMemo(() => {
    if (!preview) return 0;
    return countSelectedVisible({ selectedIds, visibleCandidateIds });
  }, [preview, selectedIds, visibleCandidateIds]);

  const canInsert = preview !== null && selectedCount > 0 && enabledTypes.length > 0;

  const toggleSelectedId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>(prev);
      for (const id of visibleCandidateIds) {
        if (existingSet.has(id)) continue;
        next.add(id);
      }
      return next;
    });
  }, [existingSet, visibleCandidateIds]);

  const clearVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>(prev);
      for (const id of visibleCandidateIds) next.delete(id);
      return next;
    });
  }, [visibleCandidateIds]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const onConfirmClick = useCallback(() => {
    const selectedElementIds = Array.from(selectedIds);
    if (props.kind === 'intermediates') {
      props.onConfirm({
        enabledRelationshipTypes: enabledTypes,
        options: normalizeIntermediatesOptions({ mode, k, maxHops, direction }),
        selectedElementIds,
      });
    } else {
      props.onConfirm({
        enabledRelationshipTypes: enabledTypes,
        options: normalizeRelatedOptions({ depth, direction }),
        selectedElementIds,
      });
    }
  }, [depth, direction, enabledTypes, k, maxHops, mode, props, selectedIds]);

  return {
    title,
    isOpen,
    model,
    kind: props.kind,
    sourceElementId: props.kind === 'intermediates' ? props.sourceElementId : undefined,
    targetElementId: props.kind === 'intermediates' ? props.targetElementId : undefined,
    anchorElementIds: props.kind === 'related' ? props.anchorElementIds : undefined,
    contextLabel: props.kind === 'intermediates' ? props.contextLabel : undefined,
    contextRelationshipType: props.kind === 'intermediates' ? props.contextRelationshipType : undefined,
    allElementTypesForModel,
    relationshipTypesForDialog,
    mode,
    setMode,
    k,
    setK,
    maxHops,
    setMaxHops,
    depth,
    setDepth,
    direction,
    setDirection,
    enabledTypes,
    setEnabledTypes,
    enabledElementTypes,
    setEnabledElementTypes,
    preview,
    error,
    search,
    setSearch,
    existingSet,
    selectedIds,
    toggleSelectedId,
    candidateById,
    visibleCandidateIds,
    selectedCount,
    candidatesCount,
    selectedVisibleCount,
    selectedNewCount,
    maxNewNodes,
    canInsert,
    selectAllVisible,
    clearVisible,
    selectNone,
    onCancel: props.onCancel,
    onConfirmClick,
  };
}

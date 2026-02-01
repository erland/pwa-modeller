import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
} from '../../workspace/controller/sandboxTypes';

import { computeIntermediatesPreview, computeRelatedPreview } from './computePreview';
import {
  buildCandidateById,
  computeVisibleCandidateIds,
  countSelectedNew,
  countSelectedVisible,
} from './sandboxInsertCandidates';
import { computeDefaultSelectedIds } from './sandboxInsertPolicy';
import type { Candidate, PreviewState } from './types';

export type SandboxInsertPreviewStateArgs =
  | {
      kind: 'intermediates';
      sourceElementId: string;
      targetElementId: string;
    }
  | {
      kind: 'related';
      anchorElementIds: string[];
    };

export type SandboxInsertPreviewState = {
  preview: PreviewState | null;
  error: string | null;

  candidateById: Map<string, Candidate>;
  visibleCandidateIds: Set<string>;

  candidatesCount: number;
  selectedNewCount: number;
  selectedVisibleCount: number;
};

export function useSandboxInsertPreviewState(
  args: {
    isOpen: boolean;
    model: Model;
    existingSet: Set<string>;
    enabledTypes: string[];
    enabledElementTypesSet: Set<string>;
    openNonce: number;

    mode: SandboxInsertIntermediatesMode;
    k: number;
    maxHops: number;
    depth: number;
    direction: SandboxAddRelatedDirection;

    search: string;

    selectedIds: Set<string>;
    selectedIdsRef: React.MutableRefObject<Set<string>>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  } & SandboxInsertPreviewStateArgs,
): SandboxInsertPreviewState {
  const {
    isOpen,
    model,
    existingSet,
    enabledTypes,
    enabledElementTypesSet,
    openNonce,
    mode,
    k,
    maxHops,
    depth,
    direction,
    search,
    selectedIds,
    selectedIdsRef,
    setSelectedIds,
  } = args;

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset preview on open.
  useEffect(() => {
    if (!isOpen) return;
    if (openNonce === 0) return;
    setPreview(null);
    setError(null);
  }, [isOpen, openNonce]);

  const computePreview = useCallback(() => {
    if (!isOpen) return;
    setError(null);

    if (enabledTypes.length === 0) {
      setError('Select at least one relationship type.');
      setPreview(null);
      return;
    }

    if (args.kind === 'intermediates') {
      const { sourceElementId, targetElementId } = args;
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

    const anchors = args.anchorElementIds.filter((id) => Boolean(model.elements[id]));
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
  }, [
    args,
    depth,
    direction,
    enabledElementTypesSet,
    enabledTypes,
    existingSet,
    isOpen,
    k,
    maxHops,
    mode,
    model,
    selectedIdsRef,
    setSelectedIds,
  ]);

  // Auto-preview on open + whenever settings change.
  useEffect(() => {
    if (!isOpen) return;
    if (enabledTypes.length === 0) return;
    const t = window.setTimeout(() => {
      computePreview();
    }, 120);
    return () => window.clearTimeout(t);
  }, [computePreview, enabledTypes.length, isOpen]);

  const candidateById = useMemo(() => buildCandidateById(preview), [preview]);
  const visibleCandidateIds = useMemo(() => computeVisibleCandidateIds(preview, search), [preview, search]);

  const candidatesCount = preview?.candidates.length ?? 0;

  const selectedNewCount = useMemo(() => {
    if (!preview) return 0;
    return countSelectedNew({ candidateById, selectedIds });
  }, [candidateById, preview, selectedIds]);

  const selectedVisibleCount = useMemo(() => {
    if (!preview) return 0;
    return countSelectedVisible({ selectedIds, visibleCandidateIds });
  }, [preview, selectedIds, visibleCandidateIds]);

  return {
    preview,
    error,
    candidateById,
    visibleCandidateIds,
    candidatesCount,
    selectedNewCount,
    selectedVisibleCount,
  };
}

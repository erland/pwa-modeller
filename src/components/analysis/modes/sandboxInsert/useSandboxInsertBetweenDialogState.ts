import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
} from '../../workspace/controller/sandboxTypes';

import { computeIntermediatesPreview, computeRelatedPreview } from './computePreview';
import type { PreviewState } from './types';
import { clampInt } from './utils';

type IntermediatesConfirmArgs = {
  kind: 'intermediates';
  enabledRelationshipTypes: string[];
  options: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
  selectedElementIds: string[];
};

type RelatedConfirmArgs = {
  kind: 'related';
  enabledRelationshipTypes: string[];
  options: { depth: number; direction: SandboxAddRelatedDirection };
  selectedElementIds: string[];
};

type CommonProps = {
  isOpen: boolean;
  model: Model;
  existingElementIds: string[];
  allRelationshipTypes: string[];
  initialEnabledRelationshipTypes: string[];
  onCancel: () => void;
  onConfirm: (args: IntermediatesConfirmArgs | RelatedConfirmArgs) => void;
};

type IntermediatesProps = CommonProps & {
  kind: 'intermediates';
  sourceElementId: string;
  targetElementId: string;
  contextLabel?: string;
  contextRelationshipType?: string;
  initialOptions: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
};

type RelatedProps = CommonProps & {
  kind: 'related';
  anchorElementIds: string[];
  contextLabel?: string;
  initialOptions: { depth: number; direction: SandboxAddRelatedDirection };
};

export type SandboxInsertBetweenDialogProps = IntermediatesProps | RelatedProps;

export function useSandboxInsertBetweenDialogState(props: SandboxInsertBetweenDialogProps) {
  const {
    isOpen,
    model,
    existingElementIds,
    allRelationshipTypes,
    initialEnabledRelationshipTypes,
    onCancel,
    onConfirm,
  } = props;

  const existingSet = useMemo(() => new Set(existingElementIds), [existingElementIds]);

  const [mode, setMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [k, setK] = useState(3);
  const [maxHops, setMaxHops] = useState(8);
  const [direction, setDirection] = useState<SandboxAddRelatedDirection>('both');
  const [depth, setDepth] = useState(1);
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const enabledKey = useMemo(() => {
    const base = initialEnabledRelationshipTypes.length ? initialEnabledRelationshipTypes : allRelationshipTypes;
    return base.join('|');
  }, [allRelationshipTypes, initialEnabledRelationshipTypes]);

  const kind = props.kind;
  const sourceElementId = kind === 'intermediates' ? props.sourceElementId : '';
  const targetElementId = kind === 'intermediates' ? props.targetElementId : '';
  const anchorKey = kind === 'related' ? props.anchorElementIds.join(',') : '';

  const initMode = kind === 'intermediates' ? props.initialOptions.mode : 'shortest';
  const initK = kind === 'intermediates' ? props.initialOptions.k : 3;
  const initMaxHops = kind === 'intermediates' ? props.initialOptions.maxHops : 8;
  const initDirection = props.initialOptions.direction;
  const initDepth = kind === 'related' ? props.initialOptions.depth : 1;

  const resetKey = useMemo(() => {
    return kind === 'intermediates'
      ? `i|${sourceElementId}|${targetElementId}|${initMode}|${initK}|${initMaxHops}|${initDirection}|${enabledKey}`
      : `r|${anchorKey}|${initDepth}|${initDirection}|${enabledKey}`;
  }, [anchorKey, enabledKey, initDepth, initDirection, initK, initMaxHops, initMode, kind, sourceElementId, targetElementId]);

  useEffect(() => {
    if (!isOpen) return;

    setEnabledTypes(initialEnabledRelationshipTypes.length ? initialEnabledRelationshipTypes : allRelationshipTypes);
    setPreview(null);
    setSelectedIds(new Set());
    setError(null);

    if (kind === 'intermediates') {
      setMode(initMode);
      setK(clampInt(initK, 1, 10));
      setMaxHops(clampInt(initMaxHops, 1, 16));
      setDirection(initDirection);
      setDepth(1);
    } else {
      setMode('shortest');
      setK(3);
      setMaxHops(8);
      setDirection(initDirection);
      setDepth(clampInt(initDepth, 1, 6));
    }
  }, [allRelationshipTypes, initDepth, initDirection, initK, initMaxHops, initMode, initialEnabledRelationshipTypes, isOpen, kind, resetKey]);

  const title = props.kind === 'related' ? 'Add related elements' : 'Insert intermediate elements';

  const computePreview = useCallback(() => {
    if (!isOpen) return;
    setError(null);

    if (enabledTypes.length === 0) {
      setError('Select at least one relationship type.');
      setPreview(null);
      return;
    }

    if (props.kind === 'intermediates') {
      const sId = props.sourceElementId;
      const tId = props.targetElementId;

      if (!sId || !tId) {
        setError('Missing endpoints.');
        setPreview(null);
        return;
      }
      if (sId === tId) {
        setError('Endpoints must be different.');
        setPreview(null);
        return;
      }

      const res = computeIntermediatesPreview({
        model,
        enabledRelationshipTypes: enabledTypes,
        existingSet,
        includeAlreadyInSandbox: true,
        sourceElementId: sId,
        targetElementId: tId,
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

      setPreview({ kind: 'intermediates', paths: res.paths, candidates: res.candidates });
      setSelectedIds(res.defaultSelectedIds);
      return;
    }

    const anchorIds = props.anchorElementIds.filter((id) => typeof id === 'string' && id.length > 0 && Boolean(model.elements[id]));
    if (anchorIds.length === 0) {
      setError('Select one or more sandbox nodes as anchors.');
      setPreview(null);
      return;
    }

    const res = computeRelatedPreview({
      model,
      enabledRelationshipTypes: enabledTypes,
      existingSet,
      includeAlreadyInSandbox: true,
      anchorElementIds: anchorIds,
      depth,
      direction,
    });

    if (res.candidates.length === 0) {
      setError('No related elements found for the current settings.');
    }

    setPreview({ kind: 'related', groups: res.groups, candidates: res.candidates });
    setSelectedIds(res.defaultSelectedIds);
  }, [depth, direction, enabledTypes, existingSet, isOpen, k, maxHops, mode, model, props]);

  const selectedCount = selectedIds.size;
  const candidatesCount = preview?.candidates.length ?? 0;
  const canInsert = preview !== null && selectedCount > 0 && enabledTypes.length > 0;

  const selectAllNew = useCallback(() => {
    if (!preview) return;
    const next = new Set<string>();
    for (const c of preview.candidates) {
      if (!c.alreadyInSandbox) next.add(c.id);
    }
    setSelectedIds(next);
  }, [preview]);

  const toggleSelectedId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onConfirmClick = useCallback(() => {
    if (!preview) return;

    const enabledRelationshipTypes = enabledTypes;

    if (props.kind === 'related') {
      onConfirm({
        kind: 'related',
        enabledRelationshipTypes,
        options: { depth: clampInt(depth, 1, 6), direction },
        selectedElementIds: Array.from(selectedIds),
      });
      return;
    }

    onConfirm({
      kind: 'intermediates',
      enabledRelationshipTypes,
      options: { mode, k: clampInt(k, 1, 10), maxHops: clampInt(maxHops, 1, 16), direction },
      selectedElementIds: Array.from(selectedIds),
    });
  }, [depth, direction, enabledTypes, k, maxHops, mode, onConfirm, preview, props.kind, selectedIds]);

  return {
    title,
    isOpen,
    model,
    existingSet,
    allRelationshipTypes,
    enabledTypes,
    setEnabledTypes,
    mode,
    setMode,
    k,
    setK,
    maxHops,
    setMaxHops,
    direction,
    setDirection,
    depth,
    setDepth,
    preview,
    error,
    selectedIds,
    selectedCount,
    candidatesCount,
    canInsert,
    onCancel,
    computePreview,
    selectAllNew,
    toggleSelectedId,
    setSelectedIds,
    onConfirmClick,
  };
}

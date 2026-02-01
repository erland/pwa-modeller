import { useEffect, useMemo, useState } from 'react';

import type { Model } from '../../../../domain';
import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
} from '../../workspace/controller/sandboxTypes';

import {
  computeAllElementTypesForModel,
  computeInitialEnabledRelationshipTypes,
  keepEnabledRelationshipTypesValid,
  normalizeIntermediatesOptions,
  normalizeRelatedOptions,
} from './sandboxInsertPolicy';

export type SandboxInsertOptionsStateArgs =
  | {
      kind: 'intermediates';
      initialOptions: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>;
    }
  | {
      kind: 'related';
      initialOptions: { depth: number; direction: SandboxAddRelatedDirection };
    };

export type SandboxInsertOptionsState = {
  /** Increments when the dialog opens and options are reset. */
  openNonce: number;

  allElementTypesForModel: string[];
  enabledElementTypes: string[];
  setEnabledElementTypes: React.Dispatch<React.SetStateAction<string[]>>;
  enabledElementTypesSet: Set<string>;

  enabledTypes: string[];
  setEnabledTypes: React.Dispatch<React.SetStateAction<string[]>>;

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

  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
};

export function useSandboxInsertOptionsState(args: {
  isOpen: boolean;
  model: Model;
  relationshipTypesForDialog: string[];
  initialEnabledRelationshipTypes: string[];
} & SandboxInsertOptionsStateArgs): SandboxInsertOptionsState {
  const { isOpen, model, relationshipTypesForDialog, initialEnabledRelationshipTypes } = args;

  const allElementTypesForModel = useMemo(() => computeAllElementTypesForModel(model), [model]);

  const [openNonce, setOpenNonce] = useState(0);

  const [direction, setDirection] = useState<SandboxAddRelatedDirection>('both');
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);
  const [enabledElementTypes, setEnabledElementTypes] = useState<string[]>([]);

  const [mode, setMode] = useState<SandboxInsertIntermediatesMode>('shortest');
  const [k, setK] = useState(3);
  const [maxHops, setMaxHops] = useState(8);
  const [depth, setDepth] = useState(1);

  const [search, setSearch] = useState('');

  const enabledElementTypesSet = useMemo(() => new Set(enabledElementTypes), [enabledElementTypes]);

  // Reset options when the dialog opens.
  useEffect(() => {
    if (!isOpen) return;

    setEnabledTypes(
      computeInitialEnabledRelationshipTypes({
        relationshipTypesForDialog,
        initialEnabledRelationshipTypes,
      }),
    );
    setEnabledElementTypes(allElementTypesForModel);
    setSearch('');

    if (args.kind === 'intermediates') {
      const o = normalizeIntermediatesOptions(args.initialOptions);
      setMode(o.mode);
      setK(o.k);
      setMaxHops(o.maxHops);
      setDirection(o.direction);
      setDepth(1);
    } else {
      const o = normalizeRelatedOptions(args.initialOptions);
      setDepth(o.depth);
      setDirection(o.direction);
      setMode('shortest');
      setK(3);
      setMaxHops(8);
    }

    setOpenNonce((n) => n + 1);
  }, [allElementTypesForModel, args, initialEnabledRelationshipTypes, isOpen, relationshipTypesForDialog]);

  // Keep enabled relationship types valid when compatible types change.
  useEffect(() => {
    setEnabledTypes((prev) =>
      keepEnabledRelationshipTypesValid({ isOpen, enabledTypes: prev, relationshipTypesForDialog }),
    );
  }, [isOpen, relationshipTypesForDialog]);

  return {
    openNonce,
    allElementTypesForModel,
    enabledElementTypes,
    setEnabledElementTypes,
    enabledElementTypesSet,
    enabledTypes,
    setEnabledTypes,
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
    search,
    setSearch,
  };
}

import type { Model, ModelKind } from '../../../../domain';
import { getRelationshipTypesForKind, kindFromTypeId } from '../../../../domain';

import type {
  SandboxAddRelatedDirection,
  SandboxInsertIntermediatesMode,
  SandboxInsertIntermediatesOptions,
} from '../../workspace/controller/sandboxTypes';

import type { Candidate } from './types';
import { clampInt, uniqSortedStrings } from './utils';

export function computeAllElementTypesForModel(model: Model): string[] {
  const types = Object.values(model.elements).map((e) => String(e.type ?? ''));
  return uniqSortedStrings(types);
}

export function computeRelationshipTypesForDialog(args: {
  model: Model;
  kind: 'intermediates' | 'related';
  sourceElementId?: string;
  targetElementId?: string;
  anchorElementIds?: string[];
  allRelationshipTypes: string[];
}): string[] {
  const kinds = new Set<ModelKind>();

  if (args.kind === 'intermediates') {
    const s = args.sourceElementId ? args.model.elements[args.sourceElementId] : undefined;
    const t = args.targetElementId ? args.model.elements[args.targetElementId] : undefined;
    if (s) kinds.add(kindFromTypeId(s.type));
    if (t) kinds.add(kindFromTypeId(t.type));
  } else {
    for (const id of args.anchorElementIds ?? []) {
      const el = args.model.elements[id];
      if (!el) continue;
      kinds.add(kindFromTypeId(el.type));
    }
  }

  const allowed = new Set<string>();
  for (const k of kinds) {
    if (k === 'uml' || k === 'bpmn' || k === 'archimate') {
      for (const rt of getRelationshipTypesForKind(k)) allowed.add(rt);
    }
  }

  const base = Array.isArray(args.allRelationshipTypes) ? args.allRelationshipTypes : [];
  if (allowed.size === 0) return base;
  return base.filter((t) => allowed.has(t));
}

export function computeInitialEnabledRelationshipTypes(args: {
  relationshipTypesForDialog: string[];
  initialEnabledRelationshipTypes: string[];
}): string[] {
  const allowedRelSet = new Set(args.relationshipTypesForDialog);
  const initRel = (args.initialEnabledRelationshipTypes.length
    ? args.initialEnabledRelationshipTypes
    : args.relationshipTypesForDialog
  ).filter((t) => allowedRelSet.has(t));

  return initRel.length ? initRel : args.relationshipTypesForDialog;
}

export function keepEnabledRelationshipTypesValid(args: {
  isOpen: boolean;
  enabledTypes: string[];
  relationshipTypesForDialog: string[];
}): string[] {
  if (!args.isOpen) return args.enabledTypes;
  const allowed = new Set(args.relationshipTypesForDialog);
  const next = args.enabledTypes.filter((t) => allowed.has(t));
  return next.length ? next : args.relationshipTypesForDialog;
}

export function computeDefaultSelectedIds(args: { prevSelected: Set<string>; candidates: Candidate[] }): Set<string> {
  const prev = args.prevSelected;
  const next = new Set<string>();
  for (const c of args.candidates) {
    if (prev.size === 0 || prev.has(c.id)) next.add(c.id);
  }
  return next;
}

export function normalizeIntermediatesOptions(
  options: Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'>,
): Pick<SandboxInsertIntermediatesOptions, 'mode' | 'k' | 'maxHops' | 'direction'> {
  return {
    mode: options.mode,
    k: clampInt(options.k, 1, 10),
    maxHops: clampInt(options.maxHops, 1, 16),
    direction: options.direction,
  };
}

export function normalizeRelatedOptions(options: { depth: number; direction: SandboxAddRelatedDirection }): {
  depth: number;
  direction: SandboxAddRelatedDirection;
} {
  return {
    depth: clampInt(options.depth, 1, 6),
    direction: options.direction,
  };
}

export function defaultIntermediatesState(args: {
  mode: SandboxInsertIntermediatesMode;
  k: number;
  maxHops: number;
  direction: SandboxAddRelatedDirection;
}) {
  return {
    mode: args.mode,
    k: clampInt(args.k, 1, 10),
    maxHops: clampInt(args.maxHops, 1, 16),
    direction: args.direction,
  };
}

export function defaultRelatedState(args: { depth: number; direction: SandboxAddRelatedDirection }) {
  return {
    depth: clampInt(args.depth, 1, 6),
    direction: args.direction,
  };
}

import type { ModelKind } from '../../../domain/types';

import type { TraceFilters, TraceGraphState, TraceSelection } from '../../../domain/analysis/traceability/types';
import type { TraceabilityExplorerState } from './traceabilityReducer';

export type TraceabilitySessionV1 = {
  version: 1;
  name: string;
  modelId: string;
  modelKind: ModelKind;
  savedAt: string; // ISO
  seedId: string;
  expandDepth: number;
  state: TraceabilitySessionStateV1;
};

export type TraceabilitySessionStateV1 = TraceGraphState & {
  // Persist selection and filters too
  selection: TraceSelection;
  filters: TraceFilters;
};

const KEY_PREFIX = 'eaModeller.traceability.sessions.v1';

function storageKey(modelKind: ModelKind, modelId: string) {
  return `${KEY_PREFIX}.${modelKind}.${modelId}`;
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function listTraceabilitySessions(modelKind: ModelKind, modelId: string): TraceabilitySessionV1[] {
  if (!canUseStorage()) return [];
  const key = storageKey(modelKind, modelId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as TraceabilitySessionV1[];
    return Array.isArray(data) ? data.filter((s) => s && s.version === 1 && s.modelId === modelId && s.modelKind === modelKind) : [];
  } catch {
    return [];
  }
}

export function saveTraceabilitySession(
  modelKind: ModelKind,
  modelId: string,
  session: Omit<TraceabilitySessionV1, 'version' | 'modelId' | 'modelKind' | 'savedAt'>
): TraceabilitySessionV1 {
  const full: TraceabilitySessionV1 = {
    version: 1,
    modelId,
    modelKind,
    savedAt: new Date().toISOString(),
    ...session
  };

  if (!canUseStorage()) return full;

  const key = storageKey(modelKind, modelId);
  const existing = listTraceabilitySessions(modelKind, modelId);
  const next = [...existing.filter((s) => s.name !== full.name), full].sort((a, b) => a.name.localeCompare(b.name));
  window.localStorage.setItem(key, JSON.stringify(next));
  return full;
}

export function deleteTraceabilitySession(modelKind: ModelKind, modelId: string, name: string): void {
  if (!canUseStorage()) return;
  const key = storageKey(modelKind, modelId);
  const existing = listTraceabilitySessions(modelKind, modelId);
  const next = existing.filter((s) => s.name !== name);
  window.localStorage.setItem(key, JSON.stringify(next));
}

export function findTraceabilitySession(modelKind: ModelKind, modelId: string, name: string): TraceabilitySessionV1 | undefined {
  return listTraceabilitySessions(modelKind, modelId).find((s) => s.name === name);
}

export function toPersistedState(state: TraceabilityExplorerState): TraceabilitySessionStateV1 {
  // Drop ephemeral state fields.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pendingByNodeId: _p, lastExpandRequest: _r, ...rest } = state;
  return rest;
}

export function toExplorerState(persisted: TraceabilitySessionStateV1): TraceabilityExplorerState {
  return {
    ...persisted,
    pendingByNodeId: {},
    lastExpandRequest: undefined
  };
}

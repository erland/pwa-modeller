// Session persistence helpers for the Analysis Sandbox.
// Keeps all sessionStorage interaction out of the hook implementation.

import type {
  SandboxAddRelatedDirection,
  SandboxNode,
  SandboxRelationshipVisibilityMode,
} from './sandboxTypes';

export type PersistedSandboxStateV1 = {
  v: 1;
  nodes: SandboxNode[];
  relationships: {
    show: boolean;
    mode: SandboxRelationshipVisibilityMode;
    enabledTypes: string[];
    explicitIds: string[];
  };
  addRelated: {
    depth: number;
    direction: SandboxAddRelatedDirection;
    enabledTypes: string[];
  };
  ui: {
    edgeRouting: 'straight' | 'orthogonal';
  };
};

function safeGetSessionStorage(): Storage | null {
  try {
    // In unit tests or non-browser environments, window/sessionStorage may not exist.
    if (typeof window === 'undefined') return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function SANDBOX_STATE_KEY(modelId: string): string {
  return `eaModeller.analysisSandbox.state.${modelId}.v1`;
}

function uniqSortedStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = Array.from(new Set(values.filter((x): x is string => typeof x === 'string' && x.length > 0)));
  out.sort((a, b) => a.localeCompare(b));
  return out;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asRelationshipVisibilityMode(value: unknown): SandboxRelationshipVisibilityMode {
  return value === 'all' || value === 'types' || value === 'explicit' ? value : 'all';
}

function asAddRelatedDirection(value: unknown): SandboxAddRelatedDirection {
  return value === 'both' || value === 'incoming' || value === 'outgoing' ? value : 'both';
}


export function loadPersistedSandboxState(modelId: string): PersistedSandboxStateV1 | null {
  const ss = safeGetSessionStorage();
  if (!ss) return null;
  const raw = ss.getItem(SANDBOX_STATE_KEY(modelId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed['v'] !== 1) return null;

    const inNodes: unknown[] = Array.isArray(parsed['nodes']) ? (parsed['nodes'] as unknown[]) : [];
    const nodes: SandboxNode[] = inNodes
      .filter(
        (n): n is Record<string, unknown> =>
          isRecord(n) &&
          typeof n['elementId'] === 'string' &&
          typeof n['x'] === 'number' &&
          typeof n['y'] === 'number'
      )
      .map((n) => ({
        elementId: n['elementId'] as string,
        x: n['x'] as number,
        y: n['y'] as number,
        pinned: Boolean(n['pinned']),
      }));

    const rel = isRecord(parsed['relationships']) ? (parsed['relationships'] as Record<string, unknown>) : {};
    const relationships = {
      show: Boolean(rel.show),
      mode: asRelationshipVisibilityMode(rel['mode']),
      enabledTypes: uniqSortedStrings(rel.enabledTypes),
      explicitIds: uniqSortedStrings(rel.explicitIds),
    };

    const ar = isRecord(parsed['addRelated']) ? (parsed['addRelated'] as Record<string, unknown>) : {};
    const addRelated = {
      depth: typeof ar.depth === 'number' ? ar.depth : 1,
      direction: asAddRelatedDirection(ar['direction']),
      enabledTypes: uniqSortedStrings(ar.enabledTypes),
    };

    const ui = isRecord(parsed['ui']) ? (parsed['ui'] as Record<string, unknown>) : {};
    const er = ui.edgeRouting;
    const uiState = { edgeRouting: er === 'orthogonal' ? 'orthogonal' : 'straight' } as const;

    return { v: 1, nodes, relationships, addRelated, ui: uiState };
  } catch {
    return null;
  }
}

export function savePersistedSandboxState(modelId: string, payload: PersistedSandboxStateV1): void {
  const ss = safeGetSessionStorage();
  if (!ss) return;
  try {
    ss.setItem(SANDBOX_STATE_KEY(modelId), JSON.stringify(payload));
  } catch {
    // ignore quota or JSON errors
  }
}

export function clearPersistedSandboxState(modelId: string): void {
  const ss = safeGetSessionStorage();
  if (!ss) return;
  try {
    ss.removeItem(SANDBOX_STATE_KEY(modelId));
  } catch {
    // ignore
  }
}
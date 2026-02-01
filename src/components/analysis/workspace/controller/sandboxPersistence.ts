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

export function loadPersistedSandboxState(modelId: string): PersistedSandboxStateV1 | null {
  const ss = safeGetSessionStorage();
  if (!ss) return null;
  const raw = ss.getItem(SANDBOX_STATE_KEY(modelId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as any;
    if (!parsed || parsed.v !== 1) return null;

    const inNodes: any[] = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const nodes: SandboxNode[] = inNodes
      .filter((n) => n && typeof n.elementId === 'string' && typeof n.x === 'number' && typeof n.y === 'number')
      .map((n) => ({ elementId: n.elementId, x: n.x, y: n.y, pinned: Boolean(n.pinned) }));

    const rel = parsed.relationships ?? {};
    const relationships = {
      show: Boolean(rel.show),
      mode: (rel.mode as SandboxRelationshipVisibilityMode) ?? 'all',
      enabledTypes: uniqSortedStrings(rel.enabledTypes),
      explicitIds: uniqSortedStrings(rel.explicitIds),
    };

    const ar = parsed.addRelated ?? {};
    const addRelated = {
      depth: typeof ar.depth === 'number' ? ar.depth : 1,
      direction: (ar.direction as SandboxAddRelatedDirection) ?? 'both',
      enabledTypes: uniqSortedStrings(ar.enabledTypes),
    };

    const ui = parsed.ui ?? {};
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

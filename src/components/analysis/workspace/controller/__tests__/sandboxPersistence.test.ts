import type { PersistedSandboxStateV1 } from '../sandboxPersistence';

import {
  clearPersistedSandboxState,
  loadPersistedSandboxState,
  savePersistedSandboxState,
} from '../sandboxPersistence';

function storageKey(modelId: string): string {
  return `eaModeller.analysisSandbox.state.${modelId}.v1`;
}

describe('sandboxPersistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('load returns null when missing', () => {
    expect(loadPersistedSandboxState('m1')).toBeNull();
  });

  test('save + load roundtrip returns same payload shape', () => {
    const modelId = 'sandbox_roundtrip';
    const payload: PersistedSandboxStateV1 = {
      v: 1,
      nodes: [
        { elementId: 'A', x: 10, y: 20, pinned: false },
        { elementId: 'B', x: 30, y: 40, pinned: true },
      ],
      relationships: {
        show: true,
        mode: 'types',
        enabledTypes: ['Flow', 'Serving'],
        explicitIds: ['R1'],
      },
      addRelated: {
        depth: 2,
        direction: 'outgoing',
        enabledTypes: ['Serving'],
      },
      ui: {
        edgeRouting: 'orthogonal',
      },
    };

    savePersistedSandboxState(modelId, payload);

    const loaded = loadPersistedSandboxState(modelId);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(payload);
  });

  test('load sanitizes unknown values and drops malformed nodes', () => {
    const modelId = 'sandbox_sanitize';

    // Note: deliberately includes malformed nodes and invalid enum values.
    const raw = {
      v: 1,
      nodes: [
        { elementId: 'A', x: 1, y: 2, pinned: 1 },
        { elementId: 42, x: 1, y: 2 },
        { elementId: 'B', x: 'oops', y: 2 },
      ],
      relationships: {
        show: 'yes',
        mode: 'filtered',
        enabledTypes: ['X', 'X', 3, '', 'A'],
        explicitIds: ['R2', null, 'R1', 'R1'],
      },
      addRelated: {
        depth: '2',
        direction: 'sideways',
        enabledTypes: ['Z', 'Z', ''],
      },
      ui: {
        edgeRouting: 'diagonal',
      },
    };

    sessionStorage.setItem(storageKey(modelId), JSON.stringify(raw));

    const loaded = loadPersistedSandboxState(modelId);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual({
      v: 1,
      nodes: [
        {
          elementId: 'A',
          x: 1,
          y: 2,
          pinned: true,
        },
      ],
      relationships: {
        show: true,
        mode: 'all',
        enabledTypes: ['A', 'X'],
        explicitIds: ['R1', 'R2'],
      },
      addRelated: {
        depth: 1,
        direction: 'both',
        enabledTypes: ['Z'],
      },
      ui: { edgeRouting: 'straight' },
    });
  });

  test('clear removes storage entry', () => {
    const modelId = 'sandbox_clear';
    const payload: PersistedSandboxStateV1 = {
      v: 1,
      nodes: [],
      relationships: { show: false, mode: 'all', enabledTypes: [], explicitIds: [] },
      addRelated: { depth: 1, direction: 'both', enabledTypes: [] },
      ui: { edgeRouting: 'straight' },
    };

    savePersistedSandboxState(modelId, payload);
    expect(sessionStorage.getItem(storageKey(modelId))).toBeTruthy();

    clearPersistedSandboxState(modelId);
    expect(loadPersistedSandboxState(modelId)).toBeNull();
  });
});

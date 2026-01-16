import { createEmptyModel } from '../../domain';
import { clearPersistedStoreState, loadPersistedStoreState, persistStoreState } from '../storePersistence';

// Keep this in sync with src/store/storePersistence.ts.
const STORAGE_KEY = 'pwa-modeller:storeState:v2';

describe('storePersistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('persistStoreState + loadPersistedStoreState round-trip a valid model envelope', () => {
    const model = createEmptyModel({ name: 'Test Model' }, 'model_test');

    persistStoreState({ model, fileName: 'test.json', isDirty: true });

    const restored = loadPersistedStoreState();
    expect(restored).not.toBeNull();
    expect(restored?.fileName).toBe('test.json');
    expect(restored?.isDirty).toBe(true);
    expect(restored?.model?.id).toBe('model_test');
    expect(restored?.model?.metadata.name).toBe('Test Model');
  });

  test('loadPersistedStoreState returns null for unsupported envelope version', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, state: { model: null, fileName: null, isDirty: false } })
    );
    expect(loadPersistedStoreState()).toBeNull();
  });

  test('loadPersistedStoreState clears storage and returns null for corrupted model payload', () => {
    // model object is present but does not satisfy deserializeModel requirements.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 2, state: { model: {}, fileName: null, isDirty: false } })
    );

    expect(loadPersistedStoreState()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('clearPersistedStoreState removes persisted envelope', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 2, state: { model: null, fileName: null, isDirty: false } })
    );
    clearPersistedStoreState();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

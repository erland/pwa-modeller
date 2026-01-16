import type { Model } from '../domain';
import type { ModelStoreState } from './modelStore';
import { deserializeModel } from './persistence';

const STORAGE_KEY = 'pwa-modeller:storeState:v2';

type PersistedEnvelope = {
  v: 2;
  state: Pick<ModelStoreState, 'model' | 'fileName' | 'isDirty'>;
};

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function loadPersistedStoreState(): Pick<ModelStoreState, 'model' | 'fileName' | 'isDirty'> | null {
  if (!hasLocalStorage()) return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  const parsed = safeParse(raw);
  if (!isRecord(parsed)) return null;

  const v = parsed['v'];
  const state = parsed['state'];

  if (v !== 2 || !isRecord(state)) return null;

  const fileName = typeof state['fileName'] === 'string' ? state['fileName'] : state['fileName'] === null ? null : null;
  const isDirty = typeof state['isDirty'] === 'boolean' ? state['isDirty'] : false;

  const modelUnknown = state['model'];
  let model: Model | null = null;

  if (modelUnknown === null) {
    model = null;
  } else if (isRecord(modelUnknown)) {
    // Validate shape using existing model deserializer.
    try {
      model = deserializeModel(JSON.stringify(modelUnknown));
    } catch {
      // If corrupted, ignore restore (and clear).
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  } else {
    model = null;
  }

  return { model, fileName, isDirty };
}

export function persistStoreState(state: Pick<ModelStoreState, 'model' | 'fileName' | 'isDirty'>): void {
  if (!hasLocalStorage()) return;
  const envelope: PersistedEnvelope = { v: 2, state };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // ignore quota / private mode errors
  }
}

export function clearPersistedStoreState(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

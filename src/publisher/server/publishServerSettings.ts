export type PublishServerSettings = {
  baseUrl: string;
  datasetId: string;
  rememberLastDatasetId: boolean;
};

const KEY_BASE_URL = 'publishServer.baseUrl';
const KEY_DATASET_ID = 'publishServer.lastDatasetId';
const KEY_REMEMBER = 'publishServer.rememberLastDatasetId';

function safeGet(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (!value) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeSetBool(key: string, value: boolean): void {
  safeSet(key, value ? 'true' : 'false');
}

function safeGetBool(key: string, defaultValue: boolean): boolean {
  const v = safeGet(key).trim().toLowerCase();
  if (!v) return defaultValue;
  return v === 'true' || v === '1' || v === 'yes';
}

export function loadPublishServerSettings(): PublishServerSettings {
  return {
    baseUrl: safeGet(KEY_BASE_URL).trim(),
    datasetId: safeGet(KEY_DATASET_ID).trim(),
    rememberLastDatasetId: safeGetBool(KEY_REMEMBER, true)
  };
}

export function savePublishServerSettings(next: Partial<PublishServerSettings>): void {
  if (typeof next.baseUrl === 'string') safeSet(KEY_BASE_URL, next.baseUrl.trim());
  if (typeof next.datasetId === 'string') safeSet(KEY_DATASET_ID, next.datasetId.trim());
  if (typeof next.rememberLastDatasetId === 'boolean') safeSetBool(KEY_REMEMBER, next.rememberLastDatasetId);
}

export function clearPublishServerDatasetId(): void {
  safeSet(KEY_DATASET_ID, '');
}

/**
 * Remote datasets client settings (Phase 1).
 *
 * Storage scope: USER-SCOPED (local-only).
 *
 * NOTE: Storing access tokens in localStorage is only intended for Phase 1 dev-mode.
 * A future OIDC integration should replace this.
 */

export type RemoteDatasetSettings = {
  /** Last used server base URL (e.g. http://localhost:8081). */
  remoteServerBaseUrl: string;
  /** Phase 1: pasted access token (OIDC). */
  remoteAccessToken: string;
};

const KEY_BASE_URL = 'remoteDatasets.baseUrl';
const KEY_ACCESS_TOKEN = 'remoteDatasets.accessToken';

function safeGet(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function safeSet(key: string, value: string): void {
  try {
    const trimmed = value.trim();
    if (!trimmed) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, trimmed);
  } catch {
    // ignore
  }
}

export function loadRemoteDatasetSettings(): RemoteDatasetSettings {
  return {
    remoteServerBaseUrl: safeGet(KEY_BASE_URL).trim(),
    remoteAccessToken: safeGet(KEY_ACCESS_TOKEN).trim()
  };
}

export function saveRemoteDatasetSettings(next: Partial<RemoteDatasetSettings>): void {
  if (typeof next.remoteServerBaseUrl === 'string') safeSet(KEY_BASE_URL, next.remoteServerBaseUrl);
  if (typeof next.remoteAccessToken === 'string') safeSet(KEY_ACCESS_TOKEN, next.remoteAccessToken);
}

export function clearRemoteAccessToken(): void {
  safeSet(KEY_ACCESS_TOKEN, '');
}

/**
 * Remote datasets client settings (Phase 1).
 *
 * Storage scope: USER-SCOPED (local-only).
 *
 * Phase 1 now uses OIDC PKCE (redirect) to obtain an access token.
 * We persist only the configuration (issuer/clientId) in localStorage; tokens are kept in sessionStorage.
 */

export type RemoteDatasetSettings = {
  /** Last used server base URL (e.g. http://localhost:8081). */
  remoteServerBaseUrl: string;
  /** OIDC issuer URL (Keycloak realm URL). */
  oidcIssuerUrl: string;
  /** OIDC client id (public client with PKCE enabled). */
  oidcClientId: string;
  /** Optional scopes (default: "openid profile email"). */
  oidcScope: string;
  /** Legacy (pre-PKCE) pasted access token; kept for backward compatibility. */
  remoteAccessToken?: string;
};

const KEY_BASE_URL = 'remoteDatasets.baseUrl';
const KEY_OIDC_ISSUER = 'remoteDatasets.oidcIssuerUrl';
const KEY_OIDC_CLIENT_ID = 'remoteDatasets.oidcClientId';
const KEY_OIDC_SCOPE = 'remoteDatasets.oidcScope';
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
    oidcIssuerUrl: safeGet(KEY_OIDC_ISSUER).trim(),
    oidcClientId: safeGet(KEY_OIDC_CLIENT_ID).trim(),
    oidcScope: safeGet(KEY_OIDC_SCOPE).trim(),
    remoteAccessToken: safeGet(KEY_ACCESS_TOKEN).trim() || undefined
  };
}

export function saveRemoteDatasetSettings(next: Partial<RemoteDatasetSettings>): void {
  if (typeof next.remoteServerBaseUrl === 'string') safeSet(KEY_BASE_URL, next.remoteServerBaseUrl);
  if (typeof next.oidcIssuerUrl === 'string') safeSet(KEY_OIDC_ISSUER, next.oidcIssuerUrl);
  if (typeof next.oidcClientId === 'string') safeSet(KEY_OIDC_CLIENT_ID, next.oidcClientId);
  if (typeof next.oidcScope === 'string') safeSet(KEY_OIDC_SCOPE, next.oidcScope);
  if (typeof next.remoteAccessToken === 'string') safeSet(KEY_ACCESS_TOKEN, next.remoteAccessToken);
}

export function clearRemoteAccessToken(): void {
  safeSet(KEY_ACCESS_TOKEN, '');
}

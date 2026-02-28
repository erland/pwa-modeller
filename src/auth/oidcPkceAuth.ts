export type OidcPkceConfig = {
  /** OIDC issuer URL, e.g. https://keycloak.example.com/realms/myrealm */
  issuerUrl: string;
  /** OIDC client id (public client) */
  clientId: string;
  /** Requested scopes, e.g. "openid profile email" */
  scope?: string;
};

export type OidcTokens = {
  accessToken: string;
  tokenType: string;
  expiresAtMs: number;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
};

const SS_CONFIG_KEY = 'oidc.pkce.config.v1';
const SS_STATE_KEY = 'oidc.pkce.state.v1';
const SS_VERIFIER_KEY = 'oidc.pkce.verifier.v1';
const SS_TOKENS_KEY = 'oidc.pkce.tokens.v1';
// Guard to prevent processing the same authorization code twice (e.g. React StrictMode double-invokes effects in dev).
const SS_CALLBACK_INFLIGHT_KEY = 'oidc.pkce.callback.inflight.v1';

// Keep tokens across full-page redirects and reloads.
// For an internal tool this is a pragmatic choice; if you want a stricter posture later,
// we can store only refresh_token (or use in-memory + silent reauth).
const LS_TOKENS_KEY = 'oidc.pkce.tokens.local.v1';

// Optional post-login UX helpers.
const SS_RETURN_TO_KEY = 'oidc.pkce.returnTo.v1';
const SS_AFTER_LOGIN_KEY = 'oidc.pkce.afterLogin.v1';
// Mirror intent markers to localStorage to survive full reloads / browser quirks.
const LS_RETURN_TO_KEY = 'oidc.pkce.returnTo.v1';
const LS_AFTER_LOGIN_KEY = 'oidc.pkce.afterLogin.v1';

// Flag used to suppress beforeunload prompts when we intentionally navigate away for OIDC login.
const SS_AUTH_NAV_KEY = 'oidc.pkce.authnav.inprogress.v1';
const LS_AUTH_NAV_KEY = 'oidc.pkce.authnav.inprogress.v1';

function normalizeUrl(u: string): string {
  const t = u.trim();
  return t.endsWith('/') ? t.slice(0, -1) : t;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

async function sha256Base64Url(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return base64UrlEncode(new Uint8Array(digest));
}

function getRedirectUri(): string {
  // Works with HashRouter: callback params arrive in ?query before #hash.
  return `${window.location.origin}${window.location.pathname}`;
}

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
};

async function discover(issuerUrl: string): Promise<Discovery> {
  const issuer = normalizeUrl(issuerUrl);
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as Partial<Discovery>;
  if (!json.authorization_endpoint || !json.token_endpoint) throw new Error('OIDC discovery response is missing endpoints');
  return json as Discovery;
}


function notifyAuthChanged(): void {
  try {
    // Same-tab listeners
    window.dispatchEvent(new Event('pwaModellerAuthChanged'));
  } catch { /* ignore */ }
  try {
    // Cross-tab listeners via storage event
    localStorage.setItem('oidc.pkce.authChangedAt.v1', String(Date.now()));
  } catch { /* ignore */ }
}

function saveTokens(tokens: OidcTokens | null): void {
  if (!tokens) {
    sessionStorage.removeItem(SS_TOKENS_KEY);
    localStorage.removeItem(LS_TOKENS_KEY);
    notifyAuthChanged();
    return;
  }
  sessionStorage.setItem(SS_TOKENS_KEY, JSON.stringify(tokens));
  // Also persist for "sticky" login across reloads.
  localStorage.setItem(LS_TOKENS_KEY, JSON.stringify(tokens));
  notifyAuthChanged();
}

export function loadTokens(): OidcTokens | null {
  const raw = sessionStorage.getItem(SS_TOKENS_KEY) ?? localStorage.getItem(LS_TOKENS_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OidcTokens>;
    if (!v || typeof v !== 'object') return null;
    if (typeof v.accessToken !== 'string' || typeof v.tokenType !== 'string' || typeof v.expiresAtMs !== 'number') return null;
    // If it came from localStorage, mirror into sessionStorage for faster reads.
    sessionStorage.setItem(SS_TOKENS_KEY, JSON.stringify(v));
    return v as OidcTokens;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  saveTokens(null);
}

export function setAuthNavigationInProgress(v: boolean): void {
  const val = v ? '1' : '';
  if (!val) {
    sessionStorage.removeItem(SS_AUTH_NAV_KEY);
    localStorage.removeItem(LS_AUTH_NAV_KEY);
    return;
  }
  sessionStorage.setItem(SS_AUTH_NAV_KEY, val);
  localStorage.setItem(LS_AUTH_NAV_KEY, val);
}

export function isAuthNavigationInProgress(): boolean {
  return (sessionStorage.getItem(SS_AUTH_NAV_KEY) ?? localStorage.getItem(LS_AUTH_NAV_KEY)) === '1';
}


export function setAfterLogin(action: string | null): void {
  if (!action) {
    sessionStorage.removeItem(SS_AFTER_LOGIN_KEY);
    localStorage.removeItem(LS_AFTER_LOGIN_KEY);
    return;
  }
  sessionStorage.setItem(SS_AFTER_LOGIN_KEY, action);
  localStorage.setItem(LS_AFTER_LOGIN_KEY, action);
}

export function consumeAfterLogin(): string | null {
  const v = sessionStorage.getItem(SS_AFTER_LOGIN_KEY) ?? localStorage.getItem(LS_AFTER_LOGIN_KEY);
  if (v) {
    sessionStorage.removeItem(SS_AFTER_LOGIN_KEY);
    localStorage.removeItem(LS_AFTER_LOGIN_KEY);
  }
  return v;
}

export function setReturnTo(url: string | null): void {
  if (!url) {
    sessionStorage.removeItem(SS_RETURN_TO_KEY);
    localStorage.removeItem(LS_RETURN_TO_KEY);
    return;
  }
  sessionStorage.setItem(SS_RETURN_TO_KEY, url);
  localStorage.setItem(LS_RETURN_TO_KEY, url);
}

function consumeReturnTo(): string | null {
  const v = sessionStorage.getItem(SS_RETURN_TO_KEY) ?? localStorage.getItem(LS_RETURN_TO_KEY);
  if (v) {
    sessionStorage.removeItem(SS_RETURN_TO_KEY);
    localStorage.removeItem(LS_RETURN_TO_KEY);
  }
  return v;
}

export function isLoggedIn(): boolean {
  const t = loadTokens();
  return Boolean(t?.accessToken) && (t?.expiresAtMs ?? 0) > Date.now() + 10_000;
}

export async function getAccessToken(): Promise<string | null> {
  const t = loadTokens();
  if (!t) return null;
  if (t.expiresAtMs > Date.now() + 10_000) return t.accessToken;
  if (t.refreshToken) {
    try {
      const refreshed = await refreshWithStoredConfig(t.refreshToken);
      return refreshed?.accessToken ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

export type BeginLoginOptions = {
  /** Optional URL to return to after the callback is processed (may include #hash). */
  returnTo?: string;
  /** Optional action marker consumed by the app to restore UI state (e.g. reopen a dialog). */
  afterLogin?: string;
};

export async function beginLogin(config: OidcPkceConfig, options?: BeginLoginOptions): Promise<void> {
  const issuerUrl = normalizeUrl(config.issuerUrl);
  const clientId = config.clientId.trim();
  if (!issuerUrl) throw new Error('OIDC issuer URL is required');
  if (!clientId) throw new Error('OIDC clientId is required');

  if (options?.returnTo) setReturnTo(options.returnTo);
  if (options?.afterLogin) setAfterLogin(options.afterLogin);

  const discovery = await discover(issuerUrl);
  const redirectUri = getRedirectUri();
  const scope = (config.scope ?? 'openid profile email').trim() || 'openid profile email';

  const state = randomString(16);
  const verifier = randomString(48);
  const challenge = await sha256Base64Url(verifier);

  sessionStorage.setItem(SS_CONFIG_KEY, JSON.stringify({ issuerUrl, clientId, scope, redirectUri }));
  sessionStorage.setItem(SS_STATE_KEY, state);
  sessionStorage.setItem(SS_VERIFIER_KEY, verifier);

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  // Suppress "leave site" prompts from unsaved-changes guards during intentional auth redirect.
  setAuthNavigationInProgress(true);
  window.location.assign(url.toString());
}

type StoredConfig = { issuerUrl: string; clientId: string; scope: string; redirectUri: string };

function loadStoredConfig(): StoredConfig | null {
  const raw = sessionStorage.getItem(SS_CONFIG_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredConfig>;
    if (!v || typeof v !== 'object') return null;
    if (
      typeof v.issuerUrl !== 'string' ||
      typeof v.clientId !== 'string' ||
      typeof v.scope !== 'string' ||
      typeof v.redirectUri !== 'string'
    ) {
      return null;
    }
    return v as StoredConfig;
  } catch {
    return null;
  }
}

function clearPkceState(): void {
  sessionStorage.removeItem(SS_STATE_KEY);
  sessionStorage.removeItem(SS_VERIFIER_KEY);
}

function readCallbackParams(): { code: string; state: string } | null {
  const sp = new URLSearchParams(window.location.search);
  const code = sp.get('code');
  const state = sp.get('state');
  if (!code || !state) return null;
  return { code, state };
}

function cleanupUrl(): void {
  const hash = window.location.hash;
  const clean = `${window.location.origin}${window.location.pathname}${hash}`;
  window.history.replaceState({}, document.title, clean);
}

function stripCallbackParamsFromUrl(): void {
  try {
    const u = new URL(window.location.href);
    // Remove standard OIDC callback params (and a couple Keycloak-specific extras).
    u.searchParams.delete('code');
    u.searchParams.delete('state');
    u.searchParams.delete('session_state');
    u.searchParams.delete('iss');

    const qs = u.searchParams.toString();
    const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash}`;
    // Use replaceState (no navigation) so we don't trigger beforeunload prompts.
    window.history.replaceState({}, document.title, next);
  } catch {
    // ignore
  }
}

export async function handleRedirectCallbackIfPresent(): Promise<boolean> {
  const cb = readCallbackParams();
  if (!cb) return false;

  // Idempotent guard: in dev, React StrictMode can cause effects to run twice.
  // If we process the same code twice, Keycloak will reject the second exchange as "code already used".
  const inflight = sessionStorage.getItem(SS_CALLBACK_INFLIGHT_KEY);
  if (inflight === cb.code) {
    // Another invocation is already (or was) processing this code. Ensure URL is clean.
    stripCallbackParamsFromUrl();
    return true;
  }
  sessionStorage.setItem(SS_CALLBACK_INFLIGHT_KEY, cb.code);

  // Remove code/state from the URL immediately so a re-render / remount won't re-trigger processing.
  // Keep any non-OIDC query params and the hash (HashRouter).
  stripCallbackParamsFromUrl();

  try {
    const expectedState = sessionStorage.getItem(SS_STATE_KEY);
    const verifier = sessionStorage.getItem(SS_VERIFIER_KEY);
    const cfg = loadStoredConfig();
    if (!expectedState || !verifier || !cfg) {
      cleanupUrl();
      clearPkceState();
      return false;
    }
    if (cb.state !== expectedState) {
      cleanupUrl();
      clearPkceState();
      return false;
    }

    const discovery = await discover(cfg.issuerUrl);
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('client_id', cfg.clientId);
    body.set('code', cb.code);
    body.set('redirect_uri', cfg.redirectUri);
    body.set('code_verifier', verifier);

    const res = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const txt = await res.text();
    if (!res.ok) {
      cleanupUrl();
      clearPkceState();
      throw new Error(`OIDC token exchange failed: ${res.status} ${res.statusText}${txt ? `: ${txt}` : ''}`);
    }
    const json = txt ? (JSON.parse(txt) as any) : {};
    const accessToken = String(json.access_token ?? '');
    const tokenType = String(json.token_type ?? 'Bearer');
    const expiresIn = Number(json.expires_in ?? 0);
    const refreshToken = typeof json.refresh_token === 'string' ? (json.refresh_token as string) : undefined;
    const idToken = typeof json.id_token === 'string' ? (json.id_token as string) : undefined;

    if (!accessToken) {
      cleanupUrl();
      clearPkceState();
      throw new Error('OIDC token exchange did not return an access_token');
    }

    const expiresAtMs = Date.now() + Math.max(0, expiresIn) * 1000;
    saveTokens({ accessToken, tokenType, expiresAtMs, refreshToken, idToken, scope: cfg.scope });

    // Capture return-to intent before we clear URL params.
    const returnTo = consumeReturnTo();

    cleanupUrl();
    clearPkceState();

    // If we have a return target, restore the URL without leaving the page.
    // Using history.replaceState avoids triggering beforeunload prompts and keeps SPA state stable.
    if (returnTo) {
      try {
        const curBase = `${window.location.origin}${window.location.pathname}`;
        if (returnTo.startsWith(curBase)) {
          window.history.replaceState({}, document.title, returnTo);
        }
      } catch {
        // ignore
      }
    }
    return true;
  } finally {
    // Clear guard regardless of success; URL was already stripped so re-entry won't re-process.
    sessionStorage.removeItem(SS_CALLBACK_INFLIGHT_KEY);
    setAuthNavigationInProgress(false);
  }
}

async function refreshWithStoredConfig(refreshToken: string): Promise<OidcTokens | null> {
  const cfg = loadStoredConfig();
  if (!cfg) return null;
  const discovery = await discover(cfg.issuerUrl);

  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('client_id', cfg.clientId);
  body.set('refresh_token', refreshToken);

  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const txt = await res.text();
  if (!res.ok) return null;
  const json = txt ? (JSON.parse(txt) as any) : {};
  const accessToken = String(json.access_token ?? '');
  if (!accessToken) return null;
  const tokenType = String(json.token_type ?? 'Bearer');
  const expiresIn = Number(json.expires_in ?? 0);
  const newRefreshToken = typeof json.refresh_token === 'string' ? (json.refresh_token as string) : refreshToken;
  const idToken = typeof json.id_token === 'string' ? (json.id_token as string) : undefined;
  const expiresAtMs = Date.now() + Math.max(0, expiresIn) * 1000;
  const tokens: OidcTokens = { accessToken, tokenType, expiresAtMs, refreshToken: newRefreshToken, idToken, scope: cfg.scope };
  saveTokens(tokens);
  return tokens;
}
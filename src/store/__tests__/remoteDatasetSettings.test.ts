import { clearRemoteAccessToken, loadRemoteDatasetSettings, saveRemoteDatasetSettings } from '../remoteDatasetSettings';

describe('remoteDatasetSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('defaults to empty strings', () => {
    const s = loadRemoteDatasetSettings();
    expect(s.remoteServerBaseUrl).toBe('');
    expect(s.oidcIssuerUrl).toBe('');
    expect(s.oidcClientId).toBe('');
    expect(s.oidcScope).toBe('');
    expect(s.remoteAccessToken).toBeUndefined();
  });

  test('can store and reload baseUrl and oidc config', () => {
    saveRemoteDatasetSettings({
      remoteServerBaseUrl: ' http://localhost:8081 ',
      oidcIssuerUrl: ' https://kc/realms/r ',
      oidcClientId: ' pwa-modeller ',
      oidcScope: ' openid '
    });
    const s = loadRemoteDatasetSettings();
    expect(s.remoteServerBaseUrl).toBe('http://localhost:8081');
    expect(s.oidcIssuerUrl).toBe('https://kc/realms/r');
    expect(s.oidcClientId).toBe('pwa-modeller');
    expect(s.oidcScope).toBe('openid');
  });

  test('clearRemoteAccessToken removes the token', () => {
    saveRemoteDatasetSettings({ remoteAccessToken: 'token123' });
    clearRemoteAccessToken();
    const s = loadRemoteDatasetSettings();
    expect(s.remoteAccessToken).toBeUndefined();
  });
});

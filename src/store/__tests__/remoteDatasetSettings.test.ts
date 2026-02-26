import { clearRemoteAccessToken, loadRemoteDatasetSettings, saveRemoteDatasetSettings } from '../remoteDatasetSettings';

describe('remoteDatasetSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('defaults to empty strings', () => {
    const s = loadRemoteDatasetSettings();
    expect(s.remoteServerBaseUrl).toBe('');
    expect(s.remoteAccessToken).toBe('');
  });

  test('can store and reload baseUrl and token', () => {
    saveRemoteDatasetSettings({ remoteServerBaseUrl: ' http://localhost:8081 ', remoteAccessToken: '  token123  ' });
    const s = loadRemoteDatasetSettings();
    expect(s.remoteServerBaseUrl).toBe('http://localhost:8081');
    expect(s.remoteAccessToken).toBe('token123');
  });

  test('clearRemoteAccessToken removes the token', () => {
    saveRemoteDatasetSettings({ remoteAccessToken: 'token123' });
    clearRemoteAccessToken();
    const s = loadRemoteDatasetSettings();
    expect(s.remoteAccessToken).toBe('');
  });
});

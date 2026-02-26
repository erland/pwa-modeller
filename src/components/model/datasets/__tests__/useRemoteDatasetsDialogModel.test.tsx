import { act, renderHook, waitFor } from '@testing-library/react';

import { useRemoteDatasetsDialogModel } from '../useRemoteDatasetsDialogModel';

// This is a contract-level test for the dialog model hook.
// We mock store + API layers and verify the hook wires them together correctly.

const mockListRemoteDatasets = jest.fn();
const mockCreateRemoteDataset = jest.fn();
const mockOpenDataset = jest.fn();
const mockUpsertDatasetEntry = jest.fn();
const mockGetRemoteDatasetBackend = jest.fn();

const mockLoadSettings = jest.fn();
const mockSaveSettings = jest.fn();
const mockBeginLogin = jest.fn();
const mockClearTokens = jest.fn();
const mockIsLoggedIn = jest.fn();

jest.mock('../../../../store/remoteDatasetApi', () => {
  return {
    listRemoteDatasets: (...args: any[]) => mockListRemoteDatasets(...args),
    createRemoteDataset: (...args: any[]) => mockCreateRemoteDataset(...args)
  };
});

jest.mock('../../../../store', () => {
  return {
    openDataset: (...args: any[]) => mockOpenDataset(...args),
    upsertDatasetEntry: (...args: any[]) => mockUpsertDatasetEntry(...args)
  };
});

jest.mock('../../../../store/getRemoteDatasetBackend', () => {
  return {
    getRemoteDatasetBackend: () => mockGetRemoteDatasetBackend()
  };
});

jest.mock('../../../../store/remoteDatasetSettings', () => {
  return {
    loadRemoteDatasetSettings: () => mockLoadSettings(),
    saveRemoteDatasetSettings: (...args: any[]) => mockSaveSettings(...args)
  };
});

jest.mock('../../../../auth/oidcPkceAuth', () => {
  return {
    beginLogin: (...args: any[]) => mockBeginLogin(...args),
    clearTokens: () => mockClearTokens(),
    isLoggedIn: () => mockIsLoggedIn()
  };
});

describe('useRemoteDatasetsDialogModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadSettings.mockReturnValue({
      remoteServerBaseUrl: 'https://server/',
      oidcIssuerUrl: 'https://kc/realms/r',
      oidcClientId: 'pwa-modeller',
      oidcScope: 'openid profile email'
    });
    mockIsLoggedIn.mockReturnValue(true);
    mockGetRemoteDatasetBackend.mockReturnValue({ kind: 'remote' });
  });

  test('loads last-used settings when opening', async () => {
    const { result, rerender } = renderHook(
      (p: any) => useRemoteDatasetsDialogModel(p),
      { initialProps: { isOpen: false, onClose: jest.fn() } }
    );

    expect(result.current.baseUrl).toBe('');
    expect(result.current.issuerUrl).toBe('');

    rerender({ isOpen: true, onClose: jest.fn() });

    await waitFor(() => {
      expect(result.current.baseUrl).toBe('https://server/');
      expect(result.current.issuerUrl).toBe('https://kc/realms/r');
    });
  });

  test('refresh lists datasets with normalized baseUrl and persists settings', async () => {
    mockListRemoteDatasets.mockResolvedValue([{ id: 'ds1', name: 'A', description: null, updatedAt: '2026-01-01' }]);

    const { result } = renderHook(() => useRemoteDatasetsDialogModel({ isOpen: true, onClose: jest.fn() }));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockListRemoteDatasets).toHaveBeenCalledWith({ baseUrl: 'https://server' });
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteServerBaseUrl: 'https://server',
        oidcIssuerUrl: 'https://kc/realms/r',
        oidcClientId: 'pwa-modeller'
      })
    );

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]?.id).toBe('ds1');
  });

  test('doCreate posts and refreshes list', async () => {
    mockListRemoteDatasets.mockResolvedValue([{ id: 'ds2', name: 'B', description: null, updatedAt: '2026-01-01' }]);
    mockCreateRemoteDataset.mockResolvedValue({ id: 'ds2' });

    const { result } = renderHook(() => useRemoteDatasetsDialogModel({ isOpen: true, onClose: jest.fn() }));

    act(() => {
      result.current.setCreateName(' My dataset ');
      result.current.setCreateDesc(' Desc ');
    });

    await act(async () => {
      await result.current.doCreate();
    });

    expect(mockCreateRemoteDataset).toHaveBeenCalledWith({
      baseUrl: 'https://server',
      name: 'My dataset',
      description: 'Desc'
    });
    expect(mockListRemoteDatasets).toHaveBeenCalled();
    expect(result.current.rows[0]?.id).toBe('ds2');
  });

  test('doOpen upserts entry, opens via remote backend, persists settings and closes', async () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useRemoteDatasetsDialogModel({ isOpen: true, onClose }));

    await act(async () => {
      await result.current.doOpen('ds1', 'Dataset 1');
    });

    expect(mockUpsertDatasetEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: 'remote:ds1',
        storageKind: 'remote',
        name: 'Dataset 1',
        remote: expect.objectContaining({
          baseUrl: 'https://server',
          serverDatasetId: 'ds1',
          displayName: 'Dataset 1'
        })
      })
    );
    expect(mockOpenDataset).toHaveBeenCalledWith('remote:ds1', { kind: 'remote' });
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ remoteServerBaseUrl: 'https://server' })
    );
    expect(onClose).toHaveBeenCalled();
  });
});

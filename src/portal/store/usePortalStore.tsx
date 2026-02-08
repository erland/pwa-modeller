import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type PortalDatasetMeta = {
  title?: string;
  bundleId?: string;
};

export type PortalStoreState = {
  datasetMeta: PortalDatasetMeta | null;
  // Loader + cache will be added in Step 3.
  setDatasetMeta: (meta: PortalDatasetMeta | null) => void;
};

const PortalStoreContext = createContext<PortalStoreState | null>(null);

export function PortalStoreProvider({ children }: { children: ReactNode }) {
  const [datasetMeta, setDatasetMeta] = useState<PortalDatasetMeta | null>(null);

  const value = useMemo<PortalStoreState>(
    () => ({
      datasetMeta,
      setDatasetMeta
    }),
    [datasetMeta]
  );

  return <PortalStoreContext.Provider value={value}>{children}</PortalStoreContext.Provider>;
}

export function usePortalStore() {
  const ctx = useContext(PortalStoreContext);
  if (!ctx) throw new Error('usePortalStore must be used within PortalStoreProvider');
  return ctx;
}

import { fetchLatest, type LatestPointer } from './portalDataset';

export type PortalUpdateCheck = {
  updateAvailable: boolean;
  latest?: LatestPointer;
};

export async function checkPortalForUpdate(latestUrl: string, currentBundleId: string | null | undefined): Promise<PortalUpdateCheck> {
  const url = latestUrl.trim();
  if (!url) return { updateAvailable: false };

  const latest = await fetchLatest(url);
  const updateAvailable = currentBundleId ? latest.bundleId !== currentBundleId : true;
  return { updateAvailable, latest };
}

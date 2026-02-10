import type { Model } from '../../domain';
import { PORTAL_MAX_BYTES, formatBytes } from '../data/portalLimits';
import { PortalFetchError } from '../data/portalDataset';

export function isModelLike(v: unknown): v is Model {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['elements'] === 'object' &&
    o['elements'] !== null &&
    typeof o['relationships'] === 'object' &&
    o['relationships'] !== null &&
    typeof o['views'] === 'object' &&
    o['views'] !== null
  );
}

export function formatPortalError(e: unknown): string {
  if (e instanceof PortalFetchError) {
    const base = e.message;
    const details = e.details ? `\nDetails: ${e.details}` : '';

    if (e.kind === 'cors') {
      return (
        `${base}` +
        `\nHint: This often means CORS is blocking cross-origin reads.` +
        ` Ensure the host serves the files with an Access-Control-Allow-Origin header` +
        ` (or host the bundle on the same origin as the portal).` +
        details
      );
    }

    if (e.kind === 'http') {
      return `${base}\nHint: Verify the URL is correct and the file is publicly accessible.${details}`;
    }

    if (e.kind === 'parse') {
      return `${base}\nHint: The server may be returning HTML (e.g., an error page) instead of JSON.${details}`;
    }

    if (e.kind === 'size') {
      return (
        `${base}` +
        `\nHint: Portal limits are: model ≤ ${formatBytes(PORTAL_MAX_BYTES.modelJson)}, indexes ≤ ${formatBytes(PORTAL_MAX_BYTES.indexesJson)}.` +
        ` You can tune these in src/portal/data/portalLimits.ts.`
      );
    }

    if (e.kind === 'schema') {
      return `${base}\nHint: The published files do not match the expected bundle format.`;
    }

    if (e.kind === 'timeout') {
      return `${base}\nHint: The host might be slow. Try again or use a faster/static host.`;
    }

    return `${base}${details}`;
  }

  return e instanceof Error ? e.message : String(e);
}

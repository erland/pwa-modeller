import type { Model } from '../../domain';
import { buildPortalIndexes } from '../../portal/indexes/portalIndexes';
import { ZipWriter } from '../../export/zip/zipWriter';
import { crc32 } from '../../export/zip/crc32';
import { PORTAL_MAX_BYTES, formatBytes } from '../../portal/data/portalLimits';

export type PublishManifestV1 = {
  schemaVersion: number;
  bundleId: string;
  createdAt: string;
  source: {
    tool: string;
    exportType: string;
    exportName?: string;
  };
  counts: {
    elements: number;
    relationships: number;
    views: number;
    viewNodes: number;
    viewConnections: number;
  };
  entrypoints: {
    model: string;
    indexes: string;
  };
};

function encUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function shortHashHex(bytes: Uint8Array): string {
  // crc32 returns unsigned 32-bit; format as 8-hex
  const n = crc32(bytes) >>> 0;
  return n.toString(16).padStart(8, '0');
}

function computeCounts(model: Model): PublishManifestV1['counts'] {
  const views = Object.values(model.views ?? {});
  const viewNodes = views.reduce((a, v) => a + (v.layout?.nodes?.length ?? 0), 0);
  const viewConnections = views.reduce((a, v) => a + (v.connections?.length ?? 0), 0);
  return {
    elements: Object.keys(model.elements ?? {}).length,
    relationships: Object.keys(model.relationships ?? {}).length,
    views: views.length,
    viewNodes,
    viewConnections
  };
}

export type PublishBundleBuildResult = {
  bundleId: string;
  createdAt: string;
  manifest: PublishManifestV1;
  model: Model;
  indexes: ReturnType<typeof buildPortalIndexes>;
  zipBytes: Uint8Array;
  zipFileName: string;
};

export function buildPublishBundleZip(model: Model, opts: { sourceTool?: string; exportType?: string; exportName?: string }): PublishBundleBuildResult {
  const createdAt = new Date().toISOString();

  const indexes = buildPortalIndexes(model);

  const modelJson = JSON.stringify(model);
  const indexesJson = JSON.stringify(indexes);

  // Step 9 hardening: ensure produced bundles are within the portal's default limits.
  const modelBytes = encUtf8(modelJson).byteLength;
  const indexesBytes = encUtf8(indexesJson).byteLength;
  if (modelBytes > PORTAL_MAX_BYTES.modelJson) {
    throw new Error(
      `model.json is too large (${formatBytes(modelBytes)}). Portal default limit is ${formatBytes(PORTAL_MAX_BYTES.modelJson)}. ` +
        `Consider splitting the dataset, pruning views, or raising the limits.`
    );
  }
  if (indexesBytes > PORTAL_MAX_BYTES.indexesJson) {
    throw new Error(
      `indexes.json is too large (${formatBytes(indexesBytes)}). Portal default limit is ${formatBytes(PORTAL_MAX_BYTES.indexesJson)}. ` +
        `Consider pruning search/index detail or raising the limits.`
    );
  }

  // Bundle id: timestamp + short content hash
  const contentHash = shortHashHex(encUtf8(modelJson));
  const bundleId = `${createdAt.replace(/[:.]/g, '-')}-${contentHash}`;

  const manifest: PublishManifestV1 = {
    schemaVersion: 1,
    bundleId,
    createdAt,
    source: {
      tool: opts.sourceTool ?? 'SparxEA',
      exportType: opts.exportType ?? 'XMI',
      exportName: opts.exportName
    },
    counts: computeCounts(model),
    entrypoints: {
      model: 'model.json',
      indexes: 'indexes.json'
    }
  };

  const manifestJson = JSON.stringify(manifest, null, 2);

  const zw = new ZipWriter();
  const prefix = `${bundleId}/`;
  zw.addFile(prefix + 'manifest.json', manifestJson);
  zw.addFile(prefix + 'model.json', modelJson);
  zw.addFile(prefix + 'indexes.json', indexesJson);

  const zipBytes = zw.build();
  const zipFileName = `publish-bundle-${bundleId}.zip`;

  return { bundleId, createdAt, manifest, model, indexes, zipBytes, zipFileName };
}

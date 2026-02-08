export type LatestPointerV1 = {
  bundleId: string;
  manifestUrl: string;
  title?: string;
  channel?: string;
  environment?: string;
};

/**
 * Build a latest.json pointer for a published bundle.
 * The manifestUrl is usually relative to latest.json to keep hosting flexible.
 */
export function buildLatestPointer(opts: { bundleId: string; title?: string; channel?: string; environment?: string }): LatestPointerV1 {
  return {
    bundleId: opts.bundleId,
    manifestUrl: `./${opts.bundleId}/manifest.json`,
    title: opts.title,
    channel: opts.channel,
    environment: opts.environment
  };
}

export function buildLatestPointerJson(opts: { bundleId: string; title?: string; channel?: string; environment?: string }): string {
  return JSON.stringify(buildLatestPointer(opts), null, 2);
}

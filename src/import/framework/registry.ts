import type { ImportContext, Importer } from './importer';

const registry: Importer[] = [];

export function registerImporter(importer: Importer): void {
  const id = importer.id.trim();
  if (!id) throw new Error('Importer id must be a non-empty string.');

  const existing = registry.find((x) => x.id === id);
  if (existing) {
    throw new Error(`Importer id already registered: "${id}"`);
  }
  registry.push(importer);
  // Ensure deterministic selection: highest priority first, then id.
  registry.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
}

export function getImporters(): readonly Importer[] {
  return registry;
}

export function clearImportersForTests(): void {
  registry.length = 0;
}

export type ImporterPick = {
  importer: Importer;
  reason: 'sniff' | 'extension';
};

function extensionMatches(importer: Importer, extension: string | null): boolean {
  if (!extension) return false;
  const exts = importer.extensions ?? [];
  return exts.includes(extension);
}

/**
 * Select the best importer based on sniffing (preferred) and file extension fallback.
 */
export async function pickImporter(ctx: ImportContext): Promise<ImporterPick | null> {
  // 1) Try sniffers in priority order.
  for (const importer of registry) {
    if (!importer.sniff) continue;
    try {
      const ok = await importer.sniff(ctx);
      if (ok) return { importer, reason: 'sniff' };
    } catch {
      // Ignore sniff errors; importer may be strict and throw on unexpected input.
    }
  }

  // 2) Fall back to extension matching.
  for (const importer of registry) {
    if (extensionMatches(importer, ctx.extension)) {
      return { importer, reason: 'extension' };
    }
  }

  return null;
}

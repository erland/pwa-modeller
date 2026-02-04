import type { Model } from '../../domain';

import { sanitizeFileName } from '../../store';

export { readFileAsText } from '../shared/fileUtils';

/**
 * Prefer a stable, human friendly base name for overlay exports.
 */
export function defaultOverlayFileBase(model: Model, fileName: string | null): string {
  const fromFile = fileName ? fileName.replace(/\.[^.]+$/, '') : '';
  const fromMeta = (model.metadata?.name || '').trim();
  const base = fromMeta || fromFile || 'model';
  return sanitizeFileName(base);
}

/**
 * Parse a list of keys where users typically paste one-per-line.
 * Supports newline, comma, semicolon and tab separators.
 */
export function parseKeyList(text: string): string[] {
  return (text ?? '')
    .split(/[\n,;\t]/g)
    .map((s) => s.trim())
    .filter((s) => !!s);
}

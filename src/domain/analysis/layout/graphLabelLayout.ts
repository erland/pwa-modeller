/**
 * Shared label layout helpers for SVG-based mini graphs (Analysis / Traceability).
 *
 * Goals:
 * - Wrap labels into up to N lines (default 3)
 * - Measure text widths (with caching) using a hidden canvas where available
 * - Provide stable fallbacks in non-browser environments (tests / SSR)
 */

export type TextMeasurer = (text: string, font: string) => number;

export type WrapLabelOptions = {
  /** Maximum width (px) for each line. */
  maxWidthPx: number;
  /** Maximum number of lines. Default: 3. */
  maxLines?: number;
  /** CSS font value used for measurement. Default: '12px system-ui'. */
  font?: string;
  /** Ellipsis string. Default: '…'. */
  ellipsis?: string;
  /** Override measurer (useful for tests). Default: measureTextPx. */
  measureTextPx?: TextMeasurer;
};

export type WrappedLabel = {
  lines: string[];
  truncated: boolean;
};

export type WrappedLabelMetrics = {
  maxLineWidthPx: number;
  lineCount: number;
};

const DEFAULT_FONT = '12px system-ui';
const DEFAULT_ELLIPSIS = '…';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

const measureCache = new Map<string, number>();
const MAX_MEASURE_CACHE = 20000;

function getFontSizePx(font: string): number {
  const m = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
  const n = m ? Number(m[1]) : 12;
  return Number.isFinite(n) && n > 0 ? n : 12;
}

function fallbackMeasureTextPx(text: string, font: string): number {
  // Rough but stable approximation: average glyph ~0.6em.
  const size = getFontSizePx(font);
  const avg = size * 0.6;
  return text.length * avg;
}

function ensureCanvas(font: string): CanvasRenderingContext2D | null {
  try {
    if (ctx) {
      ctx.font = font;
      return ctx;
    }
    if (typeof document === 'undefined') return null;
    canvas = canvas ?? document.createElement('canvas');
    ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.font = font;
    return ctx;
  } catch {
    return null;
  }
}

export const measureTextPx: TextMeasurer = (text, font) => {
  const key = `${font}\u0000${text}`;
  const cached = measureCache.get(key);
  if (cached !== undefined) return cached;

  const context = ensureCanvas(font);
  const w = context ? context.measureText(text).width : fallbackMeasureTextPx(text, font);
  // Simple guardrail against unbounded growth (long sessions, many unique labels).
  if (measureCache.size > MAX_MEASURE_CACHE) measureCache.clear();
  measureCache.set(key, w);
  return w;
};

export function clearTextMeasureCache(): void {
  measureCache.clear();
}

function normalizeText(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function truncateToWidth(
  text: string,
  maxWidthPx: number,
  font: string,
  measurer: TextMeasurer,
  ellipsis: string
): { text: string; truncated: boolean } {
  if (!text) return { text: '', truncated: false };
  if (measurer(text, font) <= maxWidthPx) return { text, truncated: false };

  // Ensure ellipsis itself fits (otherwise return empty).
  if (measurer(ellipsis, font) > maxWidthPx) return { text: '', truncated: true };

  // Binary search the max prefix length that fits with ellipsis.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (measurer(candidate, font) <= maxWidthPx) lo = mid;
    else hi = mid - 1;
  }
  return { text: text.slice(0, lo) + ellipsis, truncated: true };
}

/**
 * Wrap a label to maxLines. Greedy word wrapping with truncation on overflow.
 */
export function wrapLabel(rawText: string, opts: WrapLabelOptions): WrappedLabel {
  const font = opts.font ?? DEFAULT_FONT;
  const ellipsis = opts.ellipsis ?? DEFAULT_ELLIPSIS;
  const maxLines = opts.maxLines ?? 3;
  const maxWidthPx = opts.maxWidthPx;
  const measurer = opts.measureTextPx ?? measureTextPx;

  const text = normalizeText(rawText);
  if (!text) return { lines: [''], truncated: false };

  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  let truncated = false;

  const pushLine = (line: string) => {
    lines.push(line);
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;

    if (measurer(candidate, font) <= maxWidthPx) {
      current = candidate;
      continue;
    }

    if (current) {
      pushLine(current);
      current = '';
      if (lines.length === maxLines) {
        // No more room: truncate remaining words into the last line.
        const remainder = [word, ...words.slice(i + 1)].join(' ');
        const prev = lines[maxLines - 1];
        const combined = prev ? `${prev} ${remainder}` : remainder;
        const t = truncateToWidth(combined, maxWidthPx, font, measurer, ellipsis);
        lines[maxLines - 1] = t.text;
        truncated = true;
        return { lines, truncated };
      }
      // retry placing the word on the new line (fallthrough)
    }

    // Word does not fit on an empty line: hard truncate it.
    const t = truncateToWidth(word, maxWidthPx, font, measurer, ellipsis);
    current = t.text;
    truncated = truncated || t.truncated;

    // If we already used up max lines after putting this word, stop.
    if (lines.length + 1 === maxLines) {
      // If there are remaining words, truncate final line further with remainder.
      if (i < words.length - 1) {
        const remainder = words.slice(i + 1).join(' ');
        const combined = current ? `${current} ${remainder}` : remainder;
        const t2 = truncateToWidth(combined, maxWidthPx, font, measurer, ellipsis);
        current = t2.text;
        truncated = true;
      }
      break;
    }
  }

  if (current) pushLine(current);

  // Guard: if we somehow exceed maxLines, enforce it.
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    const t = truncateToWidth(last, maxWidthPx, font, measurer, ellipsis);
    kept[maxLines - 1] = t.text;
    return { lines: kept, truncated: true };
  }

  return { lines, truncated };
}

export function measureWrappedLabel(label: WrappedLabel, font: string = DEFAULT_FONT, measurer: TextMeasurer = measureTextPx): WrappedLabelMetrics {
  const maxLineWidthPx = label.lines.reduce((m, line) => Math.max(m, measurer(line, font)), 0);
  return { maxLineWidthPx, lineCount: label.lines.length };
}

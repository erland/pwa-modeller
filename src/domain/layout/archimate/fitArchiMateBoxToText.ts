import type { Element, ViewNodeLayout } from '../../types';
import { measureTextWidthPx } from '../measureText';

export type FitToTextOptions = {
  /** Minimum width for the box. Defaults to 120. */
  minWidth?: number;
  /** Minimum height for the box. Defaults to 60. */
  minHeight?: number;
};

function typeLabelForElement(el: Element): string {
  if (el.type === 'Unknown') {
    return el.unknownType?.name ? `Unknown: ${el.unknownType.name}` : 'Unknown';
  }
  return el.type;
}

function clampMin(n: number, min: number): number {
  return n < min ? min : n;
}

/**
 * Computes a size for the default ArchiMate element box so the visible text fits.
 *
 * This targets the default DiagramNode rendering (symbol + title + meta line + optional style tag),
 * not BPMN/UML custom node renderers.
 */
export function fitArchiMateBoxToText(
  el: Element,
  nodeLayout: ViewNodeLayout,
  options: FitToTextOptions = {}
): { width: number; height: number } {
  // CSS-derived constants (see styles/shell.css)
  const outerPadding = 10;
  const symbolSize = 18;
  const headerGap = 8;
  const headerBottomMargin = 6;

  const titleFont = '700 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const metaFont = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const tagFont = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

  const titleText = el.name || '(unnamed)';
  const metaText = typeLabelForElement(el);
  const tagText = nodeLayout.styleTag || '';

  const titleW = measureTextWidthPx(titleText, titleFont);
  const metaW = measureTextWidthPx(metaText, metaFont);

  const headerContentW = symbolSize + headerGap + titleW;

  // Tag has horizontal padding (8px left+right) and a pill background.
  const tagPaddingX = 16;
  const tagW = tagText ? measureTextWidthPx(tagText, tagFont) + tagPaddingX : 0;

  const contentW = Math.max(headerContentW, metaW, tagW);
  const minWidth = options.minWidth ?? 120;
  const width = clampMin(Math.ceil(contentW + outerPadding * 2), minWidth);

  // Height approximation (line heights are not explicitly set)
  const titleLineH = 16; // ~13px with bold + default line-height
  const metaLineH = 15; // ~12px
  const headerH = Math.max(symbolSize, titleLineH);

  let contentH = headerH + headerBottomMargin + metaLineH;

  if (tagText) {
    const tagMarginTop = 6;
    const tagPaddingY = 4; // 2px top + 2px bottom
    const tagLineH = 14; // ~11px
    contentH += tagMarginTop + tagLineH + tagPaddingY;
  }

  const minHeight = options.minHeight ?? 60;
  const height = clampMin(Math.ceil(contentH + outerPadding * 2), minHeight);

  return { width, height };
}

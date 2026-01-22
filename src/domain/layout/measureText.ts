/**
 * Measure text width in pixels.
 *
 * In the browser we use a canvas 2D context. In test/non-DOM environments
 * we fall back to a small approximation.
 */
export function measureTextWidthPx(text: string, fontCss: string, fallbackCharWidth = 7): number {
  const t = text ?? '';
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = fontCss;
        return ctx.measureText(t).width;
      }
    }
  } catch {
    // Ignore and use fallback.
  }
  return t.length * fallbackCharWidth;
}

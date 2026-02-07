import { resolveEdgeStyle } from '../edgeStyle';
import type { PptxEdgeMeta } from '../pptxPostProcessMeta';

describe('edgeStyle.resolveEdgeStyle', () => {
  it('defaults to solid with no ends', () => {
    expect(resolveEdgeStyle(null, null)).toEqual({ dash: 'solid', head: 'none', tail: 'none' });
  });

  it('uses marker style when meta has no explicit style', () => {
    expect(resolveEdgeStyle(undefined, { pattern: 'dashed', head: 'arrow', tail: 'triangle' })).toEqual({
      dash: 'dash',
      head: 'arrow',
      tail: 'triangle',
    });
  });

  it('meta explicit style wins over marker style', () => {
    const meta: PptxEdgeMeta = {
      edgeId: 'E1',
      linePattern: 'dotted',
      pptxHeadEnd: 'diamond',
      pptxTailEnd: 'oval',
      x1In: 0,
      y1In: 0,
      x2In: 1,
      y2In: 1,
      rectIn: { x: 0, y: 0, cx: 1, cy: 1 },
    };
    expect(resolveEdgeStyle(meta, { pattern: 'dashed', head: 'arrow', tail: 'triangle' })).toEqual({
      dash: 'dot',
      head: 'diamond',
      tail: 'oval',
    });
  });

  it('falls back to meta.dashed when neither meta.linePattern nor marker pattern exist', () => {
    const meta: PptxEdgeMeta = {
      edgeId: 'E2',
      dashed: true,
      x1In: 0,
      y1In: 0,
      x2In: 1,
      y2In: 1,
      rectIn: { x: 0, y: 0, cx: 1, cy: 1 },
    };
    expect(resolveEdgeStyle(meta, null)).toEqual({ dash: 'dash', head: 'none', tail: 'none' });
  });
});

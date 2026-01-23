import { measureWrappedLabel, wrapLabel } from '../graphLabelLayout';

const monoMeasurer = (text: string) => text.length * 10; // 10px per char
const measurer = (text: string, _font: string) => monoMeasurer(text);

describe('graphLabelLayout.wrapLabel', () => {
  test('wraps words greedily within maxWidth', () => {
    const r = wrapLabel('Alpha Beta Gamma', { maxWidthPx: 60, maxLines: 3, measureTextPx: measurer });
    // 'Alpha' (50) fits, 'Alpha Beta' (100) doesn't -> line break.
    expect(r.lines).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(r.truncated).toBe(false);
  });

  test('normalizes whitespace', () => {
    const r = wrapLabel('  Alpha   Beta\nGamma  ', { maxWidthPx: 200, maxLines: 3, measureTextPx: measurer });
    expect(r.lines).toEqual(['Alpha Beta Gamma']);
  });

  test('truncates long single word when it cannot fit', () => {
    const r = wrapLabel('Supercalifragilisticexpialidocious', { maxWidthPx: 80, maxLines: 3, measureTextPx: measurer });
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].endsWith('…')).toBe(true);
    expect(r.truncated).toBe(true);
    expect(monoMeasurer(r.lines[0])).toBeLessThanOrEqual(80);
  });

  test('truncates to maxLines and adds ellipsis', () => {
    const r = wrapLabel('One Two Three Four Five Six Seven Eight Nine', {
      maxWidthPx: 60,
      maxLines: 3,
      measureTextPx: measurer
    });
    expect(r.lines.length).toBe(3);
    expect(r.truncated).toBe(true);
    expect(r.lines[2].endsWith('…')).toBe(true);
    expect(monoMeasurer(r.lines[2])).toBeLessThanOrEqual(60);
  });

  test('returns a single empty line for empty input', () => {
    const r = wrapLabel('   ', { maxWidthPx: 60, measureTextPx: measurer });
    expect(r.lines).toEqual(['']);
    expect(r.truncated).toBe(false);
  });
});

describe('graphLabelLayout.measureWrappedLabel', () => {
  test('returns max line width + line count', () => {
    const w = { lines: ['A', 'BBBB', 'CC'], truncated: false };
    const m = measureWrappedLabel(w, '12px system-ui', measurer);
    expect(m.lineCount).toBe(3);
    expect(m.maxLineWidthPx).toBe(40);
  });
});

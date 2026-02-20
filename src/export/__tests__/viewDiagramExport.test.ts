import { buildTinyGraphModel } from '../../test/fixtures/models/tinyGraph';
import { buildViewExportBundle } from '../viewDiagramExport';

describe('viewDiagramExport', () => {
  test('buildViewExportBundle creates a single SVG image artifact with a sensible title', () => {
    const model = buildTinyGraphModel();
    const bundle = buildViewExportBundle(model, 'v_main');

    expect(bundle.title).toContain('Tiny Graph');
    expect(bundle.title).toContain('Main View');
    expect(bundle.artifacts).toHaveLength(1);
    const a = bundle.artifacts[0];
    expect(a.type).toBe('image');
    if (a.type !== 'image') throw new Error('Expected image artifact');
    expect(a.data.kind).toBe('svg');
    expect(a.data.data).toContain('<svg');
  });
});

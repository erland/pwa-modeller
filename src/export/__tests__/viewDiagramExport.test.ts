import { buildTinyGraphModel } from '../../test/fixtures/models/tinyGraph';

import { buildViewExportBundle, downloadViewPng, downloadViewPptx, downloadViewSvg } from '../viewDiagramExport';

jest.mock('../../components/diagram/exportSvg', () => ({
  createViewSvg: jest.fn(() => '<svg><!-- mocked --></svg>'),
}));

jest.mock('../../store/download', () => {
  const actual = jest.requireActual('../../store/download');
  return {
    ...actual,
    downloadTextFile: jest.fn(),
    downloadBlobFile: jest.fn(),
  };
});

jest.mock('../image/downloadPngFromSvgText', () => ({
  downloadPngFromSvgText: jest.fn(async () => undefined),
}));

jest.mock('../pptx/generatePptxV1_pptxgenjs', () => ({
  generatePptxBlobV1: jest.fn(async () =>
    new Blob(['pptx'], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }),
  ),
}));

import { createViewSvg } from '../../components/diagram/exportSvg';
import { downloadBlobFile, downloadTextFile } from '../../store/download';
import { downloadPngFromSvgText } from '../image/downloadPngFromSvgText';
import { generatePptxBlobV1 } from '../pptx/generatePptxV1_pptxgenjs';

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

  test('downloadViewSvg uses createViewSvg and downloads an .svg with SVG mime type', () => {
    const model = buildTinyGraphModel();
    downloadViewSvg(model, 'v_main');

    expect(createViewSvg).toHaveBeenCalledWith(model, 'v_main');
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [fileName, text, mime] = (downloadTextFile as jest.Mock).mock.calls[0];
    expect(String(fileName)).toMatch(/\.svg$/i);
    expect(String(text)).toContain('<svg');
    // allow optional charset
    expect(String(mime)).toMatch(/^image\/svg\+xml(\b|;)/);
  });

  test('downloadViewPng calls downloadPngFromSvgText with defaults', async () => {
    const model = buildTinyGraphModel();
    await downloadViewPng(model, 'v_main');

    expect(createViewSvg).toHaveBeenCalledWith(model, 'v_main');
    expect(downloadPngFromSvgText).toHaveBeenCalledTimes(1);
    const [baseName, svgText, opts] = (downloadPngFromSvgText as jest.Mock).mock.calls[0];
    expect(String(baseName)).toContain('Tiny Graph');
    expect(String(svgText)).toContain('<svg');
    expect(opts).toMatchObject({ scale: 2, background: 'white' });
  });

  test('downloadViewPng passes overrides', async () => {
    const model = buildTinyGraphModel();
    await downloadViewPng(model, 'v_main', { scale: 3, background: 'transparent' }, { baseName: 'X' });

    const [baseName, _svgText, opts] = (downloadPngFromSvgText as jest.Mock).mock.calls.at(-1);
    expect(baseName).toBe('X');
    expect(opts).toMatchObject({ scale: 3, background: 'transparent' });
  });

  test('downloadViewPptx generates a pptx blob and downloads it', async () => {
    const model = buildTinyGraphModel();
    await downloadViewPptx(model, 'v_main', { layout: 'LAYOUT_WIDE' });

    expect(generatePptxBlobV1).toHaveBeenCalledTimes(1);
    const [bundle, pptxOpts] = (generatePptxBlobV1 as jest.Mock).mock.calls[0];
    expect(bundle.artifacts).toHaveLength(1);
    expect(bundle.artifacts[0].type).toBe('image');
    expect(bundle.artifacts[0].data.kind).toBe('svg');
    expect(pptxOpts).toMatchObject({ layout: 'LAYOUT_WIDE' });

    expect(downloadBlobFile).toHaveBeenCalledTimes(1);
    const [fileName, blob] = (downloadBlobFile as jest.Mock).mock.calls[0];
    expect(String(fileName)).toMatch(/\.pptx$/i);
    expect(blob).toBeInstanceOf(Blob);
  });
});

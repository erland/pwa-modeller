import { buildExportBundle } from '../../../../../export/builders/buildExportBundle';
import { createExportDialogOfficeActions } from '../exportDialogActionsOffice';

jest.mock('../../../../../export', () => ({
  generatePptxBlobV1: jest.fn(async () =>
    new Blob(['pptx'], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }),
  ),
  generateXlsxBlobV1: jest.fn(async () => new Blob(['xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
}));

jest.mock('../../../../../store/download', () => {
  const actual = jest.requireActual('../../../../../store/download');
  return {
    ...actual,
    downloadBlobFile: jest.fn(),
  };
});

import { generatePptxBlobV1 } from '../../../../../export';
import { downloadBlobFile } from '../../../../../store/download';

describe('createExportDialogOfficeActions (sandbox PPTX)', () => {
  test('downloadPptx calls generatePptxBlobV1 and downloads a .pptx', async () => {
    document.body.innerHTML = `
      <svg class="analysisSandboxSvg" width="100" height="50">
        <rect x="0" y="0" width="10" height="10" style="fill:#ff0000;stroke:#000" />
      </svg>
    `;

    const exportBundle = buildExportBundle({
      kind: 'sandbox',
      modelName: 'Test Model',
      analysisRequest: {} as any,
      analysisViewState: {} as any,
      exportOptions: {} as any,
      document,
    });

    const state = {
      exportBundle,
      exportOptions: { pptx: { layout: 'LAYOUT_WIDE' }, xlsx: {} },
      runAction: async (_label: string, fn: () => Promise<void>) => fn(),
      setStatus: jest.fn(),
    } as any;

    const actions = createExportDialogOfficeActions(state);
    await actions.downloadPptx();

    expect(generatePptxBlobV1).toHaveBeenCalledTimes(1);
    const [bundleArg, pptxOpts] = (generatePptxBlobV1 as jest.Mock).mock.calls[0];
    expect(bundleArg.artifacts).toHaveLength(1);
    expect(bundleArg.artifacts[0].type).toBe('image');
    expect(bundleArg.artifacts[0].data.kind).toBe('svg');
    expect(pptxOpts).toMatchObject({ layout: 'LAYOUT_WIDE' });

    expect(downloadBlobFile).toHaveBeenCalledTimes(1);
    const [fileName, blob] = (downloadBlobFile as jest.Mock).mock.calls[0];
    expect(String(fileName)).toMatch(/\.pptx$/i);
    expect(blob).toBeInstanceOf(Blob);
  });
});

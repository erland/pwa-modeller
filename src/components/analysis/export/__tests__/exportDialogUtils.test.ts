import { findSandboxSvgText, formatLabel, getAvailableFormats, getExportCapabilities } from '../exportDialogUtils';

import type { ExportArtifact } from '../../../../export/contracts/ExportBundle';
import type { AnalysisViewKind } from '../../contracts/analysisViewState';

function imageSvg(data: string): ExportArtifact {
  return {
    type: 'image',
    name: 'image',
    data: {
      kind: 'svg',
      data
    }
  };
}

function imagePng(dataUrl: string): ExportArtifact {
  return {
    type: 'image',
    name: 'image',
    data: {
      kind: 'png',
      data: dataUrl
    }
  };
}

function tableArtifact(): ExportArtifact {
  return {
    type: 'table',
    name: 'table',
    data: {
      headers: ['a'],
      rows: [[1]]
    }
  };
}

describe('exportDialogUtils.getAvailableFormats', () => {
  const expected: Record<AnalysisViewKind, string[]> = {
    sandbox: ['svg', 'png', 'pptx', 'xlsx'],
    matrix: ['xlsx', 'tsv'],
    portfolio: ['csv', 'xlsx'],
    related: ['svg', 'png', 'csv', 'xlsx'],
    paths: ['svg', 'png', 'csv', 'xlsx'],
    traceability: ['svg', 'png']
  };

  for (const kind of Object.keys(expected) as AnalysisViewKind[]) {
    it(`returns expected formats for ${kind}`, () => {
      expect(getAvailableFormats(kind)).toEqual(expected[kind]);
    });
  }
});

describe('exportDialogUtils.formatLabel', () => {
  it('returns stable labels (regression)', () => {
    expect(formatLabel('svg')).toBe('SVG');
    expect(formatLabel('png')).toBe('PNG');
    expect(formatLabel('pptx')).toBe('PPTX');
    expect(formatLabel('xlsx')).toBe('XLSX');
    expect(formatLabel('tsv')).toBe('TSV (table)');
    expect(formatLabel('csv')).toBe('CSV');
  });
});

describe('exportDialogUtils.findSandboxSvgText', () => {
  it('returns the SVG text for the first svg image artifact', () => {
    const svg = '<svg></svg>';
    const artifacts: ExportArtifact[] = [imagePng('data:image/png;base64,xx'), imageSvg(svg), tableArtifact()];
    expect(findSandboxSvgText(artifacts)).toBe(svg);
  });

  it('returns null if no svg image artifact exists', () => {
    const artifacts: ExportArtifact[] = [imagePng('data:image/png;base64,xx'), tableArtifact()];
    expect(findSandboxSvgText(artifacts)).toBeNull();
  });
});

describe('exportDialogUtils.getExportCapabilities', () => {
  it('enables svg/png only when sandboxSvgText is present', () => {
    const capsNoSvg = getExportCapabilities({
      kind: 'traceability',
      sandboxSvgText: null,
      artifacts: []
    });
    expect(capsNoSvg.canSvg).toBe(false);
    expect(capsNoSvg.canPng).toBe(false);

    const capsSvg = getExportCapabilities({
      kind: 'traceability',
      sandboxSvgText: '<svg />',
      artifacts: []
    });
    expect(capsSvg.canSvg).toBe(true);
    expect(capsSvg.canPng).toBe(true);
  });

  it('enables pptx only for sandbox kind (regression)', () => {
    expect(
      getExportCapabilities({
        kind: 'sandbox',
        sandboxSvgText: '<svg />',
        artifacts: []
      }).canPptx
    ).toBe(true);

    expect(
      getExportCapabilities({
        kind: 'related',
        sandboxSvgText: '<svg />',
        artifacts: []
      }).canPptx
    ).toBe(false);
  });

  it('sets hasTable and enables table-driven exports', () => {
    const capsNoTable = getExportCapabilities({
      kind: 'matrix',
      sandboxSvgText: '<svg />',
      artifacts: []
    });
    expect(capsNoTable.hasTable).toBe(false);
    expect(capsNoTable.canCsv).toBe(false);
    expect(capsNoTable.canTsv).toBe(false);
    expect(capsNoTable.canXlsx).toBe(false); // matrix without table

    const capsWithTable = getExportCapabilities({
      kind: 'matrix',
      sandboxSvgText: '<svg />',
      artifacts: [tableArtifact()]
    });
    expect(capsWithTable.hasTable).toBe(true);
    expect(capsWithTable.canCsv).toBe(true);
    expect(capsWithTable.canTsv).toBe(true);
    expect(capsWithTable.canXlsx).toBe(true);
  });

  it('enables xlsx for sandbox even without table (regression)', () => {
    const caps = getExportCapabilities({
      kind: 'sandbox',
      sandboxSvgText: '<svg />',
      artifacts: []
    });
    expect(caps.canXlsx).toBe(true);
  });
});

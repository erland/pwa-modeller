import { useEffect, useMemo, useState } from 'react';

import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewKind, AnalysisViewState } from '../contracts/analysisViewState';
import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';
import type { Model, ModelKind, PathsBetweenResult, RelatedElementsResult } from '../../../domain';

import { getAnalysisAdapter } from '../../../analysis/adapters/registry';
import { createAnalysisResultFormatters } from '../results/analysisResultFormatters';

import {
  addToExportReport,
  buildExportBundle,
  canWriteImageToClipboard,
  clearExportReport,
  copyPngFromSvgText,
  copyTextToClipboard,
  deriveDefaultExportOptions,
  downloadPngFromSvgText,
  exportReportAsJsonBlob,
  generatePptxBlobV1,
  generateXlsxBlobV1,
  loadExportReport,
  tabularToCsv,
  tabularToTsv,
} from '../../../export';
import { downloadBlobFile, sanitizeFileNameWithExtension } from '../../../store/download';

import {
  findSandboxSvgText,
  getAvailableFormats,
  getExportCapabilities,
  type ExportFormat,
} from './exportDialogUtils';

type ControllerArgs = {
  isOpen: boolean;
  kind: AnalysisViewKind;
  analysisRequest: AnalysisRequest;
  analysisViewState: AnalysisViewState;
  modelName: string;
  matrix?: { result: RelationshipMatrixResult | null; cellValues?: number[][] };
  model?: Model | null;
  modelKind?: ModelKind | null;
  relatedResult?: RelatedElementsResult | null;
  pathsResult?: PathsBetweenResult | null;
  portfolioTable?: import('../../../export').TabularData | null;
};

type ControllerState = {
  exportOptions: ReturnType<typeof deriveDefaultExportOptions>;
  exportBundle: ReturnType<typeof buildExportBundle>;
  sandboxSvgText: string | null;

  availableFormats: ExportFormat[];
  format: ExportFormat;
  setFormat: (f: ExportFormat) => void;

  busy: boolean;
  status: string | null;
  reportCount: number;

  canSvg: boolean;
  canPng: boolean;
  canPptx: boolean;
  canXlsx: boolean;
  canTsv: boolean;
  canCsv: boolean;
  canCopyImage: boolean;

  actions: {
    copyTableTsv: () => Promise<void>;
    downloadCsv: () => Promise<void>;
    copySvg: () => Promise<void>;
    downloadSvg: () => Promise<void>;
    copyPng: () => Promise<void>;
    downloadPng: () => Promise<void>;
    downloadPptx: () => Promise<void>;
    downloadXlsx: () => Promise<void>;
    addToReport: () => void;
    downloadReportJson: () => void;
    clearReport: () => void;
  };
};

export function useExportDialogController(args: ControllerArgs): ControllerState {
  const {
    isOpen,
    kind,
    analysisRequest,
    analysisViewState,
    modelName,
    matrix,
    model,
    modelKind,
    relatedResult,
    pathsResult,
    portfolioTable,
  } = args;

  const exportOptions = useMemo(() => deriveDefaultExportOptions(kind), [kind]);

  const fmt = useMemo(() => {
    if (!model || !modelKind) return null;
    const adapter = getAnalysisAdapter(modelKind);
    const f = createAnalysisResultFormatters(adapter, model);
    return { nodeLabel: f.nodeLabel, nodeType: f.nodeType, nodeLayer: f.nodeLayer };
  }, [model, modelKind]);

  const exportBundle = useMemo(() => {
    return buildExportBundle({
      kind,
      modelName,
      analysisRequest,
      analysisViewState,
      exportOptions,
      matrix,
      portfolioTable,
      relatedResult,
      pathsResult,
      formatters: fmt ?? undefined,
      document: typeof document !== 'undefined' ? document : undefined,
    });
  }, [analysisRequest, analysisViewState, exportOptions, fmt, kind, matrix, modelName, pathsResult, portfolioTable, relatedResult]);

  const sandboxSvgText = useMemo(() => {
    return findSandboxSvgText(exportBundle.artifacts);
  }, [exportBundle.artifacts]);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reportCount, setReportCount] = useState(0);

  const availableFormats: ExportFormat[] = useMemo(() => getAvailableFormats(kind), [kind]);
  const [format, setFormat] = useState<ExportFormat>(() => availableFormats[0] ?? 'svg');

  // Keep selected format valid when analysis kind changes.
  useEffect(() => setFormat(availableFormats[0] ?? 'svg'), [availableFormats]);

  useEffect(() => setStatus(null), [format, kind, isOpen]);
  useEffect(() => {
    if (isOpen) setReportCount(loadExportReport().length);
  }, [isOpen]);

  const { canSvg, canPng, canPptx, canXlsx, canTsv, canCsv } = useMemo(
    () =>
      getExportCapabilities({
        kind,
        sandboxSvgText,
        artifacts: exportBundle.artifacts,
      }),
    [exportBundle.artifacts, kind, sandboxSvgText]
  );

  const canCopyImage = useMemo(() => canWriteImageToClipboard(), []);

  async function runAction(label: string, fn: () => Promise<void> | void) {
    setStatus(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setStatus((e as Error).message || `${label} failed.`);
    } finally {
      setBusy(false);
    }
  }

  const copyTableTsv = async () => {
    await runAction('Copy', async () => {
      const tableArtifact = exportBundle.artifacts.find((a) => a.type === 'table');
      if (!tableArtifact || tableArtifact.type !== 'table') {
        const msg = exportBundle.warnings?.[0] ?? 'Copy table is not supported for this view yet.';
        throw new Error(msg);
      }
      const tsv = tabularToTsv(tableArtifact.data);
      await copyTextToClipboard(tsv);
      setStatus(`Copied ${tableArtifact.name} table as TSV.`);
    });
  };

  const downloadCsv = async () => {
    await runAction('Download', async () => {
      const tableArtifact = exportBundle.artifacts.find((a) => a.type === 'table');
      if (!tableArtifact || tableArtifact.type !== 'table') {
        const msg = exportBundle.warnings?.[0] ?? 'CSV export is not supported for this view yet.';
        throw new Error(msg);
      }
      const csv = tabularToCsv(tableArtifact.data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const fileName = sanitizeFileNameWithExtension(exportBundle.title || 'export', 'csv');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded CSV.');
    });
  };

  const copySvg = async () => {
    await runAction('Copy', async () => {
      if (!sandboxSvgText) {
        const msg = exportBundle.warnings?.[0] ?? 'Copy SVG is not supported for this view yet.';
        throw new Error(msg);
      }
      await copyTextToClipboard(sandboxSvgText);
      setStatus('Copied SVG markup to clipboard.');
    });
  };

  const downloadSvg = async () => {
    await runAction('Download', async () => {
      if (!sandboxSvgText) {
        const msg = exportBundle.warnings?.[0] ?? 'Download SVG is not supported for this view yet.';
        throw new Error(msg);
      }
      const blob = new Blob([sandboxSvgText], { type: 'image/svg+xml;charset=utf-8' });
      const fileName = sanitizeFileNameWithExtension(exportBundle.title || 'export', 'svg');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded SVG.');
    });
  };

  const copyPng = async () => {
    await runAction('Copy', async () => {
      if (!canWriteImageToClipboard()) {
        throw new Error('Copy image is not supported in this browser.');
      }
      if (!sandboxSvgText) {
        const msg = exportBundle.warnings?.[0] ?? 'Copy PNG is not supported for this view yet.';
        throw new Error(msg);
      }

      // Use a white background so arrows/lines are visible when pasted into Office/Docs.
      await copyPngFromSvgText(sandboxSvgText, { scale: 2, background: '#ffffff' });
      setStatus('Copied image as PNG.');
    });
  };

  const downloadPng = async () => {
    await runAction('Download', async () => {
      if (!sandboxSvgText) {
        const msg = exportBundle.warnings?.[0] ?? 'Download PNG is not supported for this view yet.';
        throw new Error(msg);
      }
      await downloadPngFromSvgText(exportBundle.title, sandboxSvgText, { scale: 2, background: '#ffffff' });
      setStatus('Downloaded PNG.');
    });
  };

  const downloadPptx = async () => {
    await runAction('Download', async () => {
      const blob = await generatePptxBlobV1(exportBundle, exportOptions.pptx);
      const fileName = sanitizeFileNameWithExtension(exportBundle.title || 'export', 'pptx');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded PPTX.');
    });
  };

  const downloadXlsx = async () => {
    await runAction('Download', async () => {
      const blob = await generateXlsxBlobV1(exportBundle, exportOptions.xlsx);
      const fileName = sanitizeFileNameWithExtension(exportBundle.title || 'export', 'xlsx');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded XLSX.');
    });
  };

  const addToReport = () => {
    try {
      addToExportReport({
        kind,
        title: exportBundle.title || 'export',
        modelName,
        exportOptions,
        analysisRequest,
        analysisViewState,
        bundle: exportBundle,
      });
      const items = loadExportReport();
      setReportCount(items.length);
      setStatus(`Added to report (${items.length} item${items.length === 1 ? '' : 's'}).`);
    } catch (e) {
      setStatus((e as Error).message || 'Failed to add to report.');
    }
  };

  const downloadReportJson = () => {
    try {
      const items = loadExportReport();
      const blob = exportReportAsJsonBlob(items);
      const fileName = sanitizeFileNameWithExtension('export-report', 'json');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded report.json.');
    } catch (e) {
      setStatus((e as Error).message || 'Failed to download report.');
    }
  };

  const clearReport = () => {
    clearExportReport();
    setReportCount(0);
    setStatus('Cleared report.');
  };

  return {
    exportOptions,
    exportBundle,
    sandboxSvgText,
    availableFormats,
    format,
    setFormat,
    busy,
    status,
    reportCount,
    canSvg,
    canPng,
    canPptx,
    canXlsx,
    canTsv,
    canCsv,
    canCopyImage,
    actions: {
      copyTableTsv,
      downloadCsv,
      copySvg,
      downloadSvg,
      copyPng,
      downloadPng,
      downloadPptx,
      downloadXlsx,
      addToReport,
      downloadReportJson,
      clearReport,
    },
  };
}

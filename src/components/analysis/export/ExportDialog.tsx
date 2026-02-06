import { useEffect, useMemo, useState } from 'react';

import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewState, AnalysisViewKind } from '../contracts/analysisViewState';
import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';
import type { Model, ModelKind, PathsBetweenResult, RelatedElementsResult } from '../../../domain';

import { getAnalysisAdapter } from '../../../analysis/adapters/registry';
import { createAnalysisResultFormatters } from '../results/analysisResultFormatters';

import { Dialog } from '../../dialog/Dialog';
import {
  deriveDefaultExportOptions,
  copyTextToClipboard,
  tabularToTsv,
  tabularToCsv,
  canWriteImageToClipboard,
  copyPngFromSvgText,
  buildExportBundle,
  generatePptxBlobV1,
  generateXlsxBlobV1,
  downloadPngFromSvgText,
  addToExportReport,
  loadExportReport,
  exportReportAsJsonBlob,
  clearExportReport,
} from '../../../export';

import { downloadBlobFile, sanitizeFileNameWithExtension } from '../../../store/download';

type Props = {
  isOpen: boolean;
  onClose: () => void;

  kind: AnalysisViewKind;
  analysisRequest: AnalysisRequest;
  analysisViewState: AnalysisViewState;

  // Optional computed data for fast-win exports
  modelName: string;
  matrix?: { result: RelationshipMatrixResult | null; cellValues?: number[][] };

  // Optional context for building tables for related/paths/portfolio
  model?: Model | null;
  modelKind?: ModelKind | null;
  relatedResult?: RelatedElementsResult | null;
  pathsResult?: PathsBetweenResult | null;
  portfolioTable?: import('../../../export').TabularData | null;
};

type ExportFormat = 'svg' | 'png' | 'pptx' | 'xlsx' | 'tsv' | 'csv';

export function ExportDialog({
  isOpen,
  onClose,
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
}: Props) {
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
    const imageArtifact = exportBundle.artifacts.find((a) => a.type === 'image');
    if (!imageArtifact || imageArtifact.type !== 'image') return null;
    if (imageArtifact.data.kind !== 'svg') return null;
    return imageArtifact.data.data;
  }, [exportBundle.artifacts]);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reportCount, setReportCount] = useState(0);

  const availableFormats: ExportFormat[] = useMemo(() => {
    if (kind === 'sandbox') return ['svg', 'png', 'pptx', 'xlsx'];
    if (kind === 'matrix') return ['xlsx', 'tsv'];
    if (kind === 'portfolio') return ['csv', 'xlsx'];
    if (kind === 'related' || kind === 'paths') return ['svg', 'png', 'csv', 'xlsx'];
    if (kind === 'traceability') return ['svg', 'png'];
    return ['svg'];
  }, [kind]);

  const [format, setFormat] = useState<ExportFormat>(() => availableFormats[0] ?? 'svg');
  useEffect(() => setFormat(availableFormats[0] ?? 'svg'), [availableFormats]);

  useEffect(() => setStatus(null), [format, kind, isOpen]);
  useEffect(() => {
    if (isOpen) setReportCount(loadExportReport().length);
  }, [isOpen]);

  const onCopyTable = async () => {
    setStatus(null);
    setBusy(true);
    try {
      const tableArtifact = exportBundle.artifacts.find((a) => a.type === 'table');
      if (!tableArtifact || tableArtifact.type !== 'table') {
        const msg = exportBundle.warnings?.[0] ?? 'Copy table is not supported for this view yet.';
        throw new Error(msg);
      }

      const tsv = tabularToTsv(tableArtifact.data);
      await copyTextToClipboard(tsv);
      setStatus(`Copied ${tableArtifact.name} table as TSV.`);
    } catch (e) {
      setStatus((e as Error).message || 'Copy failed.');
    } finally {
      setBusy(false);
    }
  };

  const onDownloadCsv = async () => {
    setStatus(null);
    setBusy(true);
    try {
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
    } catch (e) {
      setStatus((e as Error).message || 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  const onCopySvg = async () => {
    setStatus(null);
    setBusy(true);
    try {
      if (!sandboxSvgText) {
        const msg = exportBundle.warnings?.[0] ?? 'Copy SVG is not supported for this view yet.';
        throw new Error(msg);
      }
      await copyTextToClipboard(sandboxSvgText);
      setStatus('Copied SVG markup to clipboard.');
    } catch (e) {
      setStatus((e as Error).message || 'Copy failed.');
    } finally {
      setBusy(false);
    }
  };

  const onDownloadSvg = async () => {
    setStatus(null);
    setBusy(true);
    try {
      if (!sandboxSvgText) {
        const msg = exportBundle.warnings?.[0] ?? 'Download SVG is not supported for this view yet.';
        throw new Error(msg);
      }
      const blob = new Blob([sandboxSvgText], { type: 'image/svg+xml;charset=utf-8' });
      const fileName = sanitizeFileNameWithExtension(exportBundle.title || 'export', 'svg');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded SVG.');
    } catch (e) {
      setStatus((e as Error).message || 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  const onCopyPng = async () => {
    setStatus(null);
    setBusy(true);
    try {
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
    } catch (e) {
      const msg = (e as Error).message || 'Copy failed.';
      setStatus(`${msg} (You can use Download PNG instead.)`);
    } finally {
      setBusy(false);
    }
  };

  const onDownloadPng = async () => {
    setStatus(null);
    setBusy(true);
    try {
      if (!sandboxSvgText) {
        const msg = exportBundle.warnings?.[0] ?? 'Download PNG is not supported for this view yet.';
        throw new Error(msg);
      }
      await downloadPngFromSvgText(exportBundle.title, sandboxSvgText, { scale: 2, background: '#ffffff' });
      setStatus('Downloaded PNG.');
    } catch (e) {
      setStatus((e as Error).message || 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPptx = async () => {
    setStatus(null);
    setBusy(true);
    try {
      const blob = await generatePptxBlobV1(exportBundle, exportOptions.pptx);
      const fileName = sanitizeFileNameWithExtension(exportBundle.title || 'export', 'pptx');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded PPTX.');
    } catch (e) {
      setStatus((e as Error).message || 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadXlsx = async () => {
    setStatus(null);
    setBusy(true);
    try {
      const blob = await generateXlsxBlobV1(exportBundle, exportOptions.xlsx);
      const fileName = sanitizeFileNameWithExtension(exportBundle.title || 'export', 'xlsx');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded XLSX.');
    } catch (e) {
      setStatus((e as Error).message || 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  const onAddToReport = () => {
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

  const onDownloadReportJson = () => {
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

  const onClearReport = () => {
    clearExportReport();
    setReportCount(0);
    setStatus('Cleared report.');
  };

  const canSvg = !!sandboxSvgText;
  const canPng = !!sandboxSvgText;
  const canPptx = kind === 'sandbox';
  const hasTable = exportBundle.artifacts.some((a) => a.type === 'table');
  const canXlsx = kind === 'sandbox' || hasTable;
  const canTsv = (kind === 'matrix' || kind === 'portfolio') && hasTable;
  const canCsv = hasTable;

  const formatLabel = (f: ExportFormat) => {
    switch (f) {
      case 'svg':
        return 'SVG';
      case 'png':
        return 'PNG';
      case 'pptx':
        return 'PPTX';
      case 'xlsx':
        return 'XLSX';
      case 'tsv':
        return 'TSV (table)';
      case 'csv':
        return 'CSV';
    }
  };

  return (
    <Dialog
      title="Export"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div className="crudHint">{status ?? ''}</div>
          <button type="button" className="primaryButton" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="analysisSection">
          <div className="analysisSectionHeader">
            <h3 className="analysisSectionTitle">Format</h3>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="crudLabel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Select
              <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                {availableFormats.map((f) => (
                  <option key={f} value={f}>
                    {formatLabel(f)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="analysisSection">
          <div className="analysisSectionHeader">
            <h3 className="analysisSectionTitle">Actions</h3>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {format === 'svg' ? (
              <>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onCopySvg}
                  disabled={!canSvg || busy}
                  aria-disabled={!canSvg || busy}
                  title={!canSvg ? 'Not supported for this view yet' : 'Copy SVG markup to clipboard'}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onDownloadSvg}
                  disabled={!canSvg || busy}
                  aria-disabled={!canSvg || busy}
                  title={!canSvg ? 'Not supported for this view yet' : 'Download SVG'}
                >
                  Download
                </button>
              </>
            ) : null}

            {format === 'png' ? (
              <>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onCopyPng}
                  disabled={!canPng || busy || !canWriteImageToClipboard()}
                  aria-disabled={!canPng || busy || !canWriteImageToClipboard()}
                  title={
                    !canPng
                      ? 'Not supported for this view yet'
                      : !canWriteImageToClipboard()
                        ? 'Browser does not support copying images to clipboard (use Download)'
                        : 'Copy as PNG'
                  }
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onDownloadPng}
                  disabled={!canPng || busy}
                  aria-disabled={!canPng || busy}
                  title={!canPng ? 'Not supported for this view yet' : 'Download PNG'}
                >
                  Download
                </button>
              </>
            ) : null}

            {format === 'pptx' ? (
              <button
                type="button"
                className="secondaryButton"
                disabled={!canPptx || busy}
                aria-disabled={!canPptx || busy}
                onClick={handleDownloadPptx}
                title={!canPptx ? 'Not supported for this view yet' : 'Download PPTX'}
              >
                Download
              </button>
            ) : null}

            {format === 'xlsx' ? (
              <button
                type="button"
                className="secondaryButton"
                disabled={!canXlsx || busy}
                aria-disabled={!canXlsx || busy}
                onClick={handleDownloadXlsx}
                title={!canXlsx ? 'Not supported for this view yet' : 'Download XLSX'}
              >
                Download
              </button>
            ) : null}

            {format === 'tsv' ? (
              <button
                type="button"
                className="secondaryButton"
                onClick={onCopyTable}
                disabled={!canTsv || busy}
                aria-disabled={!canTsv || busy}
                title={!canTsv ? 'Not supported for this view yet' : 'Copy as TSV'}
              >
                Copy
              </button>
            ) : null}

            {format === 'csv' ? (
              <button
                type="button"
                className="secondaryButton"
                onClick={onDownloadCsv}
                disabled={!canCsv || busy}
                aria-disabled={!canCsv || busy}
                title={!canCsv ? 'Not supported for this view yet' : 'Download CSV'}
              >
                Download
              </button>
            ) : null}
          </div>

          {exportBundle.warnings && exportBundle.warnings.length > 0 ? (
            <div className="crudHint" style={{ marginTop: 10 }}>
              <strong>Notes:</strong> {exportBundle.warnings.join(' • ')}
            </div>
          ) : null}

          <details style={{ marginTop: 8 }}>
            <summary className="miniLinkButton">Debug details</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify({ kind, modelName, analysisRequest, analysisViewState, exportOptions, exportBundle }, null, 2)}
            </pre>
          </details>
        </div>

        <div className="analysisSection">
          <div className="analysisSectionHeader">
            <h3 className="analysisSectionTitle">Report</h3>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="secondaryButton"
              onClick={onAddToReport}
              disabled={exportBundle.artifacts.length === 0 || busy}
              aria-disabled={exportBundle.artifacts.length === 0 || busy}
              title={exportBundle.artifacts.length === 0 ? 'Nothing to add yet' : 'Add this snapshot to a lightweight report store'}
            >
              Add to report
            </button>

            <button
              type="button"
              className="secondaryButton"
              onClick={onDownloadReportJson}
              disabled={reportCount === 0 || busy}
              aria-disabled={reportCount === 0 || busy}
              title={reportCount === 0 ? 'Report is empty' : 'Download report JSON'}
            >
              Download report.json
            </button>

            <button
              type="button"
              className="secondaryButton"
              onClick={onClearReport}
              disabled={reportCount === 0 || busy}
              aria-disabled={reportCount === 0 || busy}
              title={reportCount === 0 ? 'Report is empty' : 'Clear report'}
            >
              Clear report
            </button>

            <div className="crudHint">Items: {reportCount}</div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
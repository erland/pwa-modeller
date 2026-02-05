import { useEffect, useMemo, useState } from 'react';

import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewState, AnalysisViewKind } from '../contracts/analysisViewState';
import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';

import { Dialog } from '../../dialog/Dialog';
import {
  deriveDefaultExportOptions,
  deriveExportViewState,
  copyTextToClipboard,
  tabularToTsv,
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
import { ExportOptionsPanel } from './ExportOptionsPanel';

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
};

type TabId = 'quickCopy' | 'download';

export function ExportDialog({
  isOpen,
  onClose,
  kind,
  analysisRequest,
  analysisViewState,
  modelName,
  matrix,
}: Props) {
  const [tab, setTab] = useState<TabId>('quickCopy');
  const [busy, setBusy] = useState(false);
  const [reportCount, setReportCount] = useState(() => loadExportReport().length);

  const [exportOptions, setExportOptions] = useState(() => deriveDefaultExportOptions(kind));
  useEffect(() => {
    setExportOptions(deriveDefaultExportOptions(kind));
  }, [kind, isOpen]);

  const exportViewState = useMemo(
    () => deriveExportViewState(kind, analysisViewState, exportOptions),
    [analysisViewState, exportOptions, kind]
  );

  const exportBundle = useMemo(
    () =>
      buildExportBundle({
        kind,
        modelName,
        analysisRequest,
        analysisViewState,
        exportOptions,
        matrix,
        document,
      }),
    [analysisRequest, analysisViewState, exportOptions, kind, matrix, modelName]
  );

  async function handleDownloadPptx(): Promise<void> {
    setStatus(null);
    setBusy(true);
    try {
      const blob = await generatePptxBlobV1(exportBundle, exportOptions.pptx);
      const fileName = sanitizeFileNameWithExtension(exportBundle.title, 'pptx');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded PPTX.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate PPTX.';
      setStatus(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadXlsx(): Promise<void> {
    setStatus(null);
    setBusy(true);
    try {
      const blob = await generateXlsxBlobV1(exportBundle, exportOptions.xlsx);
      const fileName = sanitizeFileNameWithExtension(exportBundle.title, 'xlsx');
      downloadBlobFile(fileName, blob);
      setStatus('Downloaded XLSX.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate XLSX.';
      setStatus(msg);
    } finally {
      setBusy(false);
    }
  }


  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setStatus(null), [tab, kind, isOpen]);
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

  const onCopyImage = async () => {
    setStatus(null);
    setBusy(true);
    try {
      if (!canWriteImageToClipboard()) {
        throw new Error('Copy image is not supported in this browser.');
      }

      const imageArtifact = exportBundle.artifacts.find((a) => a.type === 'image');
      if (!imageArtifact || imageArtifact.type !== 'image') {
        const msg = exportBundle.warnings?.[0] ?? 'Copy image is not supported for this view yet.';
        throw new Error(msg);
      }

      if (imageArtifact.data.kind !== 'svg') {
        throw new Error('Only SVG sources are supported for PNG copy in v1.');
      }

      // Use a white background so arrows/lines are visible when pasted into Office/Docs.
      await copyPngFromSvgText(imageArtifact.data.data, { scale: 2, background: '#ffffff' });
      setStatus(`Copied ${imageArtifact.name} as PNG.`);
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
    const imageArtifact = exportBundle.artifacts.find((a) => a.type === 'image');
    if (!imageArtifact || imageArtifact.type !== 'image') {
      const msg = exportBundle.warnings?.[0] ?? 'Download PNG is not supported for this view yet.';
      throw new Error(msg);
    }
    if (imageArtifact.data.kind !== 'svg') {
      throw new Error('Only SVG sources are supported for PNG download in v1.');
    }
    await downloadPngFromSvgText(exportBundle.title, imageArtifact.data.data, { scale: 2, background: '#ffffff' });
    setStatus('Downloaded PNG.');
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
      title: exportBundle.title,
      modelName,
      exportOptions,
      analysisRequest,
      analysisViewState,
      bundle: exportBundle,
    });
    const nextCount = loadExportReport().length;
    setReportCount(nextCount);
    setStatus(`Added to report (${nextCount} items).`);
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
        <div className="workspaceTabs" role="tablist" aria-label="Export tabs">
          <button
            type="button"
            className={`tabButton ${tab === 'quickCopy' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={tab === 'quickCopy'}
            onClick={() => setTab('quickCopy')}
          >
            Quick copy
          </button>
          <button
            type="button"
            className={`tabButton ${tab === 'download' ? 'isActive' : ''}`}
            role="tab"
            aria-selected={tab === 'download'}
            onClick={() => setTab('download')}
          >
            Download
          </button>
        </div>

        {tab === 'quickCopy' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="analysisSection">
              <div className="analysisSectionHeader">
                <h3 className="analysisSectionTitle">Copy to clipboard</h3>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onCopyTable}
                  disabled={!exportViewState.canCopyTable || busy}
                  aria-disabled={!exportViewState.canCopyTable || busy}
                  title={!exportViewState.canCopyTable ? 'Not supported for this view yet' : 'Copy as TSV'}
                >
                  Copy table (TSV)
                </button>

<button
  type="button"
  className="secondaryButton"
  onClick={onCopyImage}
  disabled={!exportViewState.canCopyImage || busy || !canWriteImageToClipboard()}
  aria-disabled={!exportViewState.canCopyImage || busy || !canWriteImageToClipboard()}
  title={
    !exportViewState.canCopyImage
      ? 'Not supported for this view yet'
      : !canWriteImageToClipboard()
        ? 'Browser does not support copying images to clipboard (use Download PNG)'
        : 'Copy as PNG'
  }
>
  Copy image (PNG)
</button>

                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onDownloadPng}
                  disabled={!exportViewState.canDownloadPng || busy}
                  aria-disabled={!exportViewState.canDownloadPng || busy}
                  title={!exportViewState.canDownloadPng ? 'Not supported for this view yet' : 'Download a PNG image'}
                >
                  Download PNG
                </button>

              </div>

</div>

{exportBundle.warnings && exportBundle.warnings.length > 0 ? (
  <div className="crudHint" style={{ marginTop: 10 }}>
    <strong>Notes:</strong> {exportBundle.warnings.join(' • ')}
  </div>
) : null}

<details>

              <summary className="miniLinkButton">Debug details</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>
{JSON.stringify({ kind, modelName, analysisRequest, analysisViewState, exportOptions, exportViewState, exportBundle }, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="analysisSection">
              <div className="analysisSectionHeader">
                <h3 className="analysisSectionTitle">Options</h3>
              </div>
              <ExportOptionsPanel value={exportOptions} onChange={setExportOptions} />
              <div className="crudHint" style={{ marginTop: 10 }}>
                Download actions are implemented for PPTX (Sandbox) and XLSX (Matrix/Portfolio) in v1.
              </div>
            </div>

            <div className="analysisSection">
              <div className="analysisSectionHeader">
                <h3 className="analysisSectionTitle">Download</h3>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!exportViewState.canDownloadPptx || busy}
                  aria-disabled={!exportViewState.canDownloadPptx || busy}
                  onClick={handleDownloadPptx}
                  title={!exportViewState.canDownloadPptx ? 'Not supported for this view yet' : 'Download PPTX'}
                >
                  Download PPTX
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!exportViewState.canDownloadXlsx || busy}
                  aria-disabled={!exportViewState.canDownloadXlsx || busy}
                  onClick={handleDownloadXlsx}
                  title={!exportViewState.canDownloadXlsx ? 'Not supported for this view yet' : 'Download XLSX'}
                >
                  Download XLSX
                </button>
                <button type="button" className="secondaryButton" disabled aria-disabled title="Future">
                  Download CSV
                </button>
                <button type="button" className="secondaryButton" disabled aria-disabled title="Future">
                  Download JSON
                </button>
              </div>

</div>

{exportBundle.warnings && exportBundle.warnings.length > 0 ? (
  <div className="crudHint" style={{ marginTop: 10 }}>
    <strong>Notes:</strong> {exportBundle.warnings.join(' • ')}
  </div>
) : null}



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

    <span className="crudHint">Items: {reportCount}</span>
  </div>
</div>

<details>

              <summary className="miniLinkButton">Debug details</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>
{JSON.stringify({ kind, modelName, analysisRequest, analysisViewState, exportOptions, exportViewState, exportBundle }, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </Dialog>
  );
}

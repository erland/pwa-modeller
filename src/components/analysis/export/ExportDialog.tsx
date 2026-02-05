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

  const onCopyTable = async () => {
    setStatus(null);
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
    }
  };

  const onCopyImage = async () => {
    setStatus(null);
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
      setStatus((e as Error).message || 'Copy failed.');
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
                  disabled={!exportViewState.canCopyTable}
                  aria-disabled={!exportViewState.canCopyTable}
                  title={!exportViewState.canCopyTable ? 'Not supported for this view yet' : 'Copy as TSV'}
                >
                  Copy table (TSV)
                </button>

                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onCopyImage}
                  disabled={!exportViewState.canCopyImage}
                  aria-disabled={!exportViewState.canCopyImage}
                  title={!exportViewState.canCopyImage ? 'Not supported for this view yet' : 'Copy as PNG'}
                >
                  Copy image (PNG)
                </button>
              </div>
            </div>

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
                >
                  Download PPTX
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!exportViewState.canDownloadXlsx || busy}
                  aria-disabled={!exportViewState.canDownloadXlsx || busy}
                  onClick={handleDownloadXlsx}
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

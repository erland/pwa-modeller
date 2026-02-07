import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewState, AnalysisViewKind } from '../contracts/analysisViewState';

import { Dialog } from '../../dialog/Dialog';
import { formatLabel, type ExportFormat } from './exportDialogUtils';

export type ExportDialogActionButton = {
  key: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
  title?: string;
};

export type ExportDialogViewProps = {
  isOpen: boolean;
  onClose: () => void;

  // Debug details
  kind: AnalysisViewKind;
  modelName: string;
  analysisRequest: AnalysisRequest;
  analysisViewState: AnalysisViewState;
  exportOptions: unknown;
  exportBundle: unknown;

  // Format selection
  availableFormats: ExportFormat[];
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;

  // Actions
  actionButtons: ExportDialogActionButton[];
  status: string | null;
  busy: boolean;

  // Report actions
  reportCount: number;
  reportCanAdd: boolean;
  onAddToReport: () => void;
  onDownloadReportJson: () => void;
  onClearReport: () => void;
};

export function ExportDialogView({
  isOpen,
  onClose,
  kind,
  modelName,
  analysisRequest,
  analysisViewState,
  exportOptions,
  exportBundle,
  availableFormats,
  format,
  onFormatChange,
  actionButtons,
  status,
  busy,
  reportCount,
  reportCanAdd,
  onAddToReport,
  onDownloadReportJson,
  onClearReport,
}: ExportDialogViewProps) {
  // exportBundle is intentionally typed as unknown to keep this view presentational.
  const bundle = exportBundle as {
    warnings?: string[];
    artifacts?: unknown[];
  };

  const warnings = Array.isArray(bundle?.warnings) ? bundle.warnings : [];
  const artifacts = Array.isArray(bundle?.artifacts) ? bundle.artifacts : [];

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
              <select value={format} onChange={(e) => onFormatChange(e.target.value as ExportFormat)}>
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
            {actionButtons.map((btn) => (
              <button
                key={btn.key}
                type="button"
                className="secondaryButton"
                onClick={btn.onClick}
                disabled={btn.disabled}
                aria-disabled={btn.disabled}
                title={btn.title}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {warnings.length > 0 ? (
            <div className="crudHint" style={{ marginTop: 10 }}>
              <strong>Notes:</strong> {warnings.join(' • ')}
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
              disabled={!reportCanAdd || busy}
              aria-disabled={!reportCanAdd || busy}
              title={!reportCanAdd ? 'Nothing to add yet' : 'Add this snapshot to a lightweight report store'}
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
          {/* Keep this around as a safeguard for accidental empty export bundles */}
          {artifacts.length === 0 ? null : null}
        </div>
      </div>
    </Dialog>
  );
}

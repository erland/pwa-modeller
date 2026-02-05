import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewState } from '../contracts/analysisViewState';

import { deriveDefaultExportOptions } from '../../../export/defaultExportOptions';
import { deriveExportViewState } from '../../../export/deriveExportViewState';
import type { ExportOptions } from '../../../export/contracts/ExportOptions';

import { Dialog } from '../../dialog/Dialog';
import { ExportOptionsPanel } from './ExportOptionsPanel';

type ExportTab = 'quick' | 'download';

function TabButton({
  isActive,
  children,
  onClick,
  autoFocus,
}: {
  isActive: boolean;
  children: ReactNode;
  onClick: () => void;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className="miniButton"
      onClick={onClick}
      data-autofocus={autoFocus ? 'true' : undefined}
      style={{
        background: isActive ? 'var(--surface-2)' : undefined,
        borderColor: isActive ? 'var(--border-2)' : undefined,
        fontWeight: isActive ? 800 : 650,
      }}
    >
      {children}
    </button>
  );
}

export function ExportDialog({
  isOpen,
  kind,
  request,
  viewState,
  onClose,
}: {
  isOpen: boolean;
  kind: AnalysisRequest['kind'];
  request: AnalysisRequest;
  viewState: AnalysisViewState;
  onClose: () => void;
}) {
  // Step 3: dialog skeleton with tabs (Quick copy + Download).
  // No actual copy/download logic yet — those are implemented in later steps.

  const [tab, setTab] = useState<ExportTab>('quick');

  const [exportOptions, setExportOptions] = useState<ExportOptions>(() => deriveDefaultExportOptions(kind, viewState));

  useEffect(() => {
    // If the mode changes (or view state changes significantly), reset to stable defaults.
    setExportOptions(deriveDefaultExportOptions(kind, viewState));
  }, [kind, viewState]);

  const exportViewState = useMemo(() => {
    return deriveExportViewState(kind, viewState, exportOptions);
  }, [kind, viewState, exportOptions]);

  const debugSummary = useMemo(() => {
    // Keep this compact; it helps validate we pass the right data without overwhelming the UI.
    return {
      kind,
      request,
      viewState,
      exportOptions,
      exportViewState,
    };
  }, [kind, request, viewState, exportOptions, exportViewState]);

  return (
    <Dialog
      title="Export"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="miniButton" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <TabButton isActive={tab === 'quick'} onClick={() => setTab('quick')} autoFocus>
              Quick copy
            </TabButton>
            <TabButton isActive={tab === 'download'} onClick={() => setTab('download')}>
              Download
            </TabButton>

            <span style={{ fontSize: 12, opacity: 0.78, marginLeft: 8 }}>
              Mode: <strong>{kind}</strong>
            </span>
          </div>

          <div className="crudHint" style={{ margin: 0 }}>
            Quick copy focuses on clipboard (table/image). Download creates files (PPTX/XLSX/CSV). This is a skeleton in
            Step 3; actions will be enabled in later steps.
          </div>
        </div>

        {tab === 'quick' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="crudSection" style={{ marginTop: 0 }}>
              <div className="crudHeader">
                <h3 className="crudTitle">Copy as table</h3>
              </div>
              <p className="crudHint">
                Copy the current view’s data as TSV so it can be pasted into Excel/Sheets/Notion. (Implemented in Step 5.)
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="miniButton" disabled>
                  Copy table (TSV)
                </button>
              </div>
            </div>

            <div className="crudSection" style={{ marginTop: 0 }}>
              <div className="crudHeader">
                <h3 className="crudTitle">Copy as image</h3>
              </div>
              <p className="crudHint">
                Copy a PNG snapshot of the current diagram/visual so it can be pasted into documents and slides.
                (Implemented in Step 6.)
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="miniButton" disabled>
                  Copy image (PNG)
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="crudSection" style={{ marginTop: 0 }}>
              <div className="crudHeader">
                <h3 className="crudTitle">Options</h3>
              </div>
              <p className="crudHint">
                Configure what a future export should include. The actual generation is implemented in later steps.
              </p>
              <ExportOptionsPanel options={exportOptions} onChange={setExportOptions} />
              <div className="crudHint" style={{ margin: '8px 0 0 0' }}>
                Derived: PPTX layout <strong>{exportViewState.pptx.layout}</strong>, theme{' '}
                <strong>{exportViewState.pptx.theme}</strong>, font scale <strong>{exportViewState.pptx.fontScale}</strong>.
              </div>
            </div>

            <div className="crudSection" style={{ marginTop: 0 }}>
              <div className="crudHeader">
                <h3 className="crudTitle">PowerPoint</h3>
              </div>
              <p className="crudHint">Generate a PPTX containing slides for the selected views. (Implemented in Step 8.)</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="miniButton" disabled>
                  Download PPTX
                </button>
              </div>
            </div>

            <div className="crudSection" style={{ marginTop: 0 }}>
              <div className="crudHeader">
                <h3 className="crudTitle">Excel</h3>
              </div>
              <p className="crudHint">Generate an XLSX workbook with data-first sheets. (Implemented in Step 9.)</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="miniButton" disabled>
                  Download XLSX
                </button>
              </div>
            </div>

            <div className="crudSection" style={{ marginTop: 0 }}>
              <div className="crudHeader">
                <h3 className="crudTitle">Other formats</h3>
              </div>
              <p className="crudHint">
                Mode-specific bundles may provide extra downloads (CSV, JSON, images). (Enabled as bundles are added in
                Step 7+.)
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="miniButton" disabled>
                  Download CSV
                </button>
                <button type="button" className="miniButton" disabled>
                  Download JSON
                </button>
              </div>
            </div>
          </div>
        )}

        <details className="crudHint" style={{ marginTop: 2 }}>
          <summary style={{ cursor: 'pointer' }}>Debug details</summary>
          <div style={{ marginTop: 6 }}>
            <code style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{JSON.stringify(debugSummary, null, 2)}</code>
          </div>
        </details>
      </div>
    </Dialog>
  );
}

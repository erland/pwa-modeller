import { useEffect, useMemo, useState } from 'react';

import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewState, AnalysisViewKind } from '../contracts/analysisViewState';
import type { RelationshipMatrixResult } from '../../../domain/analysis/relationshipMatrix';

import { Dialog } from '../../dialog/Dialog';
import { deriveDefaultExportOptions, deriveExportViewState, copyTextToClipboard, tabularToTsv } from '../../../export';
import { buildMatrixTabular } from '../../../export/builders/matrixToTabular';
import { ExportOptionsPanel } from './ExportOptionsPanel';

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

function extractHtmlTableAsTabular(table: HTMLTableElement) {
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
  const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td,th')).map((td) => (td.textContent ?? '').trim())
  );
  return { headers, rows };
}

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

  const [exportOptions, setExportOptions] = useState(() => deriveDefaultExportOptions(kind));
  useEffect(() => {
    setExportOptions(deriveDefaultExportOptions(kind));
  }, [kind, isOpen]);

  const exportViewState = useMemo(
    () => deriveExportViewState(kind, analysisViewState, exportOptions),
    [analysisViewState, exportOptions, kind]
  );

  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setStatus(null), [tab, kind, isOpen]);

  const onCopyTable = async () => {
    setStatus(null);
    try {
      if (kind === 'matrix') {
        const r = matrix?.result;
        if (!r) throw new Error('Matrix results are not available yet.');
        const tabular = buildMatrixTabular(r, matrix?.cellValues);
        const tsv = tabularToTsv(tabular);
        await copyTextToClipboard(tsv);
        setStatus('Copied matrix table as TSV.');
        return;
      }

      if (kind === 'portfolio') {
        const table = document.querySelector('table[aria-label="Portfolio population table"]') as HTMLTableElement | null;
        if (!table) throw new Error('Could not find the Portfolio table in the page.');
        const tabular = extractHtmlTableAsTabular(table);
        const tsv = tabularToTsv({ headers: tabular.headers, rows: tabular.rows });
        await copyTextToClipboard(tsv);
        setStatus('Copied portfolio table as TSV.');
        return;
      }

      throw new Error('Copy table is not supported for this view yet.');
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

                <button type="button" className="secondaryButton" disabled aria-disabled title="Step 6">
                  Copy image (PNG)
                </button>
              </div>
            </div>

            <details>
              <summary className="miniLinkButton">Debug details</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>
{JSON.stringify({ kind, modelName, analysisRequest, analysisViewState, exportOptions, exportViewState }, null, 2)}
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
                Download actions will be implemented in Steps 8–9.
              </div>
            </div>

            <div className="analysisSection">
              <div className="analysisSectionHeader">
                <h3 className="analysisSectionTitle">Download</h3>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="secondaryButton" disabled aria-disabled title="Step 8">
                  Download PPTX
                </button>
                <button type="button" className="secondaryButton" disabled aria-disabled title="Step 9">
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
{JSON.stringify({ kind, modelName, analysisRequest, analysisViewState, exportOptions, exportViewState }, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </Dialog>
  );
}

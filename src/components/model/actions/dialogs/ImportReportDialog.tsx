import { Dialog } from '../../../dialog/Dialog';
import { formatUnknownCounts, hasImportWarnings } from '../../../../import';
import type { LastImportInfo } from '../useModelActionHandlers';

type ImportReportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  lastImport: LastImportInfo | null;
  onDownloadReport: () => void;
};

export function ImportReportDialog({ isOpen, onClose, lastImport, onDownloadReport }: ImportReportDialogProps) {
  return (
    <Dialog
      title="Import report"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="shellButton" onClick={onClose}>
            Close
          </button>
          <button type="button" className="shellButton" onClick={onDownloadReport} disabled={!lastImport}>
            Download report
          </button>
        </>
      }
    >
      {lastImport ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div>
              <b>File</b>: {lastImport.fileName}
            </div>
            <div>
              <b>Format</b>: {lastImport.format}
            </div>
            <div>
              <b>Importer</b>: {lastImport.importerId}
            </div>
            <div>
              <b>Source</b>: {lastImport.report.source}
            </div>
            <div>
              <b>Counts</b>: folders={lastImport.counts.folders}, elements={lastImport.counts.elements}, relationships={lastImport.counts.relationships},
              views={lastImport.counts.views}
            </div>
          </div>

          <div>
            <b>Status</b>: {hasImportWarnings(lastImport.report) ? 'Warnings' : 'OK'}
          </div>

          {lastImport.report.warnings.length ? (
            <div>
              <b>Warnings</b>
              <ul>
                {lastImport.report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {formatUnknownCounts(lastImport.report.unknownElementTypes).length ? (
            <div>
              <b>Unknown element types</b>
              <ul>
                {formatUnknownCounts(lastImport.report.unknownElementTypes).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {formatUnknownCounts(lastImport.report.unknownRelationshipTypes).length ? (
            <div>
              <b>Unknown relationship types</b>
              <ul>
                {formatUnknownCounts(lastImport.report.unknownRelationshipTypes).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!hasImportWarnings(lastImport.report) ? <div>No warnings.</div> : null}
        </div>
      ) : (
        <div>No report available.</div>
      )}
    </Dialog>
  );
}

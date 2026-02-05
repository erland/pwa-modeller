import type { AnalysisRequest } from '../../../domain/analysis';
import type { AnalysisViewState } from '../contracts/analysisViewState';

import { Dialog } from '../../dialog/Dialog';

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
  // Step 2: entry point only. The full dialog UI is implemented in Step 3.
  // We keep the props stable so later steps can wire real copy/download actions.

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
      <div style={{ display: 'grid', gap: 10 }}>
        <p style={{ margin: 0 }}>
          Export UI will be added in the next step. This placeholder confirms the export entry point is wired.
        </p>

        <div className="crudHint" style={{ marginTop: 4 }}>
          <div>
            <strong>Mode:</strong> {kind}
          </div>
          <div>
            <strong>Request:</strong> <code>{JSON.stringify(request)}</code>
          </div>
          <div>
            <strong>View state:</strong> <code>{JSON.stringify(viewState)}</code>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

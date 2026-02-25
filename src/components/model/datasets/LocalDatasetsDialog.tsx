import { Dialog } from '../../dialog/Dialog';
import type { DatasetId } from '../../../store';
import { LocalDatasetRow } from './LocalDatasetRow';
import { useLocalDatasetsDialogModel } from './useLocalDatasetsDialogModel';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function LocalDatasetsDialog({ isOpen, onClose }: Props) {
  const m = useLocalDatasetsDialogModel({ isOpen, onClose });

  return (
    <Dialog
      title="Local datasets"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {m.loading ? 'Loading…' : `${m.rows.length} dataset${m.rows.length === 1 ? '' : 's'}`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="shellButton" onClick={() => void m.refresh()} disabled={m.loading}>
              Refresh
            </button>
            <button type="button" className="shellButton" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="crudHint" style={{ marginTop: 0 }}>
          Local datasets are stored in your browser (IndexedDB). Importing XMI replaces the model in the currently open dataset.
        </div>

        {m.error ? (
          <div className="crudHint" style={{ marginTop: 0, borderLeftColor: 'var(--danger, #c33)' }}>
            {m.error}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {m.rows.map((r) => {
            const mode = m.getMode(r.datasetId as DatasetId);
            return (
              <LocalDatasetRow
                key={r.datasetId}
                row={r}
                activeDatasetId={m.activeDatasetId}
                mode={mode}
                busyId={m.busyId}
                onOpen={(id) => void m.doOpen(id)}
                onStartRename={(id, currentName) => m.setMode(id, { kind: 'rename', draft: currentName })}
                onRenameDraftChange={(id, draft) => m.setMode(id, { kind: 'rename', draft })}
                onRenameSave={(id, name) => void m.doRename(id, name)}
                onRenameCancel={(id) => m.clearMode(id)}
                onDelete={(id) => void m.doDelete(id)}
              />
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

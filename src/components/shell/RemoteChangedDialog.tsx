import { Dialog } from '../dialog/Dialog';
import type { RemoteHeadChanged } from '../../store/modelStoreTypes';

type Props = {
  isOpen: boolean;
  change: RemoteHeadChanged | null;
  onReloadFromServer: () => void;
  onKeepLocalChanges: () => void;
};

export function RemoteChangedDialog({ isOpen, change, onReloadFromServer, onKeepLocalChanges }: Props) {
  return (
    <Dialog
      title="Remote dataset changed"
      isOpen={isOpen}
      onClose={onKeepLocalChanges}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="shellButton" onClick={onKeepLocalChanges}>
            Keep local changes
          </button>
          <button type="button" className="shellButton isPrimary" onClick={onReloadFromServer}>
            Reload from server
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          Another user updated this remote dataset while you have unsaved changes.
        </div>
        {change?.serverUpdatedBy || change?.serverUpdatedAt ? (
          <div style={{ opacity: 0.9 }}>
            {change?.serverUpdatedBy ? <div>Updated by: <b>{change.serverUpdatedBy}</b></div> : null}
            {change?.serverUpdatedAt ? <div>Updated at: <b>{change.serverUpdatedAt}</b></div> : null}
            {typeof change?.serverRevision === 'number' ? <div>Revision: <b>{change.serverRevision}</b></div> : null}
          </div>
        ) : null}
        <div style={{ opacity: 0.9 }}>
          Reloading will discard your local unsaved changes.
        </div>
      </div>
    </Dialog>
  );
}

import { Dialog } from '../dialog/Dialog';
import type { RemotePersistenceConflict } from '../../store/modelStoreTypes';

type Props = {
  isOpen: boolean;
  conflict: RemotePersistenceConflict | null;
  onReloadFromServer: () => void;
  onExportLocalSnapshot: () => void;
  onKeepLocalChanges: () => void;
};

export function RemoteDatasetConflictDialog({
  isOpen,
  conflict,
  onReloadFromServer,
  onExportLocalSnapshot,
  onKeepLocalChanges
}: Props) {
  return (
    <Dialog
      title="Remote dataset conflict"
      isOpen={isOpen}
      onClose={onKeepLocalChanges}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="shellButton" onClick={onExportLocalSnapshot}>
            Export local snapshot
          </button>
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
        <div className="crudHint" style={{ marginTop: 0, borderLeftColor: 'var(--danger, #c33)' }}>
          {conflict?.message ?? 'The remote dataset has changed on the server and cannot be saved automatically.'}
        </div>

        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.4 }}>
          <div>
            <b>Reload from server</b> will discard your local unsaved changes and load the latest remote snapshot.
          </div>
          <div>
            <b>Export local snapshot</b> downloads your current model JSON so you can merge changes manually.
          </div>
          <div>
            <b>Keep local changes</b> dismisses this dialog and keeps auto-save paused for this session.
          </div>
        </div>

        {conflict?.serverEtag ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Server revision token (ETag): <code>{conflict.serverEtag}</code>
          </div>
        ) : null}

        {conflict?.serverSavedAt || conflict?.serverSavedBy ? (
          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
            <div>
              <b>Server last saved</b>
            </div>
            {conflict.serverSavedAt ? (
              <div>
                At: <code>{conflict.serverSavedAt}</code>
              </div>
            ) : null}
            {conflict.serverSavedBy ? (
              <div>
                By: <code>{conflict.serverSavedBy}</code>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

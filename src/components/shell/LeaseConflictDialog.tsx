import { Dialog } from '../dialog/Dialog';
import type { RemoteLeaseConflict } from '../../store/modelStoreTypes';

type Props = {
  isOpen: boolean;
  conflict: RemoteLeaseConflict | null;
  onOpenReadOnly: () => void;
  onRetry: () => void;
  onForceSave?: () => void;
};

export function LeaseConflictDialog({ isOpen, conflict, onOpenReadOnly, onRetry, onForceSave }: Props) {
  const showForce = Boolean(conflict?.myRole === 'OWNER' && onForceSave);

  return (
    <Dialog
      title="Remote dataset locked"
      isOpen={isOpen}
      onClose={onOpenReadOnly}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="shellButton" onClick={onOpenReadOnly}>
            Open read-only
          </button>
          <button type="button" className="shellButton" onClick={onRetry}>
            Retry
          </button>
          {showForce ? (
            <button type="button" className="shellButton isPrimary" onClick={onForceSave}>
              Force save
            </button>
          ) : null}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="crudHint" style={{ marginTop: 0, borderLeftColor: 'var(--danger, #c33)' }}>
          {conflict?.message ?? 'This remote dataset is currently locked by another user.'}
        </div>

        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.4 }}>
          <div>
            <b>Open read-only</b> keeps the dataset open but pauses auto-save for this session.
          </div>
          <div>
            <b>Retry</b> attempts to acquire the lease again.
          </div>
          {showForce ? (
            <div>
              <b>Force save</b> attempts to override the lock (owner-only).
            </div>
          ) : null}
        </div>

        {conflict?.holderSub || conflict?.expiresAt ? (
          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
            <div>
              <b>Lease holder</b>
            </div>
            {conflict.holderSub ? (
              <div>
                User: <code>{conflict.holderSub}</code>
              </div>
            ) : null}
            {conflict.expiresAt ? (
              <div>
                Expires: <code>{conflict.expiresAt}</code>
              </div>
            ) : null}
          </div>
        ) : null}

        {conflict?.serverEtag ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Server revision token (ETag): <code>{conflict.serverEtag}</code>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

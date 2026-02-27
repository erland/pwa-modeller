import { Dialog } from '../dialog/Dialog';
import type { RemotePersistenceValidationFailure } from '../../store/modelStoreTypes';

type Props = {
  isOpen: boolean;
  failure: RemotePersistenceValidationFailure | null;
  onExportLocalSnapshot: () => void;
  onKeepPaused: () => void;
  onResumeAutoSave: () => void;
};

export function RemoteDatasetValidationErrorsDialog({
  isOpen,
  failure,
  onExportLocalSnapshot,
  onKeepPaused,
  onResumeAutoSave
}: Props) {
  const errors = failure?.validationErrors ?? [];

  return (
    <Dialog
      title="Remote validation failed"
      isOpen={isOpen}
      onClose={onKeepPaused}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="shellButton" onClick={onExportLocalSnapshot}>
            Export local snapshot
          </button>
          <button type="button" className="shellButton" onClick={onKeepPaused}>
            Keep auto-save paused
          </button>
          <button type="button" className="shellButton isPrimary" onClick={onResumeAutoSave}>
            Resume auto-save
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="crudHint" style={{ marginTop: 0, borderLeftColor: 'var(--danger, #c33)' }}>
          {failure?.message ?? 'The server rejected your changes because the model is invalid.'}
        </div>

        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.4 }}>
          Fix the model issues and then <b>Resume auto-save</b> to retry saving. You can also export your local snapshot to
          debug or merge manually.
        </div>

        {errors.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Validation errors</div>
            <div
              style={{
                maxHeight: 260,
                overflow: 'auto',
                border: '1px solid var(--panelBorder, rgba(255,255,255,0.12))',
                borderRadius: 10,
                padding: 8,
                background: 'var(--panelBg, rgba(0,0,0,0.12))'
              }}
            >
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {errors.map((e, idx) => (
                  <li key={idx} style={{ fontSize: 12, lineHeight: 1.35 }}>
                    <div>
                      <code>{e.path}</code> — {e.message}
                    </div>
                    {e.rule ? <div style={{ opacity: 0.75 }}>Rule: <code>{e.rule}</code></div> : null}
                    {e.severity ? <div style={{ opacity: 0.75 }}>Severity: <code>{e.severity}</code></div> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.75 }}>No detailed validation errors were returned by the server.</div>
        )}
      </div>
    </Dialog>
  );
}

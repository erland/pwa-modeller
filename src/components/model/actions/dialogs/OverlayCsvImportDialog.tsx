import { Dialog } from '../../../dialog/Dialog';

type OverlayCsvImportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  importing: boolean;
  error: string | null;
  onChooseFile: () => void;
};

export function OverlayCsvImportDialog({
  isOpen,
  onClose,
  importing,
  error,
  onChooseFile
}: OverlayCsvImportDialogProps) {
  return (
    <Dialog
      title="Import overlay (CSV long)"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="shellButton" onClick={onClose} disabled={importing}>
            Close
          </button>
          <button type="button" className="shellButton shellPrimaryAction" onClick={onChooseFile} disabled={importing}>
            Choose CSV…
          </button>
        </div>
      }
    >
      <p className="hintText" style={{ marginTop: 0 }}>
        Choose a CSV file in long format (one row per tag). The overlay will be attached to the currently loaded model using external ids.
      </p>

      {importing ? <p className="hintText">Importing…</p> : null}
      {error ? (
        <div className="crudError" role="alert">
          {error}
        </div>
      ) : null}
    </Dialog>
  );
}

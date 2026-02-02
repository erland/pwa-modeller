import { Dialog } from '../../../dialog/Dialog';

type OverlayImportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  importing: boolean;
  error: string | null;
  onChooseFile: () => void;
};

export function OverlayImportDialog({ isOpen, onClose, importing, error, onChooseFile }: OverlayImportDialogProps) {
  return (
    <Dialog
      title="Import overlay"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="shellButton" onClick={onClose} disabled={importing}>
            Close
          </button>
          <button type="button" className="shellButton shellPrimaryAction" onClick={onChooseFile} disabled={importing}>
            Choose JSON…
          </button>
        </div>
      }
    >
      <p className="hintText" style={{ marginTop: 0 }}>
        Choose an overlay JSON file. The overlay will be attached to the currently loaded model using external ids.
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

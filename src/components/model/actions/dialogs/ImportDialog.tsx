import { Dialog } from '../../../dialog/Dialog';

type ImportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  importing: boolean;
  error: string | null;
  onChooseFile: () => void;
};

export function ImportDialog({ isOpen, onClose, importing, error, onChooseFile }: ImportDialogProps) {
  return (
    <Dialog
      title="Import model"
      isOpen={isOpen}
      onClose={() => {
        if (importing) return;
        onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              if (importing) return;
              onClose();
            }}
            disabled={importing}
          >
            Close
          </button>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              if (importing) return;
              onChooseFile();
            }}
            disabled={importing}
          >
            Choose file…
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="hintText" style={{ margin: 0 }}>
          Import creates a <b>new</b> model in this workspace (no merge).
        </p>
        <p className="hintText" style={{ margin: 0 }}>
          Currently supported: <b>ArchiMate MEFF</b> (.xml).
        </p>
        {error ? (
          <div role="alert" style={{ padding: 10, border: '1px solid #c33', borderRadius: 6 }}>
            {error}
          </div>
        ) : null}
        {importing ? <p style={{ margin: 0 }}>Importing…</p> : null}
      </div>
    </Dialog>
  );
}

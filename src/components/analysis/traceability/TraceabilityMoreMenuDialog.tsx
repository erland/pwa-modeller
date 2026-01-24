import { Dialog } from '../../dialog/Dialog';

type Props = {
  isOpen: boolean;
  onClose: () => void;

  onOpenSessions: () => void;
  onReset: () => void;
};

export function TraceabilityMoreMenuDialog({ isOpen, onClose, onOpenSessions, onReset }: Props) {
  return (
    <Dialog
      title="More actions"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <button type="button" className="shellButton" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          className="shellButton"
          onClick={() => {
            onClose();
            onOpenSessions();
          }}
        >
          Sessions…
        </button>

        <button
          type="button"
          className="shellButton"
          onClick={() => {
            onClose();
            onReset();
          }}
        >
          Reset view
        </button>
      </div>
    </Dialog>
  );
}

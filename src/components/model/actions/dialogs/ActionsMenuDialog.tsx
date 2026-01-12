import { Dialog } from '../../../dialog/Dialog';
import type { ModelAction } from '../actionRegistry';

type ActionsMenuDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  actions: ModelAction[];
};

export function ActionsMenuDialog({ isOpen, onClose, actions }: ActionsMenuDialogProps) {
  return (
    <Dialog title="Model actions" isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className="shellButton"
            onClick={() => {
              onClose();
              a.run();
            }}
            disabled={a.disabled}
            title={a.title}
          >
            {a.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

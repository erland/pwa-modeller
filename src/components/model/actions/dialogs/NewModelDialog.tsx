import { modelStore } from '../../../../store';
import { Dialog } from '../../../dialog/Dialog';

type NewModelDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  description: string;
  setName: (v: string) => void;
  setDescription: (v: string) => void;
};

export function NewModelDialog({
  isOpen,
  onClose,
  name,
  description,
  setName,
  setDescription
}: NewModelDialogProps) {
  return (
    <Dialog
      title="New model"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="shellButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const trimmedName = name.trim();
              if (!trimmedName) return;
              modelStore.newModel({ name: trimmedName, description: description.trim() || undefined });
              onClose();
            }}
            disabled={name.trim().length === 0}
          >
            Create
          </button>
        </>
      }
    >
      <div className="formGrid">
        <div className="formRow">
          <label htmlFor="new-model-name">Name</label>
          <input
            id="new-model-name"
            className="textInput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="formRow">
          <label htmlFor="new-model-description">Description</label>
          <textarea
            id="new-model-description"
            className="textArea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

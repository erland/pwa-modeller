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
  const canCreate = name.trim().length > 0;

  const createModel = (): void => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    modelStore.newModel({ name: trimmedName, description: description.trim() || undefined });
    onClose();
  };

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
          <button type="submit" className="shellButton" disabled={!canCreate} form="new-model-form">
            Create
          </button>
        </>
      }
    >
      <form
        id="new-model-form"
        className="formGrid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canCreate) return;
          createModel();
        }}
      >
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
      </form>
    </Dialog>
  );
}

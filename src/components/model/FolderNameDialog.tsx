import { useEffect, useState } from 'react';

import { Dialog } from '../dialog/Dialog';

type Props = {
  isOpen: boolean;
  title: string;
  initialName?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

export function FolderNameDialog({ isOpen, title, initialName, confirmLabel, onCancel, onConfirm }: Props) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName ?? '');
  }, [isOpen, initialName]);

  return (
    <Dialog
      title={title}
      isOpen={isOpen}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="shellButton" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="shellButton"
            onClick={() => onConfirm(name.trim())}
            disabled={name.trim().length === 0}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="formGrid">
        <div className="formRow">
          <label htmlFor="folder-name">Folder name</label>
          <input
            id="folder-name"
            className="textInput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  );
}

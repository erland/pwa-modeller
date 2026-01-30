import { useEffect, useState } from 'react';

import { Dialog } from '../../dialog/Dialog';

type Props = {
  isOpen: boolean;
  initialName?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

export function SaveSandboxAsDiagramDialog({ isOpen, initialName, onCancel, onConfirm }: Props) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName ?? '');
  }, [initialName, isOpen]);

  return (
    <Dialog
      title="Save sandbox as diagram"
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
            Save
          </button>
        </>
      }
    >
      <div className="formGrid">
        <div className="formRow">
          <label htmlFor="sandbox-diagram-name">Diagram name</label>
          <input
            id="sandbox-diagram-name"
            className="textInput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) return;
              onConfirm(trimmed);
            }}
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  );
}

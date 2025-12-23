import { useEffect, useState } from 'react';

import { modelStore, useModelStore } from '../../store';
import { Dialog } from '../dialog/Dialog';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function ModelPropertiesDialog({ isOpen, onClose }: Props) {
  const model = useModelStore((s) => s.model);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [owner, setOwner] = useState('');

  useEffect(() => {
    if (!isOpen || !model) return;
    setName(model.metadata.name ?? '');
    setDescription(model.metadata.description ?? '');
    setVersion(model.metadata.version ?? '');
    setOwner(model.metadata.owner ?? '');
  }, [isOpen, model]);

  return (
    <Dialog
      title="Model properties"
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
              const trimmed = name.trim();
              if (!trimmed) return;
              modelStore.updateModelMetadata({
                name: trimmed,
                description: description.trim() || undefined,
                version: version.trim() || undefined,
                owner: owner.trim() || undefined
              });
              onClose();
            }}
            disabled={!model || name.trim().length === 0}
          >
            Save
          </button>
        </>
      }
    >
      {!model ? (
        <p className="hintText">No model loaded.</p>
      ) : (
        <div className="formGrid">
          <div className="formRow">
            <label htmlFor="model-props-name">Name</label>
            <input id="model-props-name" className="textInput" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="formRow">
            <label htmlFor="model-props-description">Description</label>
            <textarea
              id="model-props-description"
              className="textArea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="formRow">
            <label htmlFor="model-props-version">Version</label>
            <input id="model-props-version" className="textInput" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="formRow">
            <label htmlFor="model-props-owner">Owner</label>
            <input id="model-props-owner" className="textInput" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

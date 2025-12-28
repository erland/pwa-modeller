import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ModelMetadata } from '../../domain';
import { deserializeModel, serializeModel, downloadTextFile, sanitizeFileName, modelStore, useModelStore } from '../../store';
import { Dialog } from '../dialog/Dialog';

function defaultFileName(metadata: ModelMetadata): string {
  return sanitizeFileName(metadata.name || 'model');
}

type ModelActionsProps = {
  onEditModelProps: () => void;
};

export function ModelActions({ onEditModelProps }: ModelActionsProps) {
  const navigate = useNavigate();
  const { model, fileName, isDirty } = useModelStore((s) => s);
  const openInputRef = useRef<HTMLInputElement | null>(null);

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saveAsName, setSaveAsName] = useState('');

  const saveAsDefault = useMemo(() => {
    if (!model) return 'model.json';
    return fileName ?? defaultFileName(model.metadata);
  }, [fileName, model]);

  function confirmReplaceIfDirty(): boolean {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Replace the current model?');
  }

  function doNewModel() {
    if (!confirmReplaceIfDirty()) return;
    setNewDialogOpen(true);
    setNewName(model?.metadata.name ?? '');
    setNewDesc('');
  }

  function doOpenModel() {
    if (!confirmReplaceIfDirty()) return;
    openInputRef.current?.click();
  }

  async function onFileChosen(file: File | null) {
    if (!file) return;
    // `File.text()` is not available in all Jest/jsdom versions.
    const text =
      typeof (file as any).text === 'function'
        ? await (file as any).text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ''));
            reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
            reader.readAsText(file);
          });
    const loaded = deserializeModel(text);
    modelStore.loadModel(loaded, file.name);
  }

  const triggerDownload = useCallback(
    (name: string) => {
    if (!model) return;
    const json = serializeModel(model);
    const finalName = sanitizeFileName(name);
    downloadTextFile(finalName, json);
    modelStore.setFileName(finalName);
    modelStore.markSaved();
    },
    [model]
  );

  const doSave = useCallback(() => {
    if (!model) return;
    if (fileName) {
      triggerDownload(fileName);
      return;
    }
    setSaveAsName(saveAsDefault);
    setSaveAsDialogOpen(true);
  }, [fileName, model, saveAsDefault, triggerDownload]);

  const doSaveAs = useCallback(() => {
    if (!model) return;
    setSaveAsName(saveAsDefault);
    setSaveAsDialogOpen(true);
  }, [model, saveAsDefault]);

  // Step 13: global shortcut (Ctrl/Cmd+S) can request a save.
  useEffect(() => {
    function onRequestSave() {
      doSave();
    }
    window.addEventListener('pwa-modeller:request-save', onRequestSave as EventListener);
    return () => window.removeEventListener('pwa-modeller:request-save', onRequestSave as EventListener);
  }, [doSave]);

  return (
    <>
      <button type="button" className="shellButton" onClick={doNewModel}>
        New
      </button>
      <button type="button" className="shellButton" onClick={doOpenModel}>
        Open
      </button>
      <button
        type="button"
        className="shellButton"
        onClick={doSave}
        disabled={!model}
        title={!model ? 'No model loaded' : isDirty ? 'Save changes (Ctrl/Cmd+S)' : 'Download model (Ctrl/Cmd+S)'}
      >
        Save model{isDirty ? '*' : ''}
      </button>
      <button
        type="button"
        className="shellButton"
        onClick={doSaveAs}
        disabled={!model}
        aria-label="Download model as"
      >
        Download As
      </button>
      <button type="button" className="shellButton" onClick={onEditModelProps} disabled={!model}>
        Model
      </button>

      <button
        type="button"
        className="shellIconButton shellOnlySmall"
        aria-label="More model actions"
        onClick={() => setOverflowOpen(true)}
      >
        ⋯
      </button>

      <input
        ref={openInputRef}
        data-testid="open-model-input"
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          // Allow choosing the same file again.
          e.currentTarget.value = '';
          void onFileChosen(f);
        }}
      />

      <Dialog
        title="Model actions"
        isOpen={overflowOpen}
        onClose={() => setOverflowOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              setOverflowOpen(false);
              doNewModel();
            }}
          >
            New
          </button>

          <button
            type="button"
            className="shellButton"
            onClick={() => {
              setOverflowOpen(false);
              doOpenModel();
            }}
          >
            Open
          </button>

          <button
            type="button"
            className="shellButton"
            onClick={() => {
              setOverflowOpen(false);
              doSave();
            }}
            disabled={!model}
            title={!model ? 'No model loaded' : isDirty ? 'Save changes (Ctrl/Cmd+S)' : 'Download model (Ctrl/Cmd+S)'}
          >
            Save model{isDirty ? '*' : ''}
          </button>

          <button
            type="button"
            className="shellButton"
            onClick={() => {
              setOverflowOpen(false);
              doSaveAs();
            }}
            disabled={!model}
          >
            Download As
          </button>

          <button
            type="button"
            className="shellButton"
            onClick={() => {
              setOverflowOpen(false);
              onEditModelProps();
            }}
            disabled={!model}
          >
            Model
          </button>

          <button
            type="button"
            className="shellButton"
            onClick={() => {
              setOverflowOpen(false);
              navigate('/about');
            }}
          >
            About
          </button>
        </div>
      </Dialog>

      <Dialog
        title="New model"
        isOpen={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        footer={
          <>
            <button type="button" className="shellButton" onClick={() => setNewDialogOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              onClick={() => {
                const name = newName.trim();
                if (!name) return;
                modelStore.newModel({ name, description: newDesc.trim() || undefined });
                setNewDialogOpen(false);
              }}
              disabled={newName.trim().length === 0}
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
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="formRow">
            <label htmlFor="new-model-description">Description</label>
            <textarea
              id="new-model-description"
              className="textArea"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        title="Save model as"
        isOpen={saveAsDialogOpen}
        onClose={() => setSaveAsDialogOpen(false)}
        footer={
          <>
            <button type="button" className="shellButton" onClick={() => setSaveAsDialogOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              onClick={() => {
                triggerDownload(saveAsName);
                setSaveAsDialogOpen(false);
              }}
              disabled={saveAsName.trim().length === 0}
            >
              Download
            </button>
          </>
        }
      >
        <div className="formGrid">
          <div className="formRow">
            <label htmlFor="saveas-name">File name</label>
            <input
              id="saveas-name"
              className="textInput"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              autoFocus
            />
            <p className="hintText">The browser will download a JSON file. You can rename or move it as you like.</p>
          </div>
        </div>
      </Dialog>
    </>
  );
}

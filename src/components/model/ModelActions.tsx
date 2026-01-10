import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ModelMetadata } from '../../domain';
import { deserializeModel, serializeModel, downloadTextFile, sanitizeFileName, sanitizeFileNameWithExtension, modelStore, useModelStore } from '../../store';
import {
  applyImportIR,
  formatUnknownCounts,
  hasImportWarnings,
  importModel,
  type ImportReport,
} from '../../import';
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
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
    const [saveAsName, setSaveAsName] = useState('');

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importReportOpen, setImportReportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<{
    fileName: string;
    format: string;
    importerId: string;
    counts: { folders: number; elements: number; relationships: number; views: number };
    report: ImportReport;
  } | null>(null);

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

  async function readFileAsText(file: File): Promise<string> {
    // Prefer the modern File.text() API when available.
    const anyFile = file as unknown as { text?: () => Promise<string> };
    if (typeof anyFile.text === 'function') {
      return await anyFile.text();
    }

    // Jest/jsdom (and some older browsers) may not implement File.text().
    // FileReader is widely supported and works in tests.
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsText(file);
    });
  }

  async function onFileChosen(file: File | null) {
    if (!file) return;
    try {
      const json = await readFileAsText(file);
      const model = deserializeModel(json);
      const safeName = sanitizeFileNameWithExtension(file.name || 'model.json', 'json');
      modelStore.loadModel(model, safeName);
      navigate('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(`Failed to open model: ${msg}`);
    }
  }

  function doImport() {
    if (!confirmReplaceIfDirty()) return;
    setImportError(null);
    // Open the dialog (shows progress/errors) and immediately open the file picker.
    setImportDialogOpen(true);
    triggerImportFilePicker();
  }

  function triggerImportFilePicker() {
    const el = importInputRef.current;
    if (!el) return;
    // Allow choosing the same file again.
    el.value = '';
    el.click();
  }

  async function onImportFileChosen(file: File | null) {
    if (!file) return;

    setImporting(true);
    setImportError(null);
    try {
      const result = await importModel(file);
      const counts = {
        folders: result.ir.folders.length,
        elements: result.ir.elements.length,
        relationships: result.ir.relationships.length,
        views: result.ir.views?.length ?? 0
      };

      const applied = applyImportIR(result.ir, result.report, {
        sourceSystem: result.format || result.report?.source || result.importerId
      });

      setLastImport({
        fileName: file.name || 'import',
        format: result.format || result.importerId,
        importerId: result.importerId,
        counts,
        report: applied.report
      });

      setImportDialogOpen(false);
      setImportReportOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportError(msg);
    } finally {
      setImporting(false);
    }
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
      <button
        type="button"
        className="shellButton shellPrimaryAction"
        onClick={() => setOverflowOpen(true)}
      >
        Model
      </button>
<input
        ref={openInputRef}
        data-testid="open-model-input"
        type="file"
        accept="application/json,.json"
        style={{ position: 'fixed', left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          // Allow choosing the same file again.
          e.currentTarget.value = '';
          void onFileChosen(f);
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".xml,.xmi,application/xml,text/xml"
        style={{ position: 'fixed', left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          // Allow choosing the same file again.
          e.currentTarget.value = '';
          void onImportFileChosen(f);
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
              doImport();
            }}
          >
            Import…
          </button>



          <button
            type="button"
            className="shellButton"
            onClick={() => {
              setOverflowOpen(false);
              onEditModelProps();
            }}
            disabled={!model}
            title={!model ? 'No model loaded' : undefined}
          >
            Properties…
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

      <Dialog
        title="Import model"
        isOpen={importDialogOpen}
        onClose={() => {
          if (importing) return;
          setImportDialogOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className="shellButton"
              onClick={() => {
                if (importing) return;
                setImportDialogOpen(false);
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
                triggerImportFilePicker();
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
          {importError ? (
            <div role="alert" style={{ padding: 10, border: '1px solid #c33', borderRadius: 6 }}>
              {importError}
            </div>
          ) : null}
          {importing ? <p style={{ margin: 0 }}>Importing…</p> : null}
        </div>
      </Dialog>

      <Dialog
        title="Import report"
        isOpen={importReportOpen}
        onClose={() => setImportReportOpen(false)}
        footer={
          <>
            <button type="button" className="shellButton" onClick={() => setImportReportOpen(false)}>
              Close
            </button>
            <button
              type="button"
              className="shellButton"
              onClick={() => {
                if (!lastImport) return;
                const r = lastImport.report;
                const lines: string[] = [];
                lines.push(`# Import report`);
                lines.push('');
                lines.push(`- File: ${lastImport.fileName}`);
                lines.push(`- Format: ${lastImport.format}`);
                lines.push(`- Importer: ${lastImport.importerId}`);
                lines.push(`- Source: ${r.source}`);
                lines.push(
                  `- Counts: folders=${lastImport.counts.folders}, elements=${lastImport.counts.elements}, relationships=${lastImport.counts.relationships}, views=${lastImport.counts.views}`
                );
                lines.push('');
                if (r.warnings.length) {
                  lines.push('## Warnings');
                  for (const w of r.warnings) lines.push(`- ${w}`);
                  lines.push('');
                }
                const elemUnknown = formatUnknownCounts(r.unknownElementTypes);
                if (elemUnknown.length) {
                  lines.push('## Unknown element types');
                  for (const [k, v] of elemUnknown) lines.push(`- ${k}: ${v}`);
                  lines.push('');
                }
                const relUnknown = formatUnknownCounts(r.unknownRelationshipTypes);
                if (relUnknown.length) {
                  lines.push('## Unknown relationship types');
                  for (const [k, v] of relUnknown) lines.push(`- ${k}: ${v}`);
                  lines.push('');
                }
                if (!r.warnings.length && elemUnknown.length === 0 && relUnknown.length === 0) {
                  lines.push('No warnings.');
                }
                downloadTextFile(
                  sanitizeFileNameWithExtension(`import-report-${lastImport.fileName}`, 'md'),
                  lines.join('\n'),
                  'text/markdown'
                );
              }}
              disabled={!lastImport}
            >
              Download report
            </button>
          </>
        }
      >
        {lastImport ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div><b>File</b>: {lastImport.fileName}</div>
              <div><b>Format</b>: {lastImport.format}</div>
              <div><b>Importer</b>: {lastImport.importerId}</div>
              <div><b>Source</b>: {lastImport.report.source}</div>
              <div>
                <b>Counts</b>: folders={lastImport.counts.folders}, elements={lastImport.counts.elements}, relationships={lastImport.counts.relationships}, views={lastImport.counts.views}
              </div>
            </div>

            <div>
              <b>Status</b>: {hasImportWarnings(lastImport.report) ? 'Warnings' : 'OK'}
            </div>

            {lastImport.report.warnings.length ? (
              <div>
                <b>Warnings</b>
                <ul>
                  {lastImport.report.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {formatUnknownCounts(lastImport.report.unknownElementTypes).length ? (
              <div>
                <b>Unknown element types</b>
                <ul>
                  {formatUnknownCounts(lastImport.report.unknownElementTypes).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {formatUnknownCounts(lastImport.report.unknownRelationshipTypes).length ? (
              <div>
                <b>Unknown relationship types</b>
                <ul>
                  {formatUnknownCounts(lastImport.report.unknownRelationshipTypes).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!hasImportWarnings(lastImport.report) ? <div>No warnings.</div> : null}
          </div>
        ) : (
          <div>No report available.</div>
        )}
      </Dialog>

      </Dialog>
    </>
  );
}
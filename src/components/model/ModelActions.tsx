import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useModelStore } from '../../store';
import {
  ActionsMenuDialog,
  PublishDialog,
  ImportDialog,
  ImportReportDialog,
  NewModelDialog,
  SaveAsDialog,
  buildModelActionRegistry,
  useModelActionHandlers
} from './actions';

type ModelActionsProps = {
  onEditModelProps: () => void;
  activeViewId: string | null;
};

export function ModelActions({ onEditModelProps, activeViewId }: ModelActionsProps) {
  const navigate = useNavigate();
  const { model, fileName, isDirty } = useModelStore((s) => s);

  const ctrl = useModelActionHandlers({ model, fileName, isDirty, navigate, onEditModelProps, activeViewId });

  const actions = useMemo(
    () =>
      buildModelActionRegistry({
        modelLoaded: !!model,
        isDirty,
        onNew: ctrl.doNewModel,
        onLoad: ctrl.doLoad,
        onProperties: ctrl.doProperties,
        onSave: ctrl.doSave,
        onSaveAs: ctrl.doSaveAs,
        onModel: ctrl.doProperties,
        onAbout: ctrl.doAbout,
        onPublish: ctrl.doPublish
      }),
    [
      model,
      isDirty,
      ctrl.doNewModel,
      ctrl.doLoad,
      ctrl.doProperties,
      ctrl.doSave,
      ctrl.doSaveAs,
      ctrl.doAbout,
      ctrl.doPublish
    ]
  );

  return (
    <>
      <button
        type="button"
        className="shellButton shellPrimaryAction"
        onClick={() => ctrl.setOverflowOpen(true)}
      >
        Model
      </button>

      <input
        ref={ctrl.loadInputRef}
        data-testid="load-model-input"
        type="file"
        accept=".json,.bpmn,.xml,.xmi,application/json,application/xml,text/xml"
        style={{ position: 'fixed', left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          // Allow choosing the same file again.
          e.currentTarget.value = '';
          void ctrl.onLoadFileChosen(f);
        }}
      />


      <ActionsMenuDialog
        isOpen={ctrl.overflowOpen}
        onClose={() => ctrl.setOverflowOpen(false)}
        actions={actions}
      />

      <NewModelDialog
        isOpen={ctrl.newDialogOpen}
        onClose={() => ctrl.setNewDialogOpen(false)}
        name={ctrl.newName}
        description={ctrl.newDesc}
        setName={ctrl.setNewName}
        setDescription={ctrl.setNewDesc}
      />

      <SaveAsDialog
        isOpen={ctrl.saveAsDialogOpen}
        onClose={() => ctrl.setSaveAsDialogOpen(false)}
        fileName={ctrl.saveAsName}
        setFileName={ctrl.setSaveAsName}
        onDownload={ctrl.triggerDownload}
      />

      <ImportDialog
        isOpen={ctrl.importDialogOpen}
        onClose={() => ctrl.setImportDialogOpen(false)}
        importing={ctrl.importing}
        error={ctrl.importError}
        onChooseFile={ctrl.triggerLoadFilePicker}
      />



      <PublishDialog
        isOpen={ctrl.publishDialogOpen}
        onClose={() => ctrl.setPublishDialogOpen(false)}
        title={ctrl.publishTitle}
        setTitle={ctrl.setPublishTitle}
        scope={ctrl.publishScope}
        setScope={ctrl.setPublishScope}
        currentViewLabel={ctrl.currentViewLabel}
        canPublishView={ctrl.canPublishView}
        publishing={ctrl.publishing}
        error={ctrl.publishError}
        onPublish={() => void ctrl.runPublish()}
      />

      <ImportReportDialog
        isOpen={ctrl.importReportOpen}
        onClose={() => ctrl.setImportReportOpen(false)}
        lastImport={ctrl.lastImport}
        onDownloadReport={ctrl.downloadImportReport}
      />
    </>
  );
}

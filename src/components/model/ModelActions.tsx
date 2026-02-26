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

import { LocalDatasetsDialog } from './datasets/LocalDatasetsDialog';
import { RemoteDatasetsDialog } from './datasets/RemoteDatasetsDialog';

type ModelActionsProps = {
  onEditModelProps: () => void;
  activeViewId: string | null;
};

export function ModelActions({ onEditModelProps, activeViewId }: ModelActionsProps) {
  const navigate = useNavigate();
  const { model, fileName, isDirty, activeDatasetId } = useModelStore((s) => s);

  const ctrl = useModelActionHandlers({ model, fileName, isDirty, activeDatasetId, navigate, onEditModelProps, activeViewId });

  const actions = useMemo(
    () =>
      buildModelActionRegistry({
        modelLoaded: !!model,
        isDirty,
        onNew: ctrl.doNewModel,
        onDatasets: ctrl.doLocalDatasets,
        onRemoteDatasets: ctrl.doRemoteDatasets,
        onLoad: ctrl.doLoad,
        onProperties: ctrl.doProperties,
        onSave: ctrl.doSave,
        onSaveAs: ctrl.doSaveAs,
        onExportBackup: ctrl.doExportDatasetBackup,
        onImportBackup: ctrl.doImportDatasetBackup,
        onModel: ctrl.doProperties,
        onAbout: ctrl.doAbout,
        onPublish: ctrl.doPublish
      }),
    [
      model,
      isDirty,
      ctrl.doNewModel,
      ctrl.doLocalDatasets,
      ctrl.doRemoteDatasets,
      ctrl.doLoad,
      ctrl.doProperties,
      ctrl.doSave,
      ctrl.doSaveAs,
      ctrl.doExportDatasetBackup,
      ctrl.doImportDatasetBackup,
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

      <input
        ref={ctrl.importBackupInputRef}
        data-testid="import-backup-input"
        type="file"
        accept=".json,application/json"
        style={{ position: 'fixed', left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          // Allow choosing the same file again.
          e.currentTarget.value = '';
          void ctrl.onImportBackupFileChosen(f);
        }}
      />


      <ActionsMenuDialog
        isOpen={ctrl.overflowOpen}
        onClose={() => ctrl.setOverflowOpen(false)}
        actions={actions}
      />

      <LocalDatasetsDialog
        isOpen={ctrl.localDatasetsOpen}
        onClose={() => ctrl.setLocalDatasetsOpen(false)}
      />

      <RemoteDatasetsDialog
        isOpen={ctrl.remoteDatasetsOpen}
        onClose={() => ctrl.setRemoteDatasetsOpen(false)}
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
        folderOptions={ctrl.folderOptions}
        selectedFolderId={ctrl.selectedFolderId}
        setSelectedFolderId={ctrl.setSelectedFolderId}
        publishing={ctrl.publishing}
        error={ctrl.publishError}
        success={ctrl.publishSuccess}
        publishServerResult={ctrl.publishServerResult}
        onPublish={() => void ctrl.runPublish()}
        onPublishToServer={() => void ctrl.runPublishToServer()}
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

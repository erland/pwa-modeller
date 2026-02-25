import type { NavigateFunction } from 'react-router-dom';
import { useState } from 'react';

import type { Model } from '../../../domain';
import type { DatasetId } from '../../../store';

import { useModelFileActions, type LastImportInfo } from './model/useModelFileActions';
import { useModelPublishActions } from './model/useModelPublishActions';
import { useModelElementActions } from './model/useModelElementActions';
import { useModelRelationshipActions } from './model/useModelRelationshipActions';
import { useModelViewActions } from './model/useModelViewActions';

export type { LastImportInfo } from './model/useModelFileActions';

export type UseModelActionHandlersArgs = {
  model: Model | null;
  fileName: string | null;
  isDirty: boolean;
  activeDatasetId: DatasetId;
  navigate: NavigateFunction;
  onEditModelProps: () => void;
  activeViewId: string | null;
};

/**
 * Compatibility wrapper around smaller, feature-focused action hooks.
 *
 * The return shape intentionally matches the pre-refactor API so consuming components
 * do not need to change.
 */
export function useModelActionHandlers({ model, fileName, isDirty, activeDatasetId, navigate, onEditModelProps, activeViewId }: UseModelActionHandlersArgs) {
  const file = useModelFileActions({ model, fileName, isDirty, activeDatasetId, navigate });
  const elem = useModelElementActions({ onEditModelProps });
  const rel = useModelRelationshipActions();
  const view = useModelViewActions({ navigate });
  const publish = useModelPublishActions({ model, fileName, activeViewId });

  const [localDatasetsOpen, setLocalDatasetsOpen] = useState(false);

  return {
    // refs / inputs
    loadInputRef: file.loadInputRef,
    importBackupInputRef: file.importBackupInputRef,
    onLoadFileChosen: file.onLoadFileChosen,
    onImportBackupFileChosen: file.onImportBackupFileChosen,
    triggerLoadFilePicker: file.triggerLoadFilePicker,

    // dialogs / menu
    overflowOpen: file.overflowOpen,
    setOverflowOpen: file.setOverflowOpen,

    localDatasetsOpen,
    setLocalDatasetsOpen,

    newDialogOpen: file.newDialogOpen,
    setNewDialogOpen: file.setNewDialogOpen,
    newName: file.newName,
    setNewName: file.setNewName,
    newDesc: file.newDesc,
    setNewDesc: file.setNewDesc,

    saveAsDialogOpen: file.saveAsDialogOpen,
    setSaveAsDialogOpen: file.setSaveAsDialogOpen,
    saveAsName: file.saveAsName,
    setSaveAsName: file.setSaveAsName,

    importDialogOpen: file.importDialogOpen,
    setImportDialogOpen: file.setImportDialogOpen,
    importReportOpen: file.importReportOpen,
    setImportReportOpen: file.setImportReportOpen,
    importing: file.importing,
    importError: file.importError,
    lastImport: file.lastImport as LastImportInfo | null,

    // commands
    doNewModel: file.doNewModel,
    doLocalDatasets: () => {
      setLocalDatasetsOpen(true);
      // Close the actions menu if it was open.
      file.setOverflowOpen(false);
    },
    doLoad: file.doLoad,
    doSave: file.doSave,
    doSaveAs: file.doSaveAs,
    doExportDatasetBackup: file.doExportDatasetBackup,
    doImportDatasetBackup: file.doImportDatasetBackup,
    doProperties: elem.doProperties,
    doAbout: view.doAbout,
    doPublish: publish.openPublish,
    triggerDownload: file.triggerDownload,
    saveAsDefault: file.saveAsDefault,
    downloadImportReport: file.downloadImportReport,

    // publish
    publishDialogOpen: publish.publishDialogOpen,
    setPublishDialogOpen: publish.setPublishDialogOpen,
    publishing: publish.publishing,
    publishError: publish.publishError,
    publishSuccess: publish.publishSuccess,
    publishServerResult: publish.publishServerResult,
    publishTitle: publish.publishTitle,
    setPublishTitle: publish.setPublishTitle,
    publishScope: publish.publishScope,
    setPublishScope: publish.setPublishScope,
    folderOptions: publish.folderOptions,
    selectedFolderId: publish.selectedFolderId,
    setSelectedFolderId: publish.setSelectedFolderId,
    currentViewLabel: publish.currentViewLabel,
    canPublishView: publish.canPublishView,
    runPublish: publish.doPublish,
    runPublishToServer: publish.doPublishToServer,

    // helpers
    confirmReplaceIfDirty: file.confirmReplaceIfDirty,
    setImportError: file.setImportError,

    // relationship actions (currently none, but preserved for future extension)
    ...rel
  };
}

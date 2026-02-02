import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useModelStore } from '../../store';
import {
  ActionsMenuDialog,
  ImportDialog,
  ImportReportDialog,
  NewModelDialog,
  OverlayImportDialog,
  OverlaySurveyExportDialog,
  OverlaySurveyImportDialog,
  OverlayManageDialog,
  OverlayResolveReportDialog,
  SaveAsDialog,
  buildModelActionRegistry,
  useModelActionHandlers,
  useOverlayActionHandlers
} from './actions';

type ModelActionsProps = {
  onEditModelProps: () => void;
};

export function ModelActions({ onEditModelProps }: ModelActionsProps) {
  const navigate = useNavigate();
  const { model, fileName, isDirty } = useModelStore((s) => s);

  const ctrl = useModelActionHandlers({ model, fileName, isDirty, navigate, onEditModelProps });
  const overlayCtrl = useOverlayActionHandlers({ model, fileName });

  const actions = useMemo(
    () =>
      buildModelActionRegistry({
        modelLoaded: !!model,
        isDirty,
        overlayHasEntries: overlayCtrl.overlayHasEntries,
        overlayReportAvailable: overlayCtrl.overlayReportAvailable,
        overlayHasIssues: overlayCtrl.overlayHasIssues,
        onNew: ctrl.doNewModel,
        onLoad: ctrl.doLoad,
        onProperties: ctrl.doProperties,
        onSave: ctrl.doSave,
        onSaveAs: ctrl.doSaveAs,
        onOverlayExport: overlayCtrl.doOverlayExport,
        onOverlayImport: overlayCtrl.doOverlayImport,
        onOverlaySurveyExport: overlayCtrl.doOverlaySurveyExport,
        onOverlaySurveyImport: overlayCtrl.doOverlaySurveyImport,
        onOverlayReport: overlayCtrl.doOverlayReport,
        onOverlayManage: overlayCtrl.doOverlayManage,
        onModel: ctrl.doProperties,
        onAbout: ctrl.doAbout
      }),
    [
      model,
      isDirty,
      ctrl.doNewModel,
      ctrl.doLoad,
      ctrl.doProperties,
      ctrl.doSave,
      ctrl.doSaveAs,
      overlayCtrl.overlayHasEntries,
      overlayCtrl.overlayHasIssues,
      overlayCtrl.overlayReportAvailable,
      overlayCtrl.doOverlayExport,
      overlayCtrl.doOverlayImport,
      overlayCtrl.doOverlaySurveyExport,
      overlayCtrl.doOverlaySurveyImport,
      overlayCtrl.doOverlayReport,
      overlayCtrl.doOverlayManage,
      ctrl.doAbout
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
        ref={overlayCtrl.overlayLoadInputRef}
        data-testid="load-overlay-input"
        type="file"
        accept=".json,application/json"
        style={{ position: 'fixed', left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          e.currentTarget.value = '';
          void overlayCtrl.onOverlayFileChosen(f);
        }}
      />

      <input
        ref={overlayCtrl.overlaySurveyLoadInputRef}
        data-testid="load-overlay-survey-input"
        type="file"
        accept=".csv,text/csv"
        style={{ position: 'fixed', left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          e.currentTarget.value = '';
          void overlayCtrl.onOverlaySurveyFileChosen(f);
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

      <OverlayImportDialog
        isOpen={overlayCtrl.overlayImportDialogOpen}
        onClose={() => overlayCtrl.setOverlayImportDialogOpen(false)}
        importing={overlayCtrl.overlayImporting}
        error={overlayCtrl.overlayImportError}
        onChooseFile={overlayCtrl.triggerOverlayLoadFilePicker}
      />

      <OverlaySurveyExportDialog
        isOpen={overlayCtrl.surveyExportDialogOpen}
        onClose={() => overlayCtrl.setSurveyExportDialogOpen(false)}
        targetSet={overlayCtrl.surveyTargetSet}
        setTargetSet={overlayCtrl.setSurveyTargetSet}
        tagKeysText={overlayCtrl.surveyTagKeysText}
        setTagKeysText={overlayCtrl.setSurveyTagKeysText}
        onSuggestKeys={overlayCtrl.suggestSurveyKeys}
        onExport={overlayCtrl.doOverlaySurveyExportNow}
      />

      <OverlaySurveyImportDialog
        isOpen={overlayCtrl.surveyImportDialogOpen}
        onClose={() => overlayCtrl.setSurveyImportDialogOpen(false)}
        importing={overlayCtrl.surveyImporting}
        error={overlayCtrl.surveyImportError}
        options={overlayCtrl.surveyImportOptions}
        setOptions={overlayCtrl.setSurveyImportOptions}
        onChooseFile={overlayCtrl.triggerOverlaySurveyLoadFilePicker}
      />

      <OverlayResolveReportDialog
        isOpen={overlayCtrl.overlayReportOpen}
        onClose={() => overlayCtrl.setOverlayReportOpen(false)}
        sourceFileName={overlayCtrl.lastOverlayImport?.fileName ?? 'overlay.json'}
        warnings={overlayCtrl.lastOverlayImport?.warnings ?? []}
        report={
          overlayCtrl.lastOverlayImport?.report ?? {
            total: 0,
            attached: [],
            orphan: [],
            ambiguous: [],
            counts: { attached: 0, orphan: 0, ambiguous: 0 }
          }
        }
        onDownloadReport={overlayCtrl.downloadOverlayResolveReport}
      />

      {model ? (
        <OverlayManageDialog
          isOpen={overlayCtrl.overlayManageOpen}
          onClose={() => overlayCtrl.setOverlayManageOpen(false)}
          model={model}
          onToast={overlayCtrl.setToast}
        />
      ) : null}

      <ImportReportDialog
        isOpen={ctrl.importReportOpen}
        onClose={() => ctrl.setImportReportOpen(false)}
        lastImport={ctrl.lastImport}
        onDownloadReport={ctrl.downloadImportReport}
      />

      {overlayCtrl.toast ? (
        <div className={`toast toast-${overlayCtrl.toast.kind}`} role="status" aria-live="polite">
          <div className="toastRow">
            <div className="toastMsg">{overlayCtrl.toast.message}</div>
            <button type="button" className="shellIconButton" aria-label="Dismiss" onClick={() => overlayCtrl.setToast(null)}>
              ✕
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

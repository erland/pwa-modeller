import type { ExportDialogControllerArgs, ExportDialogState } from './useExportDialogState';

import { useExportDialogState } from './useExportDialogState';
import { createExportDialogTableActions } from './actions/exportDialogActionsTable';
import { createExportDialogImageActions } from './actions/exportDialogActionsImage';
import { createExportDialogOfficeActions } from './actions/exportDialogActionsOffice';
import { createExportDialogReportActions } from './actions/exportDialogActionsReport';

type ControllerState = {
  exportOptions: ExportDialogState['exportOptions'];
  exportBundle: ExportDialogState['exportBundle'];
  sandboxSvgText: ExportDialogState['sandboxSvgText'];

  availableFormats: ExportDialogState['availableFormats'];
  format: ExportDialogState['format'];
  setFormat: ExportDialogState['setFormat'];

  busy: ExportDialogState['busy'];
  status: ExportDialogState['status'];
  reportCount: ExportDialogState['reportCount'];

  canSvg: ExportDialogState['canSvg'];
  canPng: ExportDialogState['canPng'];
  canPptx: ExportDialogState['canPptx'];
  canXlsx: ExportDialogState['canXlsx'];
  canTsv: ExportDialogState['canTsv'];
  canCsv: ExportDialogState['canCsv'];
  canCopyImage: ExportDialogState['canCopyImage'];

  actions: {
    copyTableTsv: () => Promise<void>;
    downloadCsv: () => Promise<void>;
    copySvg: () => Promise<void>;
    downloadSvg: () => Promise<void>;
    copyPng: () => Promise<void>;
    downloadPng: () => Promise<void>;
    downloadPptx: () => Promise<void>;
    downloadXlsx: () => Promise<void>;
    addToReport: () => void;
    downloadReportJson: () => void;
    clearReport: () => void;
  };
};

export function useExportDialogController(args: ExportDialogControllerArgs): ControllerState {
  const state = useExportDialogState(args);

  const tableActions = createExportDialogTableActions(state);
  const imageActions = createExportDialogImageActions(state);
  const officeActions = createExportDialogOfficeActions(state);
  const reportActions = createExportDialogReportActions(state);

  return {
    exportOptions: state.exportOptions,
    exportBundle: state.exportBundle,
    sandboxSvgText: state.sandboxSvgText,
    availableFormats: state.availableFormats,
    format: state.format,
    setFormat: state.setFormat,
    busy: state.busy,
    status: state.status,
    reportCount: state.reportCount,
    canSvg: state.canSvg,
    canPng: state.canPng,
    canPptx: state.canPptx,
    canXlsx: state.canXlsx,
    canTsv: state.canTsv,
    canCsv: state.canCsv,
    canCopyImage: state.canCopyImage,
    actions: {
      ...tableActions,
      ...imageActions,
      ...officeActions,
      ...reportActions,
    },
  };
}

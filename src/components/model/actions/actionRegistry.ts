export type ModelActionId =
  | 'new'
  | 'load'
  | 'properties'
  | 'save'
  | 'saveAs'
  | 'overlayExport'
  | 'overlayExportCsvLong'
  | 'overlayImport'
  | 'overlayImportCsvLong'
  | 'overlayReport'
  | 'overlayManage'
  | 'model'
  | 'about';

export type ModelAction = {
  id: ModelActionId;
  label: string;
  run: () => void;
  disabled?: boolean;
  title?: string;
};

type BuildRegistryArgs = {
  modelLoaded: boolean;
  isDirty: boolean;
  overlayHasEntries: boolean;
  overlayReportAvailable: boolean;
  overlayHasIssues: boolean;
  onNew: () => void;
  onLoad: () => void;
  onProperties: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOverlayExport: () => void;
  onOverlayExportCsvLong: () => void;
  onOverlayImport: () => void;
  onOverlayImportCsvLong: () => void;
  onOverlayReport: () => void;
  onOverlayManage: () => void;
  onModel: () => void;
  onAbout: () => void;
};

/**
 * Central place that defines what actions exist, their display labels, and enabled/disabled state.
 * Keeps UI components (menus/toolbars/shortcuts) consistent.
 */
export function buildModelActionRegistry(args: BuildRegistryArgs): ModelAction[] {
  const { modelLoaded, isDirty, overlayHasEntries, overlayReportAvailable, overlayHasIssues } = args;

  return [
    {
      id: 'new',
      label: 'New',
      run: args.onNew
    },
    {
      id: 'load',
      label: 'Load…',
      run: args.onLoad
    },
    {
      id: 'properties',
      label: 'Properties…',
      run: args.onProperties,
      disabled: !modelLoaded,
      title: !modelLoaded ? 'No model loaded' : undefined
    },
    {
      id: 'save',
      label: `Save model${isDirty ? '*' : ''}`,
      run: args.onSave,
      disabled: !modelLoaded,
      title: !modelLoaded ? 'No model loaded' : isDirty ? 'Save changes (Ctrl/Cmd+S)' : 'Download model (Ctrl/Cmd+S)'
    },
    {
      id: 'saveAs',
      label: 'Download As',
      run: args.onSaveAs,
      disabled: !modelLoaded
    },
    {
      id: 'overlayExport',
      label: 'Export overlay…',
      run: args.onOverlayExport,
      disabled: !modelLoaded || !overlayHasEntries,
      title: !modelLoaded ? 'No model loaded' : !overlayHasEntries ? 'No overlay entries to export' : undefined
    },
    {
      id: 'overlayExportCsvLong',
      label: 'Export overlay (CSV long)…',
      run: args.onOverlayExportCsvLong,
      disabled: !modelLoaded || !overlayHasEntries,
      title: !modelLoaded ? 'No model loaded' : !overlayHasEntries ? 'No overlay entries to export' : undefined
    },
    {
      id: 'overlayImport',
      label: 'Import overlay…',
      run: args.onOverlayImport,
      disabled: !modelLoaded,
      title: !modelLoaded ? 'No model loaded' : undefined
    },
    {
      id: 'overlayImportCsvLong',
      label: 'Import overlay (CSV long)…',
      run: args.onOverlayImportCsvLong,
      disabled: !modelLoaded,
      title: !modelLoaded ? 'No model loaded' : undefined
    },
    {
      id: 'overlayReport',
      label: 'Overlay resolve report…',
      run: args.onOverlayReport,
      disabled: !modelLoaded || !overlayReportAvailable,
      title: !modelLoaded ? 'No model loaded' : !overlayReportAvailable ? 'No overlay import run yet' : undefined
    },
    {
      id: 'overlayManage',
      label: 'Manage overlay…',
      run: args.onOverlayManage,
      disabled: !modelLoaded || !overlayHasEntries,
      title: !modelLoaded
        ? 'No model loaded'
        : !overlayHasEntries
          ? 'No overlay entries'
          : overlayHasIssues
            ? 'Resolve orphans and ambiguous entries'
            : 'Review overlay entries'
    },
    // NOTE: kept for backward compatibility with existing UI that had both "Properties" and "Model".
    {
      id: 'model',
      label: 'Model',
      run: args.onModel,
      disabled: !modelLoaded
    },
    {
      id: 'about',
      label: 'About',
      run: args.onAbout
    }
  ];
}

export type ModelActionId =
  | 'new'
  | 'datasets'
  | 'load'
  | 'properties'
  | 'save'
  | 'saveAs'
  | 'exportBackup'
  | 'importBackup'
  | 'model'
  | 'about'
  | 'publish';

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
  onNew: () => void;
  onDatasets: () => void;
  onLoad: () => void;
  onProperties: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onModel: () => void;
  onAbout: () => void;
  onPublish: () => void;
};

/**
 * Central place that defines what actions exist, their display labels, and enabled/disabled state.
 * Keeps UI components (menus/toolbars/shortcuts) consistent.
 */
export function buildModelActionRegistry(args: BuildRegistryArgs): ModelAction[] {
  const { modelLoaded, isDirty } = args;

  return [
    {
      id: 'new',
      label: 'New',
      run: args.onNew
    },
    {
      id: 'datasets',
      label: 'Local datasets…',
      run: args.onDatasets
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
      id: 'exportBackup',
      label: 'Export dataset backup…',
      run: args.onExportBackup,
      disabled: !modelLoaded,
      title: !modelLoaded ? 'No model loaded' : 'Export a local backup bundle for this dataset'
    },
    {
      id: 'importBackup',
      label: 'Import dataset backup…',
      run: args.onImportBackup,
      title: 'Import a previously exported dataset backup (creates a new local dataset)'
    },
    // NOTE: kept for backward compatibility with existing UI that had both "Properties" and "Model".
    {
      id: 'model',
      label: 'Model',
      run: args.onModel,
      disabled: !modelLoaded
    },
    {
      id: 'publish',
      label: 'Publish to Portal…',
      run: args.onPublish,
      disabled: !modelLoaded,
      title: !modelLoaded ? 'No model loaded' : undefined
    },
    {
      id: 'about',
      label: 'About',
      run: args.onAbout
    }
  ];
}

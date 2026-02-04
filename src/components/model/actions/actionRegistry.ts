export type ModelActionId =
  | 'new'
  | 'load'
  | 'properties'
  | 'save'
  | 'saveAs'
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
  onNew: () => void;
  onLoad: () => void;
  onProperties: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onModel: () => void;
  onAbout: () => void;
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

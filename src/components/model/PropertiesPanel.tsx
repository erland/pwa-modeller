import { useMemo } from 'react';

import { gatherFolderOptions } from '../../domain';
import type { FolderOption, Model } from '../../domain';
import { modelStore, useModelStore } from '../../store';
import type { Selection } from './selection';

import type { ModelActions } from './properties/actions';
import { ElementProperties } from './properties/ElementProperties';
import { FolderProperties } from './properties/FolderProperties';
import { ModelProperties } from './properties/ModelProperties';
import { RelationshipProperties } from './properties/RelationshipProperties';
import { ViewNodeProperties } from './properties/ViewNodeProperties';
import { ViewProperties } from './properties/ViewProperties';
import { findFolderByKind } from './properties/utils';

type Props = {
  selection: Selection;
  onSelect?: (selection: Selection) => void;
  onEditModelProps: () => void;
};

function buildFolderOptions(model: Model): { elementFolders: FolderOption[]; viewFolders: FolderOption[] } {
  // Step 1 (mixed navigator): folders can contain both elements and views.
  // Use a unified folder option list rooted at the model root so both properties editors stay consistent.
  const root = findFolderByKind(model, 'root');
  const all = gatherFolderOptions(model, root.id);
  return { elementFolders: all, viewFolders: all };
}

export function PropertiesPanel({ selection, onSelect, onEditModelProps }: Props) {
  const model = useModelStore((s) => s.model);

  const actions = useMemo<ModelActions>(
  () => ({
    // Wrap store methods so `this` stays bound to modelStore (some store methods use `this.updateModel`).
    renameFolder: (folderId, name) => modelStore.renameFolder(folderId, name),
    deleteFolder: (folderId) => modelStore.deleteFolder(folderId),

    updateViewNodeLayout: (viewId, elementId, patch) => modelStore.updateViewNodeLayout(viewId, elementId, patch),

    updateElement: (elementId, patch) => modelStore.updateElement(elementId, patch),
    moveElementToFolder: (elementId, folderId) => modelStore.moveElementToFolder(elementId, folderId),
    deleteElement: (elementId) => modelStore.deleteElement(elementId),

    updateRelationship: (relationshipId, patch) => modelStore.updateRelationship(relationshipId, patch),
    deleteRelationship: (relationshipId) => modelStore.deleteRelationship(relationshipId),

    updateView: (viewId, patch) => modelStore.updateView(viewId, patch),
    moveViewToFolder: (viewId, folderId) => modelStore.moveViewToFolder(viewId, folderId),
    moveViewToElement: (viewId, elementId) => modelStore.moveViewToElement(viewId, elementId),
    updateViewFormatting: (viewId, patch) => modelStore.updateViewFormatting(viewId, patch),
    cloneView: (viewId) => modelStore.cloneView(viewId),
    deleteView: (viewId) => modelStore.deleteView(viewId)
  }),
  []
);

  const options = useMemo(() => {
    if (!model) return { elementFolders: [] as FolderOption[], viewFolders: [] as FolderOption[] };
    return buildFolderOptions(model);
  }, [model]);

  if (!model) {
    return (
      <div>
        <p className="panelHint">No model loaded yet.</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Selection</div>
            <div className="propertiesValue">—</div>
          </div>
        </div>
      </div>
    );
  }

  switch (selection.kind) {
    case 'folder':
      return <FolderProperties model={model} folderId={selection.folderId} actions={actions} />;
    case 'viewNode':
      return (
        <ViewNodeProperties
          model={model}
          viewId={selection.viewId}
          elementId={selection.elementId}
          actions={actions}
          elementFolders={options.elementFolders}
        />
      );
    case 'element':
      return (
        <ElementProperties
          model={model}
          elementId={selection.elementId}
          actions={actions}
          elementFolders={options.elementFolders}
          onSelect={onSelect}
        />
      );
    case 'relationship':
      return (
        <RelationshipProperties
          model={model}
          relationshipId={selection.relationshipId}
          actions={actions}
          onSelect={onSelect}
        />
      );
    case 'view':
      return (
        <ViewProperties
          model={model}
          viewId={selection.viewId}
          viewFolders={options.viewFolders}
          actions={actions}
          onSelect={onSelect}
        />
      );
    case 'model':
    case 'none':
    default:
      return <ModelProperties model={model} onEditModelProps={onEditModelProps} />;
  }
}

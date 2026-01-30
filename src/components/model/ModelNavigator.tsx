import { useMemo, useState } from 'react';

import { modelStore, useModelStore } from '../../store';
import '../../styles/navigator.css';

import type { Selection } from './selection';
import { ModelNavigatorTree } from './navigator/ModelNavigatorTree';
import { NavigatorToolbar } from './navigator/NavigatorToolbar';
import { buildNavigatorTreeData } from './navigator/buildNavigatorTree';
import { findFolderByKind } from './navigator/navUtils';
import { useNavigatorState } from './navigator/useNavigatorState';
import { CreateElementDialog } from './navigator/dialogs/CreateElementDialog';
import { CreateFolderDialog } from './navigator/dialogs/CreateFolderDialog';
import { CreateViewDialog } from './navigator/dialogs/CreateViewDialog';
import { DeleteFolderDialog } from './navigator/dialogs/DeleteFolderDialog';

type Props = {
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

export function ModelNavigator({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);
  const isDirty = useModelStore((s) => s.isDirty);
  const fileName = useModelStore((s) => s.fileName);

  const [searchQuery, setSearchQuery] = useState('');
  const searchTerm = searchQuery.trim().toLowerCase();

  // Dialog targets
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);

  const [createElementOpen, setCreateElementOpen] = useState(false);
  const [createElementFolderId, setCreateElementFolderId] = useState<string | null>(null);
  const [createElementKind, setCreateElementKind] = useState<'archimate' | 'uml' | 'bpmn'>('archimate');

  const [createViewOpen, setCreateViewOpen] = useState(false);
  const [createViewFolderId, setCreateViewFolderId] = useState<string | null>(null);
  const [createViewInitialKind, setCreateViewInitialKind] = useState<'archimate' | 'uml' | 'bpmn'>('archimate');
  const [createViewOwnerElementId, setCreateViewOwnerElementId] = useState<string | null>(null);

  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  const rootFolder = useMemo(() => {
    if (!model) return null;
    return findFolderByKind(model, 'root');
  }, [model]);

  const treeData = useMemo(() => {
    if (!model || !rootFolder) return null;
    return buildNavigatorTreeData({
      model,
      rootFolderId: rootFolder.id,
      searchTerm
    });
  }, [model, rootFolder, searchTerm]);

  const nav = useNavigatorState({ model, treeData, searchTerm, selection, onSelect });

  const openCreateFolder = (parentFolderId: string) => {
    setCreateFolderParentId(parentFolderId);
  };

  const openCreateElement = (targetFolderId?: string, kind: 'archimate' | 'uml' | 'bpmn' = 'archimate') => {
    if (!rootFolder) return;
    setCreateElementFolderId(targetFolderId ?? rootFolder.id);
    setCreateElementKind(kind);
    setCreateElementOpen(true);
  };

  const openCreateView = (opts: { targetFolderId?: string; ownerElementId?: string; initialKind?: 'archimate' | 'uml' | 'bpmn' } = {}) => {
    if (!rootFolder) return;
    setCreateViewFolderId(opts.targetFolderId ?? rootFolder.id);
    setCreateViewOwnerElementId(opts.ownerElementId ?? null);
    setCreateViewInitialKind(opts.initialKind ?? 'archimate');
    setCreateViewOpen(true);
  };

  if (!model || !rootFolder || !treeData) {
    return (
      <div className="navigator">
        <div className="navigatorHeader">
          <div className="navigatorModelName">No model loaded</div>
          <div className="navigatorMeta">Use New/Open in the header to begin.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="navigator">
      <NavigatorToolbar
        model={model}
        isDirty={isDirty}
        fileName={fileName}
        rootFolderId={rootFolder.id}
        selection={selection}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onCreateFolder={openCreateFolder}
        onCreateElement={openCreateElement}
        onCreateView={openCreateView}
      />

      <div className="navTreeWrap" onKeyDown={nav.onTreeKeyDown}>
        <ModelNavigatorTree
          rootFolderId={rootFolder.id}
          treeData={treeData}
          selectedKey={nav.selectedKey}
          expandedKeys={nav.expandedKeys}
          setExpandedKeys={nav.setExpandedKeys}
          handleSelectionChange={nav.handleSelectionChange}
          editingKey={nav.editingKey}
          editingValue={nav.editingValue}
          setEditingValue={nav.setEditingValue}
          editInputRef={nav.editInputRef}
          startEditing={nav.startEditing}
          commitEditing={nav.commitEditing}
          clearEditing={nav.clearEditing}
          openCreateFolder={openCreateFolder}
          openCreateElement={openCreateElement}
          openCreateView={openCreateView}
          onMoveElementToFolder={(elementId, targetFolderId) => {
            // Action is on the store instance (not part of the Zustand state snapshot).
            modelStore.moveElementToFolder(elementId, targetFolderId);
          }}
          onMoveViewToFolder={(viewId, targetFolderId) => {
            modelStore.moveViewToFolder(viewId, targetFolderId);
          }}
          onMoveViewToElement={(viewId, targetElementId) => {
            modelStore.moveViewToElement(viewId, targetElementId);
          }}
          onMoveFolderToFolder={(folderId, targetFolderId) => {
            modelStore.moveFolderToFolder(folderId, targetFolderId);
          }}
/>
      </div>

      <DeleteFolderDialog
        model={model}
        rootFolderId={rootFolder.id}
        folderId={deleteFolderId}
        selection={selection}
        onSelect={onSelect}
        onClose={() => setDeleteFolderId(null)}
      />

      <CreateFolderDialog parentFolderId={createFolderParentId} onClose={() => setCreateFolderParentId(null)} />

      <CreateElementDialog
        isOpen={createElementOpen}
        targetFolderId={createElementFolderId ?? rootFolder.id}
        kind={createElementKind}
        onClose={() => setCreateElementOpen(false)}
        onSelect={onSelect}
      />

      <CreateViewDialog
        isOpen={createViewOpen}
        targetFolderId={createViewFolderId ?? rootFolder.id}
        ownerElementId={createViewOwnerElementId ?? undefined}
        initialKind={createViewInitialKind}
        onClose={() => {
          setCreateViewOpen(false);
          setCreateViewOwnerElementId(null);
        }}
        onSelect={onSelect}
      />

    </div>
  );
}

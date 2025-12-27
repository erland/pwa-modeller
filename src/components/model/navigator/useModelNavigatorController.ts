import { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from '@react-types/shared';

import type { Model } from '../../../domain';
import type { NavNode } from './types';
import { parseKey, selectionToKey } from './treeKeys';
import { modelStore } from '../../../store/modelStore';
import type { Selection } from '../selection';

type Args = {
  model: Model | null;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  roots: { elementsRoot: { id: string }; viewsRoot: { id: string } } | null;
};

export function useModelNavigatorController({ model, selection, onSelect, roots }: Args) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchTerm = searchQuery.trim().toLowerCase();

  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(new Set());

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  const [createElementOpen, setCreateElementOpen] = useState(false);
  const [createElementFolderId, setCreateElementFolderId] = useState<string | null>(null);

  const [createViewOpen, setCreateViewOpen] = useState(false);
  const [createViewFolderId, setCreateViewFolderId] = useState<string | null>(null);

  const [createRelationshipOpen, setCreateRelationshipOpen] = useState(false);
  const [createRelationshipPrefillSourceId, setCreateRelationshipPrefillSourceId] = useState<string | null>(null);

  const selectedKey = useMemo(() => selectionToKey(selection), [selection]);

  function openCreateFolder(parentFolderId: string) {
    setCreateFolderParentId(parentFolderId);
  }

  function openCreateElement(targetFolderId?: string) {
    if (!roots) return;
    setCreateElementFolderId(targetFolderId ?? roots.elementsRoot.id);
    setCreateElementOpen(true);
  }

  function openCreateView(targetFolderId?: string) {
    if (!roots) return;
    setCreateViewFolderId(targetFolderId ?? roots.viewsRoot.id);
    setCreateViewOpen(true);
  }

  function openCreateRelationship(prefillSourceElementId?: string) {
    setCreateRelationshipPrefillSourceId(prefillSourceElementId ?? null);
    setCreateRelationshipOpen(true);
  }

  function clearEditing() {
    setEditingKey(null);
    setEditingValue('');
  }

  function startEditing(node: NavNode) {
    setEditingKey(node.key);
    setEditingValue(node.label);
    queueMicrotask(() => editInputRef.current?.focus());
  }

  function commitEditing() {
    if (!model) return;
    if (!editingKey) return;
    const nextName = editingValue.trim();
    if (!nextName) {
      clearEditing();
      return;
    }

    const parsed = parseKey(editingKey);
    if (!parsed) {
      clearEditing();
      return;
    }

    try {
      if (parsed.kind === 'folder') {
        modelStore.renameFolder(parsed.id, nextName);
      } else if (parsed.kind === 'element') {
        modelStore.updateElement(parsed.id, { name: nextName });
      } else if (parsed.kind === 'view') {
        modelStore.updateView(parsed.id, { name: nextName });
      }
    } catch {
      // If rename fails (e.g. root folder), just exit edit mode.
    } finally {
      clearEditing();
    }
  }

  function handleSelectionChange(keys: unknown) {
    if (editingKey) clearEditing();
    const key = Array.isArray(keys) ? keys[0] : keys instanceof Set ? Array.from(keys)[0] : keys;
    if (!key || typeof key !== 'string') return;

    const parsed = parseKey(key);
    if (!parsed) return;

    switch (parsed.kind) {
      case 'folder':
        onSelect({ kind: 'folder', folderId: parsed.id });
        return;
      case 'element':
        onSelect({ kind: 'element', elementId: parsed.id });
        return;
      case 'view':
        onSelect({ kind: 'view', viewId: parsed.id });
        return;
      case 'relationship':
        onSelect({ kind: 'relationship', relationshipId: parsed.id });
        return;
      case 'section':
      default:
        onSelect({ kind: 'model' });
        return;
    }
  }

  // When closing the create folder dialog, restore focus to the tree for keyboard nav.
  useEffect(() => {
    if (createFolderParentId === null) {
      // noop
    }
  }, [createFolderParentId]);

  return {
    // Search
    searchQuery,
    setSearchQuery,
    searchTerm,

    // Tree expansion
    expandedKeys,
    setExpandedKeys,

    // Selection
    selectedKey,
    handleSelectionChange,

    // Inline rename
    editingKey,
    editingValue,
    setEditingValue,
    editInputRef,
    startEditing,
    commitEditing,
    clearEditing,

    // Dialogs
    createFolderParentId,
    setCreateFolderParentId,
    openCreateFolder,

    deleteFolderId,
    setDeleteFolderId,

    createElementOpen,
    setCreateElementOpen,
    createElementFolderId,
    openCreateElement,

    createViewOpen,
    setCreateViewOpen,
    createViewFolderId,
    openCreateView,

    createRelationshipOpen,
    setCreateRelationshipOpen,
    createRelationshipPrefillSourceId,
    openCreateRelationship
  };
}

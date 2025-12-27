import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { Key } from '@react-types/shared';

import type { Model } from '../../../domain';
import { modelStore } from '../../../store';
import type { Selection } from '../selection';
import type { NavNode } from './types';
import {
  expandAllWithChildren,
  findNodeByKey,
  parseKey,
  selectionToKey
} from './navUtils';

type Args = {
  model: Model | null;
  treeData: NavNode[] | null;
  searchTerm: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

export function useNavigatorState({ model, treeData, searchTerm, selection, onSelect }: Args) {
  // Expansion state (default: expand everything, keeps the tree explorer-like)
  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(new Set());

  // Inline rename state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const selectedKey = selectionToKey(selection);

  // Expand all nodes that have children when the tree data changes.
  useEffect(() => {
    if (!treeData) return;
    setExpandedKeys(expandAllWithChildren(treeData));
  }, [model?.id, searchTerm, treeData]);

  function clearEditing() {
    setEditingKey(null);
    setEditingValue('');
  }

  function startEditing(node: NavNode) {
    if (!node.canRename) return;
    setEditingKey(node.key);
    setEditingValue(node.label);
    // focus after next render
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
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
    // react-aria-components uses Set<Key> for single selection.
    const set = keys as Set<Key>;
    const first = set?.values?.().next?.().value as string | undefined;
    if (!first) {
      onSelect({ kind: 'model' });
      return;
    }
    const parsed = parseKey(first);
    if (!parsed) {
      onSelect({ kind: 'model' });
      return;
    }
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

  function onTreeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'F2') return;
    const key = selectedKey;
    if (!key) return;
    const node = findNodeByKey(treeData, key);
    if (node) startEditing(node);
  }

  return {
    selectedKey,
    expandedKeys,
    setExpandedKeys,
    editingKey,
    editingValue,
    setEditingValue,
    editInputRef,
    startEditing,
    commitEditing,
    clearEditing,
    handleSelectionChange,
    onTreeKeyDown
  };
}

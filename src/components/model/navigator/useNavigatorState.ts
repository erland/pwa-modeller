import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { Key } from '@react-types/shared';

import type { Model } from '../../../domain';
import { modelStore } from '../../../store';
import type { Selection } from '../selection';
import type { NavNode } from './types';
import {
  collectNodeKeys,
  expandAllWithChildren,
  expandSingleChildChain,
  findNodeByKey,
  findPathToKey,
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
  // Expansion state (default: collapsed; may auto-expand a single-child chain)
  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(new Set());

  // Track whether we've applied the "smart default" expansion for the current model.
  const autoExpandedModelIdRef = useRef<string | null>(null);

  // Inline rename state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const selectedKey = selectionToKey(selection);

  // Expansion policy:
  // - Default: collapsed (show only top-level nodes)
  // - When searching: expand sections so results are visible
  // - When selecting: expand the path to the selected node (and expand the node itself if it has children)
  useEffect(() => {
    // When loading a different model, reset expansion to collapsed.
    setExpandedKeys(new Set());
    autoExpandedModelIdRef.current = null;
  }, [model?.id]);

  useEffect(() => {
    if (!treeData) return;
    if (searchTerm) return;
    // Apply smart auto-expansion when nothing specific is selected OR when the
    // current selection doesn't exist in the new tree (e.g. after importing a
    // new model while a previous node was selected).
    const selected = selectedKey ? findNodeByKey(treeData, selectedKey) : null;
    const canAutoExpand = selection.kind === 'model' || !selectedKey || !selected;
    if (!canAutoExpand) return;

    const modelId = model?.id ?? null;
    if (autoExpandedModelIdRef.current === modelId) return;

    // Only auto-expand when we are currently fully collapsed.
    if (expandedKeys.size !== 0) {
      autoExpandedModelIdRef.current = modelId;
      return;
    }

    const next = expandSingleChildChain(treeData);
    if (next.size > 0) {
      setExpandedKeys(next);
    }
    autoExpandedModelIdRef.current = modelId;
  }, [model?.id, treeData, searchTerm, selection.kind, selectedKey, expandedKeys.size]);

  useEffect(() => {
    if (!treeData) return;

    // If we're searching, expand everything with children so results are immediately visible.
    if (searchTerm) {
      setExpandedKeys(expandAllWithChildren(treeData));
      return;
    }

    // Otherwise, keep the current expanded keys but prune keys that no longer exist.
    setExpandedKeys((prev) => {
      const existing = collectNodeKeys(treeData);
      const next = new Set<Key>();
      for (const k of prev) {
        if (existing.has(k)) next.add(k);
      }
      return next;
    });
  }, [searchTerm, treeData]);

  useEffect(() => {
    if (!treeData) return;
    if (searchTerm) return; // handled by the search expansion effect

    const key = selectedKey;
    if (!key) return;

    const path = findPathToKey(treeData, key);
    if (!path) return;

    // Expand ancestors to reveal the selection.
    const nextKeys = new Set<Key>();
    for (let i = 0; i < path.length - 1; i++) {
      nextKeys.add(path[i]!.key);
    }

    // If the selected node has children, expand it one level.
    const selectedNode = path[path.length - 1];
    if (selectedNode?.children && selectedNode.children.length > 0) {
      nextKeys.add(selectedNode.key);
    }

    setExpandedKeys((prev) => {
      let changed = false;
      const merged = new Set<Key>(prev);
      for (const k of nextKeys) {
        if (!merged.has(k)) {
          merged.add(k);
          changed = true;
        }
      }
      return changed ? merged : prev;
    });
  }, [selectedKey, searchTerm, treeData]);

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
      // iOS/Safari can transiently emit an empty selection set on touchend
      // (effectively a deselect). We keep the previous selection instead of
      // snapping back to the model/root, since selection is controlled by
      // Workspace state and will re-assert the last selected key.
      return;
    }
    const parsed = parseKey(first);
    if (!parsed) {
      // Same reasoning as above: ignore transient/invalid selection changes.
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

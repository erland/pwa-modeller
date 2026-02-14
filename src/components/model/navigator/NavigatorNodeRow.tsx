import type * as React from 'react';
import type { Key } from '@react-types/shared';
import { Button } from 'react-aria-components';

import type { NavNode } from './types';
import { NavigatorNodeActionsMenu } from './NavigatorNodeActionsMenu';
import { useNavigatorRowDnd } from './useNavigatorRowDnd';
import type { ModelKind } from '../../../domain';
import type { Selection } from '../selection';

type Props = {
  node: NavNode;
  depth: number;
  icon: string;
  title: string;
  hasChildren: boolean;
  isExpanded: boolean;

  // Selection / expand
  selectedKeys: Set<Key>;
  getRecentMultiSelectedElementIds: () => string[];
  restoreRecentMultiSelectionForDrag: (draggedElementId: string | null | undefined) => void;
  toggleExpanded: (nodeKey: string) => void;

  // Inline rename state
  isEditing: boolean;
  editingValue: string;
  setEditingValue: React.Dispatch<React.SetStateAction<string>>;
  editInputRef: React.RefObject<HTMLInputElement>;
  startEditing: (node: NavNode) => void;
  commitEditing: () => void;
  clearEditing: () => void;

  // Create actions
  openCreateFolder: (parentFolderId: string) => void;
  openCreateElement: (targetFolderId?: string, kind?: ModelKind) => void;
  openCreateView: (opts?: { targetFolderId?: string; ownerElementId?: string; initialKind?: ModelKind }) => void;
  onSelect: (selection: Selection) => void;
};

export function NavigatorNodeRow({
  node,
  depth,
  icon,
  title,
  hasChildren,
  isExpanded,
  selectedKeys,
  getRecentMultiSelectedElementIds,
  restoreRecentMultiSelectionForDrag,
  toggleExpanded,
  isEditing,
  editingValue,
  setEditingValue,
  editInputRef,
  startEditing,
  commitEditing,
  clearEditing,
  openCreateFolder,
  openCreateElement,
  openCreateView,
  onSelect
}: Props) {
  const { draggable, onDragStart, onDragEnd } = useNavigatorRowDnd(
    node,
    selectedKeys,
    getRecentMultiSelectedElementIds,
    restoreRecentMultiSelectionForDrag
  );

  const focusTreeRow = (current: HTMLElement) => {
    const row = current.closest('[role="row"]') as HTMLElement | null;
    row?.focus?.();
  };

  const handleRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    // Avoid interfering with the chevron, inline rename input, or action buttons/menus.
    if (target?.closest('[data-chevron="1"]')) return;
    if (target?.closest('.navTreeActions')) return;
    if (target?.closest('input')) return;

    // Keep focus behavior reliable for keyboard actions without forcing selection semantics.
    // Selection is handled by React Aria's Tree (with selectionBehavior="replace").
    focusTreeRow(e.currentTarget);
  };

  return (
    <div
      className="navTreeRow"
      data-kind={node.kind}
      data-scope={node.scope}
      data-nodekey={node.key}
      data-folderid={node.kind === 'folder' ? node.folderId : undefined}
            data-elementid={node.kind === 'element' ? node.elementId : undefined}
      data-viewid={node.kind === 'view' ? node.viewId : undefined}
      data-drop-folder={node.kind === 'folder' ? 'folder' : undefined}
      title={title}
      draggable={draggable}
      onPointerDown={handleRowPointerDown}
      onClick={(e: React.MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-chevron="1"]')) return;
        if (target?.closest('.navTreeActions')) return;
        if (target?.closest('input')) return;
        e.preventDefault();
        e.stopPropagation();
        focusTreeRow(e.currentTarget as HTMLElement);
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={(e: React.MouseEvent) => {
        // Let the Tree handle selection/focus. We only use double-click as a convenience action.
        const target = e.target as HTMLElement | null;
        if (target && (target.closest('[data-chevron="1"]') || target.closest('.navTreeActions'))) return;
        if (hasChildren) {
          e.preventDefault();
          toggleExpanded(node.key);
        } else if (node.canRename) {
          e.preventDefault();
          startEditing(node);
        }
      }}
    >
      {depth > 0 ? (
        <>
          <span className="navTreeIndent" aria-hidden style={{ width: depth * 12 }} />
          <span className="navTreeConnector" aria-hidden />
        </>
      ) : null}

      {hasChildren ? (
        // React Aria requires an explicit chevron button for expandable items for accessibility.
        // See: Tree docs "Collapse and expand button".
        <Button
          slot="chevron"
          className="navTreeChevronButton"
          data-chevron="1"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <span className="navTreeChevron" aria-hidden>
            {isExpanded ? '▾' : '▸'}
          </span>
        </Button>
      ) : (
        <span className="navTreeChevronSpacer" aria-hidden />
      )}

      <span className="navTreeIcon" aria-hidden>
        {icon}
      </span>

      {isEditing ? (
        <input
          ref={editInputRef}
          className="textInput navInlineRename"
          aria-label="Rename"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEditing();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              clearEditing();
            }
          }}
          onBlur={() => commitEditing()}
        />
      ) : (
        <span className="navTreeLabel">{node.label}</span>
      )}

      {/* Secondary count badges were removed to save horizontal space on small screens. */}
      <NavigatorNodeActionsMenu
        node={node}
        openCreateFolder={openCreateFolder}
        openCreateElement={openCreateElement}
        openCreateView={openCreateView}
        onSelect={onSelect}
      />
    </div>
  );
}
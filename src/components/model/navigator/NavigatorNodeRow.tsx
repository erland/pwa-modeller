import type * as React from 'react';
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover
} from 'react-aria-components';

import type { Selection } from '../selection';
import type { NavNode } from './types';
import { DND_ELEMENT_MIME } from './types';

type Props = {
  node: NavNode;
  depth: number;
  icon: string;
  title: string;
  showBadge: boolean;
  hasChildren: boolean;
  isExpanded: boolean;

  // Selection / expand
  handleSelectionChange: (keys: unknown) => void;
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
  selection: Selection;
  openCreateFolder: (parentFolderId: string) => void;
  openCreateElement: (targetFolderId?: string) => void;
  openCreateView: (targetFolderId?: string) => void;
  openCreateRelationship: (prefillSourceElementId?: string) => void;
  onRequestDeleteFolder: (folderId: string) => void;
};

export function NavigatorNodeRow({
  node,
  depth,
  icon,
  title,
  showBadge,
  hasChildren,
  isExpanded,
  handleSelectionChange,
  toggleExpanded,
  isEditing,
  editingValue,
  setEditingValue,
  editInputRef,
  startEditing,
  commitEditing,
  clearEditing,
  selection,
  openCreateFolder,
  openCreateElement,
  openCreateView,
  openCreateRelationship,
  onRequestDeleteFolder
}: Props) {
  // Single "Create…" button (Explorer/Finder-like) with a menu for all create actions
  // relevant to this node.
  const canShowCreateMenu =
    Boolean(node.canCreateFolder && node.folderId) ||
    Boolean(node.canCreateElement && node.folderId) ||
    Boolean(node.canCreateView && node.folderId) ||
    Boolean(node.canCreateRelationship);

  const actions = (
    <span className="navTreeActions" aria-label="Node actions">
      {canShowCreateMenu ? (
        <MenuTrigger>
          <Button className="miniButton" aria-label="Create…">＋</Button>
          <Popover className="navMenuPopover">
            <Menu
              className="navMenu"
              onAction={(key) => {
                const k = String(key);
                if (k === 'folder' && node.folderId) {
                  openCreateFolder(node.folderId);
                } else if (k === 'element' && node.folderId) {
                  openCreateElement(node.folderId);
                } else if (k === 'view' && node.folderId) {
                  openCreateView(node.folderId);
                } else if (k === 'relationship') {
                  const prefill = selection.kind === 'element' ? selection.elementId : undefined;
                  openCreateRelationship(prefill);
                }
              }}
            >
              {node.canCreateFolder && node.folderId ? (
                <MenuItem className="navMenuItem" id="folder">Folder…</MenuItem>
              ) : null}
              {node.canCreateElement && node.folderId ? (
                <MenuItem className="navMenuItem" id="element">Element…</MenuItem>
              ) : null}
              {node.canCreateView && node.folderId ? (
                <MenuItem className="navMenuItem" id="view">View…</MenuItem>
              ) : null}
              {node.canCreateRelationship ? (
                <MenuItem className="navMenuItem" id="relationship">Relationship…</MenuItem>
              ) : null}
            </Menu>
          </Popover>
        </MenuTrigger>
      ) : null}

      {node.canRename ? (
        <Button
          className="miniButton"
          aria-label="Rename"
          onPress={() => {
            startEditing(node);
          }}
        >
          ✎
        </Button>
      ) : null}

      {node.canDelete && node.folderId ? (
        <Button
          className="miniButton"
          aria-label="Delete folder"
          onPress={() => {
            onRequestDeleteFolder(node.folderId!);
          }}
        >
          🗑
        </Button>
      ) : null}
    </span>
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

    // Some environments (notably tests) can be sensitive to focus/selection propagation.
    // Selecting + focusing the Tree row here keeps keyboard actions (e.g., Delete) reliable.
    handleSelectionChange(new Set([node.key]));
    focusTreeRow(e.currentTarget);
  };

  return (
    <div
      className="navTreeRow"
      data-kind={node.kind}
      data-nodekey={node.key}
      title={title}
      draggable={node.kind === 'element' && Boolean(node.elementId)}
      onPointerDown={handleRowPointerDown}
      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
        if (node.kind !== 'element' || !node.elementId) return;
        // Ensure the element is selected when starting a drag (helps with keyboard-only drop flows later).
        // NOTE: We intentionally do NOT stop propagation here; the Tree should remain in control of focus/selection.
        handleSelectionChange(new Set([node.key]));
        focusTreeRow(e.currentTarget);
        try {
          e.dataTransfer.setData(DND_ELEMENT_MIME, node.elementId);
          // Fallback to plain text for debugging / other drop targets.
          e.dataTransfer.setData('text/plain', node.elementId);
          e.dataTransfer.effectAllowed = 'copy';
        } catch {
          // Ignore (some test environments may not fully implement DataTransfer)
        }
      }}
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
          <span className="navTreeIndent" aria-hidden style={{ width: depth * 14 }} />
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

      {showBadge ? <span className="navTreeSecondary">{node.secondary}</span> : null}
      {actions}
    </div>
  );
}

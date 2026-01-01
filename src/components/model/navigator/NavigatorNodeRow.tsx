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

const DND_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('pwaModellerDndDebug') === '1';
function dndLog(...args: unknown[]) {
  if (!DND_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log('[PWA Modeller DND]', ...args);
}

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
  openCreateCenteredView: (elementId: string) => void;
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
  openCreateCenteredView,
  openCreateRelationship,
  onRequestDeleteFolder
}: Props) {
  // Single "Create…" button (Explorer/Finder-like) with a menu for all create actions
  // relevant to this node.
  const canShowCreateMenu =
    (Boolean(node.canCreateFolder && node.folderId) ||
      Boolean(node.canCreateElement && node.folderId) ||
      Boolean(node.canCreateView && node.folderId) ||
      Boolean(node.canCreateCenteredView && node.elementId)) ||
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
                } else if (k === 'centeredView' && node.elementId) {
                  openCreateCenteredView(node.elementId);
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
              {node.canCreateCenteredView && node.elementId ? (
                <MenuItem className="navMenuItem" id="centeredView">Centered view…</MenuItem>
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
      data-scope={node.scope}
      data-nodekey={node.key}
      data-folderid={node.kind === 'folder' ? node.folderId : undefined}
      data-drop-folder={node.kind === 'folder' ? 'folder' : undefined}
      title={title}
      draggable={node.kind === 'element' && Boolean(node.elementId)}
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
      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
        dndLog('tree dragstart (before setData)', {
          key: node.key,
          elementId: node.elementId,
          types: Array.from(e.dataTransfer?.types ?? []),
        });
        if (node.kind !== 'element' || !node.elementId) return;
        try {
          e.dataTransfer.setData(DND_ELEMENT_MIME, node.elementId);
          e.dataTransfer.setData('text/plain', node.elementId);
          // Allow both copy (tree -> view) and move (tree -> folder).
          e.dataTransfer.effectAllowed = 'copyMove';
          try {
            const ghost = document.createElement('div');
            ghost.textContent = node.label;
            ghost.style.position = 'fixed';
            ghost.style.top = '0';
            ghost.style.left = '0';
            ghost.style.padding = '6px 10px';
            ghost.style.borderRadius = '10px';
            ghost.style.background = 'rgba(0,0,0,0.75)';
            ghost.style.color = 'white';
            ghost.style.fontSize = '12px';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '999999';
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 10, 10);
            setTimeout(() => ghost.remove(), 0);
          } catch {
            // ignore
          }
          dndLog('tree dragstart (after setData)', {
            key: node.key,
            elementId: node.elementId,
            types: Array.from(e.dataTransfer?.types ?? []),
          });
        } catch {
          // Ignore (some test environments may not fully implement DataTransfer)
        }
      }}
      onDragEnd={(e: React.DragEvent<HTMLDivElement>) => {
        dndLog('tree dragend', {
          key: node.key,
          elementId: node.elementId,
          dropEffect: (e.dataTransfer && (e.dataTransfer as any).dropEffect) || undefined,
          effectAllowed: (e.dataTransfer && (e.dataTransfer as any).effectAllowed) || undefined,
        });
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

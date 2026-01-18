import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';

import type { NavNode } from './types';
import type { ModelKind } from '../../../domain';

type Props = {
  node: NavNode;
  openCreateFolder: (parentFolderId: string) => void;
  openCreateElement: (targetFolderId?: string, kind?: ModelKind) => void;
  openCreateView: (opts?: { targetFolderId?: string; ownerElementId?: string; initialKind?: ModelKind }) => void;
};

export function NavigatorNodeActionsMenu({ node, openCreateFolder, openCreateElement, openCreateView }: Props) {
  // Single "Create…" button (Explorer/Finder-like) with a menu for all create actions relevant to this node.
  const canShowCreateMenu =
    (Boolean(node.canCreateFolder && node.folderId)
      || Boolean(node.canCreateElement && node.folderId)
      || Boolean(node.canCreateView && node.folderId)
      || Boolean(node.canCreateCenteredView && node.elementId))
    || false;

  if (!canShowCreateMenu) return null;

  return (
    <span className="navTreeActions" aria-label="Node actions">
      <MenuTrigger>
        <Button className="miniButton" aria-label="Create…">＋</Button>
        <Popover className="navMenuPopover">
          <Menu
            className="navMenu"
            onAction={(key) => {
              const k = String(key);
              if (k === 'folder' && node.folderId) {
                openCreateFolder(node.folderId);
              } else if (k === 'archimateElement' && node.folderId) {
                openCreateElement(node.folderId, 'archimate');
              } else if (k === 'umlElement' && node.folderId) {
                openCreateElement(node.folderId, 'uml');
              } else if (k === 'view') {
                if (node.folderId) {
                  openCreateView({ targetFolderId: node.folderId });
                } else if (node.elementId) {
                  // Create a view owned by the element. The dialog lets the user pick kind (default ArchiMate).
                  openCreateView({ ownerElementId: node.elementId });
                }
              }
            }}
          >
            {node.canCreateFolder && node.folderId ? (
              <MenuItem className="navMenuItem" id="folder">Folder…</MenuItem>
            ) : null}
            {node.canCreateElement && node.folderId ? (
              <MenuItem className="navMenuItem" id="archimateElement">ArchiMate Element…</MenuItem>
            ) : null}
            {(node.canCreateView && node.folderId) || (node.canCreateCenteredView && node.elementId) ? (
              <MenuItem className="navMenuItem" id="view">View…</MenuItem>
            ) : null}
            {node.canCreateElement && node.folderId ? (
              <MenuItem className="navMenuItem" id="umlElement">UML Element…</MenuItem>
            ) : null}
          </Menu>
        </Popover>
      </MenuTrigger>
    </span>
  );
}

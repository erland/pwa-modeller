import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover
} from 'react-aria-components';

import type { Model, ModelKind } from '../../../domain';
import type { Selection } from '../selection';

type Props = {
  model: Model;
  isDirty: boolean;
  fileName: string | null;
  rootFolderId: string;
  selection: Selection;

  searchQuery: string;
  setSearchQuery: (value: string) => void;

  onCreateFolder: (parentFolderId: string) => void;
  onCreateElement: (targetFolderId?: string, kind?: ModelKind) => void;
  onCreateView: (opts?: { targetFolderId?: string; ownerElementId?: string; initialKind?: ModelKind }) => void;

  /** Multi-select support: add selected elements to the currently open view (if any). */
  currentViewId: string | null;
  multiSelectedElementIds: string[];
  onAddElementsToCurrentView: (viewId: string, elementIds: string[]) => void;
};

export function NavigatorToolbar({
  model,
  isDirty,
  fileName,
  rootFolderId,
  selection,
  searchQuery,
  setSearchQuery,
  onCreateFolder,
  onCreateElement,
  onCreateView,
  currentViewId,
  multiSelectedElementIds,
  onAddElementsToCurrentView
}: Props) {
  return (
    <div className="navigatorHeader">
      <div className="navigatorModelName">
        {model.metadata.name}
        {isDirty ? ' *' : ''}
      </div>
      <div className="navigatorMeta">{fileName ? `File: ${fileName}` : 'Not saved yet'}</div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="textInput"
          aria-label="Search model"
          placeholder="Search elements, views, folders…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery.trim() && (
          <button
            type="button"
            className="miniButton"
            aria-label="Clear model search"
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}


        {currentViewId && multiSelectedElementIds.length > 0 && (
          <button
            type="button"
            className="miniButton"
            aria-label={`Add ${multiSelectedElementIds.length} element(s) to current view`}
            onClick={() => onAddElementsToCurrentView(currentViewId, multiSelectedElementIds)}
            title="Add selected elements to the current view"
          >
            ⇢ View ({multiSelectedElementIds.length})
          </button>
        )}

        <MenuTrigger>
          <Button className="miniButton" aria-label="Create…">
            ＋
          </Button>
          <Popover className="navMenuPopover">
            <Menu
              className="navMenu"
              onAction={(key) => {
                const k = String(key);
                const selectedFolderId = selection.kind === 'folder' ? selection.folderId : null;
                const folderId = selectedFolderId ?? rootFolderId;

                if (k === 'folder') {
                  onCreateFolder(folderId);
                } else if (k === 'archimateElement') {
                  onCreateElement(folderId, 'archimate');
                } else if (k === 'umlElement') {
                  onCreateElement(folderId, 'uml');
                } else if (k === 'view') {
                  // Let the dialog select kind (default ArchiMate).
                  onCreateView({ targetFolderId: folderId });
                }
              }}
            >
              <MenuItem className="navMenuItem" id="folder">
                Folder…
              </MenuItem>
              <MenuItem className="navMenuItem" id="archimateElement">
                ArchiMate Element…
              </MenuItem>
              <MenuItem className="navMenuItem" id="view">
                View…
              </MenuItem>
              <MenuItem className="navMenuItem" id="umlElement">
                UML Element…
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>

      <p className="navHint">Tip: Click to select, use ←/→ to collapse/expand, and F2 (or ✎) to rename.</p>
    </div>
  );
}

import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover
} from 'react-aria-components';

import type { Model } from '../../../domain';
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
  onCreateElement: (targetFolderId?: string) => void;
  onCreateView: (targetFolderId?: string) => void;
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
  onCreateView
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
                } else if (k === 'element') {
                  onCreateElement(folderId);
                } else if (k === 'view') {
                  onCreateView(folderId);
                }
              }}
            >
              <MenuItem className="navMenuItem" id="folder">
                Folder…
              </MenuItem>
              <MenuItem className="navMenuItem" id="element">
                Element…
              </MenuItem>
              <MenuItem className="navMenuItem" id="view">
                View…
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>

      <p className="navHint">Tip: Click to select, use ←/→ to collapse/expand, and F2 (or ✎) to rename.</p>
    </div>
  );
}

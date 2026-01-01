import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover
} from 'react-aria-components';

import type { Model } from '../../domain';
import type { Selection } from './selection';

type Props = {
  model: Model;
  isDirty: boolean;
  fileName: string | null;

  searchQuery: string;
  setSearchQuery: (value: string) => void;

  selection: Selection;
  rootFolderId: string;

  openCreateFolder: (parentFolderId: string) => void;
  openCreateElement: (targetFolderId?: string) => void;
  openCreateView: (targetFolderId?: string) => void;
  openCreateRelationship: (prefillSourceElementId?: string) => void;
};

export function ModelNavigatorHeader({
  model,
  isDirty,
  fileName,
  searchQuery,
  setSearchQuery,
  selection,
  rootFolderId,
  openCreateFolder,
  openCreateElement,
  openCreateView,
  openCreateRelationship
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
          placeholder="Search elements, relationships, views…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery.trim() && (
          <button type="button" className="miniButton" aria-label="Clear model search" onClick={() => setSearchQuery('')}>
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
                  openCreateFolder(folderId);
                } else if (k === 'element') {
                  openCreateElement(folderId);
                } else if (k === 'view') {
                  openCreateView(folderId);
                } else if (k === 'relationship') {
                  const prefill = selection.kind === 'element' ? selection.elementId : undefined;
                  openCreateRelationship(prefill);
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
              <MenuItem className="navMenuItem" id="relationship">
                Relationship…
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>

      <p className="navHint">Tip: Click to select, use ←/→ to collapse/expand, and F2 (or ✎) to rename.</p>
    </div>
  );
}

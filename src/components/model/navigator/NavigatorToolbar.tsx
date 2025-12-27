import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover
} from 'react-aria-components';

import type { Folder, Model } from '../../../domain';
import type { Selection } from '../selection';
import { scopeForFolder } from './navUtils';

type Props = {
  model: Model;
  isDirty: boolean;
  fileName: string | null;
  roots: { elementsRoot: Folder; viewsRoot: Folder };
  selection: Selection;

  searchQuery: string;
  setSearchQuery: (value: string) => void;

  onCreateFolder: (parentFolderId: string) => void;
  onCreateElement: (targetFolderId?: string) => void;
  onCreateView: (targetFolderId?: string) => void;
  onCreateRelationship: (prefillSourceElementId?: string) => void;
};

export function NavigatorToolbar({
  model,
  isDirty,
  fileName,
  roots,
  selection,
  searchQuery,
  setSearchQuery,
  onCreateFolder,
  onCreateElement,
  onCreateView,
  onCreateRelationship
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
                const selectedScope = selectedFolderId ? scopeForFolder(model, roots, selectedFolderId) : 'other';

                if (k === 'folder') {
                  onCreateFolder(selectedFolderId ?? roots.elementsRoot.id);
                } else if (k === 'element') {
                  const folderId =
                    selectedFolderId && selectedScope === 'elements' ? selectedFolderId : roots.elementsRoot.id;
                  onCreateElement(folderId);
                } else if (k === 'view') {
                  const folderId = selectedFolderId && selectedScope === 'views' ? selectedFolderId : roots.viewsRoot.id;
                  onCreateView(folderId);
                } else if (k === 'relationship') {
                  const prefill = selection.kind === 'element' ? selection.elementId : undefined;
                  onCreateRelationship(prefill);
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

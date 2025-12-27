import { useEffect, useMemo, useState } from 'react';

import type { Folder, Model } from '../../../../domain';
import { collectFolderSubtreeIds, gatherFolderOptions } from '../../../../domain';
import { modelStore } from '../../../../store';
import { Dialog } from '../../../dialog/Dialog';
import type { Selection } from '../../selection';
import { scopeForFolder } from '../navUtils';

type Props = {
  model: Model;
  roots: { elementsRoot: Folder; viewsRoot: Folder };
  folderId: string | null;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onClose: () => void;
};

export function DeleteFolderDialog({ model, roots, folderId, selection, onSelect, onClose }: Props) {
  const isOpen = folderId !== null;

  const [mode, setMode] = useState<'move' | 'deleteContents'>('move');
  const [targetId, setTargetId] = useState<string>('');

  // Default to moving contents to parent.
  useEffect(() => {
    if (!isOpen || !folderId) return;
    const folder = model.folders[folderId];
    if (!folder) return;
    setMode('move');
    setTargetId(folder.parentId ?? '');
  }, [isOpen, folderId, model]);

  const dialogBody = useMemo(() => {
    if (!folderId) return <p>…</p>;
    const folder = model.folders[folderId];
    if (!folder) return <p>Folder not found.</p>;

    const scope = scopeForFolder(model, roots, folderId);
    const rootId = scope === 'views' ? roots.viewsRoot.id : roots.elementsRoot.id;
    const subtree = new Set(collectFolderSubtreeIds(model, folderId));
    const options = gatherFolderOptions(model, rootId).filter((o) => !subtree.has(o.id));

    const subtreeFolderIds = collectFolderSubtreeIds(model, folderId);
    let elementCount = 0;
    let viewCount = 0;
    for (const fid of subtreeFolderIds) {
      const f = model.folders[fid];
      if (!f) continue;
      elementCount += f.elementIds.length;
      viewCount += f.viewIds.length;
    }

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ opacity: 0.85 }}>
          <div style={{ fontWeight: 600 }}>{folder.name}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Contains: {subtreeFolderIds.length - 1} subfolder(s), {elementCount} element(s), {viewCount} view(s)
          </div>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input
            type="radio"
            name="deleteFolderMode"
            checked={mode === 'move'}
            onChange={() => setMode('move')}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Move contents to</div>
            <div style={{ marginTop: 6 }}>
              <select
                className="selectInput"
                aria-label="Move folder contents to"
                value={targetId}
                disabled={mode !== 'move'}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                The folder will be removed; its children and items will be moved.
              </div>
            </div>
          </div>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input
            type="radio"
            name="deleteFolderMode"
            checked={mode === 'deleteContents'}
            onChange={() => setMode('deleteContents')}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Delete all contents</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              This will delete all subfolders, elements, and views contained in this folder subtree.
            </div>
          </div>
        </label>
      </div>
    );
  }, [folderId, model, roots, mode, targetId]);

  return (
    <Dialog
      title="Delete folder"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="shellButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              if (!folderId) return;
              const folder = model.folders[folderId];
              if (!folder) return;

              if (mode === 'deleteContents') {
                modelStore.deleteFolder(folderId, { mode: 'deleteContents' });
              } else {
                const target = targetId || folder.parentId || roots.elementsRoot.id;
                modelStore.deleteFolder(folderId, { mode: 'move', targetFolderId: target });
              }

              if (selection.kind === 'folder' && selection.folderId === folderId) {
                onSelect({ kind: 'model' });
              }
              onClose();
            }}
          >
            Delete
          </button>
        </div>
      }
    >
      {dialogBody}
    </Dialog>
  );
}

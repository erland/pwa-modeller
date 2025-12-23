import { useMemo, useState } from 'react';

import type { Folder, Model } from '../../domain';
import { modelStore, useModelStore } from '../../store';
import '../../styles/navigator.css';
import { FolderNameDialog } from './FolderNameDialog';
import type { Selection } from './selection';

type Props = {
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

function sortByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function findFolderByKind(model: Model, kind: Folder['kind']): Folder {
  const found = Object.values(model.folders).find((f) => f.kind === kind);
  if (!found) throw new Error(`Missing required folder kind: ${kind}`);
  return found;
}

function folderContainsSelection(selection: Selection, folderId: string): boolean {
  return selection.kind === 'folder' && selection.folderId === folderId;
}

export function ModelNavigator({ selection, onSelect }: Props) {
  const model = useModelStore((s) => s.model);
  const isDirty = useModelStore((s) => s.isDirty);
  const fileName = useModelStore((s) => s.fileName);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);

  const roots = useMemo(() => {
    if (!model) return null;
    const elementsRoot = findFolderByKind(model, 'elements');
    const viewsRoot = findFolderByKind(model, 'views');
    return { elementsRoot, viewsRoot };
  }, [model]);

  function isExpanded(id: string): boolean {
    return expanded[id] ?? true;
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }

  function renderFolder(modelValue: Model, folderId: string, scope: 'elements' | 'views') {
    const folder = modelValue.folders[folderId];
    const isRootFolder = folder.kind === 'elements' || folder.kind === 'views';
    const children = folder.folderIds.map((id) => modelValue.folders[id]).sort(sortByName);
    const elementLeaves = scope === 'elements' ? folder.elementIds.map((id) => modelValue.elements[id]).filter(Boolean).sort(sortByName) : [];
    const viewLeaves = scope === 'views' ? folder.viewIds.map((id) => modelValue.views[id]).filter(Boolean).sort(sortByName) : [];

    const hasAnyChildren = children.length > 0 || elementLeaves.length > 0 || viewLeaves.length > 0;

    return (
      <li key={folderId}>
        <div className={['navNode', folderContainsSelection(selection, folderId) ? 'isSelected' : null].filter(Boolean).join(' ')}>
          <div className="navNodeMain">
            <button
              type="button"
              className="miniButton"
              aria-label={isExpanded(folderId) ? 'Collapse folder' : 'Expand folder'}
              onClick={() => toggleExpanded(folderId)}
              disabled={!hasAnyChildren}
            >
              {isExpanded(folderId) ? '▾' : '▸'}
            </button>
            <button
              type="button"
              className="navNodeButton"
              onClick={() => onSelect({ kind: 'folder', folderId })}
            >
              <span className="navNodeTitle">{folder.name}</span>
              <span className="navNodeCount">
                {scope === 'elements'
                  ? `(${folder.elementIds.length} el, ${children.length} folders)`
                  : `(${folder.viewIds.length} views, ${children.length} folders)`}
              </span>
            </button>
          </div>

          <div className="navNodeActions">
            <button
              type="button"
              className="miniButton"
              aria-label="Create folder"
              onClick={() => setCreateParentId(folderId)}
            >
              ＋
            </button>

            {/* For the root folders (Elements/Views), only allow creating subfolders.
                We intentionally do NOT render Rename/Delete buttons here to avoid
                confusing UI and brittle tests that look for the last delete button. */}
            {!isRootFolder ? (
              <>
                <button
                  type="button"
                  className="miniButton"
                  aria-label="Rename folder"
                  onClick={() => setRenameFolderId(folderId)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="miniButton"
                  aria-label="Delete folder"
                  onClick={() => {
                    const ok = window.confirm('Delete this folder? Contents will be moved to its parent folder.');
                    if (!ok) return;
                    modelStore.deleteFolder(folderId);
                    if (selection.kind === 'folder' && selection.folderId === folderId) {
                      onSelect({ kind: 'model' });
                    }
                  }}
                >
                  🗑
                </button>
              </>
            ) : null}
          </div>
        </div>

        {isExpanded(folderId) && hasAnyChildren ? (
          <ul className="navChildren">
            {children.map((c) => renderFolder(modelValue, c.id, scope))}
            {scope === 'elements'
              ? elementLeaves.map((el) => (
                  <li key={el.id}>
                    <div className={['navNode', selection.kind === 'element' && selection.elementId === el.id ? 'isSelected' : null].filter(Boolean).join(' ')}>
                      <div className="navNodeMain">
                        <span className="navNodeTitle">{el.name}</span>
                        <span className="navNodeCount">{el.type}</span>
                      </div>
                      <div className="navNodeActions">
                        <button type="button" className="miniButton" onClick={() => onSelect({ kind: 'element', elementId: el.id })}>
                          Select
                        </button>
                      </div>
                    </div>
                  </li>
                ))
              : null}
            {scope === 'views'
              ? viewLeaves.map((v) => (
                  <li key={v.id}>
                    <div className={['navNode', selection.kind === 'view' && selection.viewId === v.id ? 'isSelected' : null].filter(Boolean).join(' ')}>
                      <div className="navNodeMain">
                        <span className="navNodeTitle">{v.name}</span>
                        <span className="navNodeCount">{v.viewpointId}</span>
                      </div>
                      <div className="navNodeActions">
                        <button type="button" className="miniButton" onClick={() => onSelect({ kind: 'view', viewId: v.id })}>
                          Select
                        </button>
                      </div>
                    </div>
                  </li>
                ))
              : null}
          </ul>
        ) : null}
      </li>
    );
  }

  function renderRelationships(modelValue: Model) {
    const rels = Object.values(modelValue.relationships)
      .filter(Boolean)
      .sort((a, b) => {
        const byType = a.type.localeCompare(b.type, undefined, { sensitivity: 'base' });
        if (byType !== 0) return byType;
        return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
      });

    const id = 'relationships';
    const hasAnyChildren = rels.length > 0;

    return (
      <li key="relationships">
        <div className={['navNode', selection.kind === 'relationship' ? 'isSelected' : null].filter(Boolean).join(' ')}>
          <div className="navNodeMain">
            <button
              type="button"
              className="miniButton"
              aria-label={isExpanded(id) ? 'Collapse folder' : 'Expand folder'}
              onClick={() => toggleExpanded(id)}
              disabled={!hasAnyChildren}
            >
              {isExpanded(id) ? '▾' : '▸'}
            </button>
            <button type="button" className="navNodeButton" onClick={() => onSelect({ kind: 'model' })}>
              <span className="navNodeTitle">Relationships</span>
              <span className="navNodeCount">({rels.length})</span>
            </button>
          </div>
        </div>

        {isExpanded(id) && hasAnyChildren ? (
          <ul className="navChildren">
            {rels.map((r) => {
              const src = modelValue.elements[r.sourceElementId]?.name ?? r.sourceElementId;
              const tgt = modelValue.elements[r.targetElementId]?.name ?? r.targetElementId;
              const label = r.name ? `${r.type}: ${r.name}` : r.type;
              return (
                <li key={r.id}>
                  <div
                    className={['navNode', selection.kind === 'relationship' && selection.relationshipId === r.id ? 'isSelected' : null]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="navNodeMain">
                      <span className="navNodeTitle">{label}</span>
                      <span className="navNodeCount">
                        {src} → {tgt}
                      </span>
                    </div>
                    <div className="navNodeActions">
                      <button
                        type="button"
                        className="miniButton"
                        onClick={() => onSelect({ kind: 'relationship', relationshipId: r.id })}
                      >
                        Select
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </li>
    );
  }

  if (!model || !roots) {
    return (
      <div className="navigator">
        <div className="navigatorHeader">
          <div className="navigatorModelName">No model loaded</div>
          <div className="navigatorMeta">Use New/Open in the header to begin.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="navigator">
      <div className="navigatorHeader">
        <div className="navigatorModelName">
          {model.metadata.name}
          {isDirty ? ' *' : ''}
        </div>
        <div className="navigatorMeta">{fileName ? `File: ${fileName}` : 'Not saved yet'}</div>
      </div>

      <ul className="navTree" aria-label="Model navigator">
        {renderFolder(model, roots.elementsRoot.id, 'elements')}
        {renderFolder(model, roots.viewsRoot.id, 'views')}
        {renderRelationships(model)}
      </ul>

      <FolderNameDialog
        isOpen={createParentId !== null}
        title="Create folder"
        confirmLabel="Create"
        onCancel={() => setCreateParentId(null)}
        onConfirm={(name) => {
          if (!createParentId) return;
          modelStore.createFolder(createParentId, name);
          setCreateParentId(null);
        }}
      />

      <FolderNameDialog
        isOpen={renameFolderId !== null}
        title="Rename folder"
        initialName={renameFolderId ? model.folders[renameFolderId]?.name : ''}
        confirmLabel="Rename"
        onCancel={() => setRenameFolderId(null)}
        onConfirm={(name) => {
          if (!renameFolderId) return;
          modelStore.renameFolder(renameFolderId, name);
          setRenameFolderId(null);
        }}
      />
    </div>
  );
}

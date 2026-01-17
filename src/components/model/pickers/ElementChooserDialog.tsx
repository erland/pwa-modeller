import { useEffect, useMemo, useState } from 'react';

import type { Element, Model } from '../../../domain';
import { getElementTypeLabel } from '../../../domain';
import { Dialog } from '../../dialog/Dialog';

type Props = {
  title: string;
  isOpen: boolean;
  model: Model;
  /** Current selected element id (optional). */
  value: string;
  onClose: () => void;
  onChoose: (elementId: string) => void;
};

type FolderNode = {
  id: string;
  name: string;
  folderIds: string[];
  elementIds: string[];
};

function getRootFolderId(model: Model): string {
  return (
    Object.values(model.folders).find((f) => f.kind === 'root')?.id ??
    Object.values(model.folders)[0]?.id ??
    ''
  );
}

function buildElementParentFolderMap(model: Model): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of Object.values(model.folders)) {
    for (const elId of f.elementIds ?? []) {
      if (!m.has(elId)) m.set(elId, f.id);
    }
  }
  return m;
}

function buildFolderParentMap(model: Model): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of Object.values(model.folders)) {
    for (const childId of f.folderIds ?? []) {
      if (!m.has(childId)) m.set(childId, f.id);
    }
  }
  return m;
}

function folderPathLabel(model: Model, folderId: string, parentById: Map<string, string>): string {
  const parts: string[] = [];
  let cur: string | undefined = folderId;
  let guard = 0;
  while (cur && guard++ < 1000) {
    const f = model.folders[cur];
    if (!f) break;
    if (f.kind !== 'root') parts.push(f.name);
    cur = parentById.get(cur);
  }
  parts.reverse();
  return parts.join(' / ');
}

function elementDisplayLabel(el: Element): string {
  const typeLabel = el.type ? getElementTypeLabel(el.type) : 'Unknown';
  const layer = el.layer ? String(el.layer) : '';
  return layer ? `${el.name || '(unnamed)'} (${typeLabel}, ${layer})` : `${el.name || '(unnamed)'} (${typeLabel})`;
}

export function ElementChooserDialog({ title, isOpen, model, value, onClose, onChoose }: Props) {
  const [query, setQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string>('');

  const rootFolderId = useMemo(() => getRootFolderId(model), [model]);
  const elementParentFolder = useMemo(() => buildElementParentFolderMap(model), [model]);
  const folderParent = useMemo(() => buildFolderParentMap(model), [model]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedId(value ?? '');
    setExpandedFolders(new Set(rootFolderId ? [rootFolderId] : []));
  }, [isOpen, rootFolderId, value]);

  const allElements = useMemo(() => {
    return Object.values(model.elements).filter(Boolean);
  }, [model.elements]);

  const queryLower = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!queryLower) return [] as Element[];
    const res = allElements
      .filter((e) => (e.name ?? '').toLowerCase().includes(queryLower))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
      .slice(0, 200);
    return res;
  }, [allElements, queryLower]);

  const folderNodes = useMemo(() => {
    const m = new Map<string, FolderNode>();
    for (const f of Object.values(model.folders)) {
      m.set(f.id, {
        id: f.id,
        name: f.name,
        folderIds: (f.folderIds ?? []).slice(),
        elementIds: (f.elementIds ?? []).slice()
      });
    }
    return m;
  }, [model.folders]);

  const renderFolder = (folderId: string, depth: number): JSX.Element | null => {
    const node = folderNodes.get(folderId);
    if (!node) return null;

    const isExpanded = expandedFolders.has(folderId);
    const hasChildren = (node.folderIds?.length ?? 0) + (node.elementIds?.length ?? 0) > 0;

    return (
      <div key={folderId} style={{ marginLeft: depth * 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px' }}>
          <button
            type="button"
            className="shellIconButton"
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            disabled={!hasChildren}
            onClick={() => {
              setExpandedFolders((cur) => {
                const next = new Set(cur);
                if (next.has(folderId)) next.delete(folderId);
                else next.add(folderId);
                return next;
              });
            }}
            style={{ width: 28, height: 28 }}
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : '•'}
          </button>
          <span style={{ fontSize: 12, opacity: 0.9 }}>📁 {node.name}</span>
        </div>

        {isExpanded ? (
          <div>
            {(node.folderIds ?? [])
              .slice()
              .sort((a, b) => (folderNodes.get(a)?.name ?? '').localeCompare(folderNodes.get(b)?.name ?? '', undefined, { sensitivity: 'base' }))
              .map((cid) => renderFolder(cid, depth + 1))}

            {(node.elementIds ?? [])
              .map((id) => model.elements[id])
              .filter(Boolean)
              .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
              .map((el) => {
                const isActive = selectedId === el.id;
                return (
                  <button
                    key={el.id}
                    type="button"
                    className={isActive ? 'shellButton' : 'shellButton secondary'}
                    onClick={() => setSelectedId(el.id)}
                    onDoubleClick={() => onChoose(el.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      marginLeft: (depth + 1) * 12 + 38,
                      marginBottom: 6,
                      padding: '6px 10px'
                    }}
                    title={elementDisplayLabel(el)}
                  >
                    ■ {el.name || '(unnamed)'}
                    <span style={{ marginLeft: 8, opacity: 0.75, fontSize: 12 }}>
                      {getElementTypeLabel(el.type)}{el.layer ? ` • ${String(el.layer)}` : ''}
                    </span>
                  </button>
                );
              })}
          </div>
        ) : null}
      </div>
    );
  };

  const selectedEl = selectedId ? model.elements[selectedId] : undefined;
  const selectedPath = selectedEl
    ? folderPathLabel(model, elementParentFolder.get(selectedEl.id) ?? '', folderParent)
    : '';

  return (
    <Dialog
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 0, fontSize: 12, opacity: 0.8 }}>
            {selectedEl ? (
              <span title={selectedPath ? `${elementDisplayLabel(selectedEl)} — ${selectedPath}` : elementDisplayLabel(selectedEl)}>
                Selected: <span className="mono">{selectedEl.name || '(unnamed)'}</span>
                {selectedPath ? <span style={{ opacity: 0.7 }}> — {selectedPath}</span> : null}
              </span>
            ) : (
              <span>Select an element.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="shellButton secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="shellButton"
              disabled={!selectedId}
              onClick={() => {
                if (!selectedId) return;
                onChoose(selectedId);
              }}
            >
              Choose
            </button>
          </div>
        </div>
      }
    >
      <div className="formGrid">
        <div className="formRow">
          <label htmlFor="element-chooser-search">Search</label>
          <input
            id="element-chooser-search"
            className="textInput"
            type="search"
            placeholder="Type to search elements…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            data-autofocus="true"
          />
          <p className="hintText" style={{ marginTop: 2 }}>
            Tip: double-click an element to choose it.
          </p>
        </div>

        <div
          style={{
            border: '1px solid var(--border-1)',
            borderRadius: 12,
            padding: 10,
            maxHeight: 420,
            overflow: 'auto',
            background: 'rgba(255,255,255,0.02)'
          }}
        >
          {queryLower ? (
            <div>
              {searchResults.length === 0 ? (
                <p className="hintText">No matching elements.</p>
              ) : (
                searchResults.map((el) => {
                  const isActive = selectedId === el.id;
                  const folderId = elementParentFolder.get(el.id) ?? '';
                  const path = folderId ? folderPathLabel(model, folderId, folderParent) : '';
                  return (
                    <button
                      key={el.id}
                      type="button"
                      className={isActive ? 'shellButton' : 'shellButton secondary'}
                      onClick={() => setSelectedId(el.id)}
                      onDoubleClick={() => onChoose(el.id)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: '8px 10px' }}
                    >
                      <div>
                        ■ {el.name || '(unnamed)'}
                        <span style={{ marginLeft: 8, opacity: 0.75, fontSize: 12 }}>
                          {getElementTypeLabel(el.type)}{el.layer ? ` • ${String(el.layer)}` : ''}
                        </span>
                      </div>
                      {path ? <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>{path}</div> : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div>
              {rootFolderId ? renderFolder(rootFolderId, 0) : <p className="hintText">No folders found.</p>}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

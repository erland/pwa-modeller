import { useEffect, useMemo, useState } from 'react';

import type { Folder, Model, Relationship, RelationshipType } from '../../domain';
import { ARCHIMATE_LAYERS, ELEMENT_TYPES, RELATIONSHIP_TYPES, VIEWPOINTS } from '../../domain';
import { modelStore, useModelStore } from '../../store';
import type { Selection } from './selection';

type Props = {
  selection: Selection;
  onSelect?: (selection: Selection) => void;
  onEditModelProps: () => void;
};

type TraceDirection = 'outgoing' | 'incoming' | 'both';

type TraceStep = {
  depth: number;
  relationship: Relationship;
  fromId: string;
  toId: string;
};

function getElementLabel(model: Model, elementId: string): string {
  const el = model.elements[elementId];
  if (!el) return elementId;
  // Keep it stable for tests/UX: name (Type)
  return `${el.name} (${el.type})`;
}

function splitRelationshipsForElement(model: Model, elementId: string) {
  const rels = Object.values(model.relationships);
  const outgoing = rels.filter((r) => r.sourceElementId === elementId);
  const incoming = rels.filter((r) => r.targetElementId === elementId);
  return { incoming, outgoing };
}

function computeRelationshipTrace(model: Model, startElementId: string, direction: TraceDirection, depthMax: number): TraceStep[] {
  // Compute a BFS trace (using relationships) starting from the element.
  const steps: TraceStep[] = [];
  const visited = new Set<string>();
  visited.add(startElementId);

  type QueueItem = { elementId: string; depth: number };
  const queue: QueueItem[] = [{ elementId: startElementId, depth: 0 }];

  const relsBySource = new Map<string, Relationship[]>();
  const relsByTarget = new Map<string, Relationship[]>();
  for (const r of Object.values(model.relationships)) {
    const byS = relsBySource.get(r.sourceElementId) ?? [];
    byS.push(r);
    relsBySource.set(r.sourceElementId, byS);

    const byT = relsByTarget.get(r.targetElementId) ?? [];
    byT.push(r);
    relsByTarget.set(r.targetElementId, byT);
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    if (item.depth >= depthMax) continue;

    const nextDepth = item.depth + 1;

    if (direction === 'outgoing' || direction === 'both') {
      const out = relsBySource.get(item.elementId) ?? [];
      for (const r of out) {
        steps.push({ depth: nextDepth, relationship: r, fromId: r.sourceElementId, toId: r.targetElementId });
        if (!visited.has(r.targetElementId)) {
          visited.add(r.targetElementId);
          queue.push({ elementId: r.targetElementId, depth: nextDepth });
        }
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      const inc = relsByTarget.get(item.elementId) ?? [];
      for (const r of inc) {
        steps.push({ depth: nextDepth, relationship: r, fromId: r.targetElementId, toId: r.sourceElementId });
        if (!visited.has(r.sourceElementId)) {
          visited.add(r.sourceElementId);
          queue.push({ elementId: r.sourceElementId, depth: nextDepth });
        }
      }
    }
  }

  return steps;
}

function findFolderByKind(model: Model, kind: Folder['kind']): Folder {
  const found = Object.values(model.folders).find((f) => f.kind === kind);
  if (!found) throw new Error(`Missing required folder kind: ${kind}`);
  return found;
}

function gatherFolderOptions(model: Model, rootId: string): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  function walk(folderId: string, prefix: string) {
    const folder = model.folders[folderId];
    out.push({ id: folderId, label: prefix ? `${prefix} / ${folder.name}` : folder.name });
    const children = folder.folderIds
      .map((id) => model.folders[id])
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const c of children) walk(c.id, prefix ? `${prefix} / ${folder.name}` : folder.name);
  }
  walk(rootId, '');
  return out;
}
function folderPathLabel(model: Model, folderId: string): string {
  const start = model.folders[folderId];
  if (!start) return folderId;

  const parts: string[] = [];
  const visited = new Set<string>();
  let current: Folder | undefined = start;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    parts.unshift(current.name);
    if (!current.parentId) break;
    current = model.folders[current.parentId];
  }

  return parts.join(' / ');
}


function findFolderContaining(model: Model, kind: 'element' | 'view', id: string): string | null {
  for (const folder of Object.values(model.folders)) {
    if (kind === 'element' && folder.elementIds.includes(id)) return folder.id;
    if (kind === 'view' && folder.viewIds.includes(id)) return folder.id;
  }
  return null;
}

export function PropertiesPanel({ selection, onSelect, onEditModelProps }: Props) {
  const model = useModelStore((s) => s.model);

  const [traceDirection, setTraceDirection] = useState<TraceDirection>('both');
  const [traceDepth, setTraceDepth] = useState<number>(1);

  const traceElementId = selection.kind === 'element' ? selection.elementId : null;

  useEffect(() => {
    if (!traceElementId) return;
    setTraceDirection('both');
    setTraceDepth(1);
  }, [traceElementId]);

  const options = useMemo(() => {
    if (!model) return { elementFolders: [], viewFolders: [] };
    const elementsRoot = findFolderByKind(model, 'elements');
    const viewsRoot = findFolderByKind(model, 'views');
    return {
      elementFolders: gatherFolderOptions(model, elementsRoot.id),
      viewFolders: gatherFolderOptions(model, viewsRoot.id)
    };
  }, [model]);

  const relatedForElement = useMemo(() => {
    if (!model || !traceElementId) return { incoming: [] as Relationship[], outgoing: [] as Relationship[] };
    return splitRelationshipsForElement(model, traceElementId);
  }, [model, traceElementId]);

  const traceSteps = useMemo(() => {
    if (!model || !traceElementId) return [] as TraceStep[];
    return computeRelationshipTrace(model, traceElementId, traceDirection, traceDepth);
  }, [model, traceElementId, traceDirection, traceDepth]);

  if (!model) {
    return (
      <div>
        <p className="panelHint">No model loaded yet.</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Selection</div>
            <div className="propertiesValue">—</div>
          </div>
        </div>
      </div>
    );
  }

  if (selection.kind === 'folder') {
    const folder = model.folders[selection.folderId];
    if (!folder) return <p className="panelHint">Folder not found.</p>;
    const canEdit = !(folder.kind === 'root' || folder.kind === 'elements' || folder.kind === 'views');
    return (
      <div>
        <p className="panelHint">Folder</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue">{folder.name}</div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Kind</div>
            <div className="propertiesValue">{folder.kind}</div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Folders</div>
            <div className="propertiesValue">{folder.folderIds.length}</div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Elements</div>
            <div className="propertiesValue">{folder.elementIds.length}</div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Views</div>
            <div className="propertiesValue">{folder.viewIds.length}</div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Path</div>
            <div className="propertiesValue">{folderPathLabel(model, folder.id)}</div>
          </div>
        </div>


        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="shellButton"
            disabled={!canEdit}
            onClick={() => {
              const name = window.prompt('Rename folder', folder.name);
              if (!name) return;
              modelStore.renameFolder(folder.id, name);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="shellButton"
            disabled={!canEdit}
            onClick={() => {
              const ok = window.confirm('Delete this folder? Contents will be moved to its parent folder.');
              if (!ok) return;
              modelStore.deleteFolder(folder.id);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }


  if (selection.kind === 'viewNode') {
    const view = model.views[selection.viewId];
    const element = model.elements[selection.elementId];
    const node = view?.layout?.nodes.find((n) => n.elementId === selection.elementId);

    if (!view || !element || !node) {
      return (
        <div>
          <h2 className="panelTitle">Properties</h2>
          <p className="panelHint">Select something to edit its properties.</p>
        </div>
      );
    }

    return (
      <div>
        <h2 className="panelTitle">Node formatting</h2>
        <p className="panelHint" style={{ marginTop: 6 }}>
          {element.name} <span style={{ opacity: 0.75 }}>in</span> {view.name}
        </p>

        <div className="fieldGroup">
          <label className="fieldLabel">
            <input
              type="checkbox"
              checked={Boolean(node.highlighted)}
              onChange={(e) => modelStore.updateViewNodeLayout(view.id, element.id, { highlighted: e.target.checked })}
            />{' '}
            Highlight
          </label>
        </div>

        <div className="fieldGroup">
          <label className="fieldLabel" htmlFor="node-style-tag">
            Style tag
          </label>
          <input
            id="node-style-tag"
            aria-label="Node style tag"
            className="textInput"
            placeholder="e.g. Critical"
            value={node.styleTag ?? ''}
            onChange={(e) => modelStore.updateViewNodeLayout(view.id, element.id, { styleTag: e.target.value || undefined })}
          />
          <p className="panelHint">View-only label; does not change the underlying element.</p>
        </div>
      </div>
    );
  }

  if (selection.kind === 'element') {
    const el = model.elements[selection.elementId];
    if (!el) return <p className="panelHint">Element not found.</p>;
    const currentFolderId = findFolderContaining(model, 'element', el.id);

    const incoming = relatedForElement.incoming;
    const outgoing = relatedForElement.outgoing;

    const usedInViews = Object.values(model.views)
      .filter((v) => v.layout && v.layout.nodes.some((n) => n.elementId === el.id))
      .map((v) => {
        const count = v.layout ? v.layout.nodes.filter((n) => n.elementId === el.id).length : 0;
        return { id: v.id, name: v.name, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return (
      <div>
        <p className="panelHint">Element</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Element property name"
                value={el.name}
                onChange={(e) => modelStore.updateElement(el.id, { name: e.target.value })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Element property type"
                value={el.type}
                onChange={(e) => modelStore.updateElement(el.id, { type: e.target.value as any })}
              >
                {ELEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Layer</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Element property layer"
                value={el.layer}
                onChange={(e) => modelStore.updateElement(el.id, { layer: e.target.value as any })}
              >
                {ARCHIMATE_LAYERS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Description</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="Element property description"
                value={el.description ?? ''}
                onChange={(e) => modelStore.updateElement(el.id, { description: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Docs</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="Element property documentation"
                value={el.documentation ?? ''}
                onChange={(e) => modelStore.updateElement(el.id, { documentation: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Folder</div>
            <div className="propertiesValue">
              <select
                className="selectInput"
                value={currentFolderId ?? ''}
                onChange={(e) => {
                  const targetId = e.target.value;
                  if (targetId) modelStore.moveElementToFolder(el.id, targetId);
                }}
              >
                {options.elementFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

        </div>

        <div style={{ marginTop: 14 }}>
          <p className="panelHint">Relationships</p>
          <div className="propertiesGrid">

<div className="propertiesRow">
  <div className="propertiesKey">Used in views</div>
  <div className="propertiesValue" style={{ fontWeight: 400 }}>
    {usedInViews.length === 0 ? (
      <span style={{ opacity: 0.7 }}>None</span>
    ) : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {usedInViews.map((v) => (
          <button
            key={v.id}
            type="button"
            className="miniButton"
            aria-label={`Select view ${v.name}`}
            onClick={() => onSelect?.({ kind: 'viewNode', viewId: v.id, elementId: el.id })}
          >
            {v.name}
            {v.count > 1 ? ` (${v.count})` : ''}
          </button>
        ))}
      </div>
    )}
  </div>
</div>

            <div className="propertiesRow">
              <div className="propertiesKey">Outgoing</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                {outgoing.length === 0 ? (
                  <span style={{ opacity: 0.7 }}>None</span>
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {outgoing.map((r) => {
                      const targetName = getElementLabel(model, r.targetElementId);
                      const relLabel = `${r.type}${r.name ? ` — ${r.name}` : ''}`;
                      return (
                        <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Select relationship ${relLabel}`}
                            onClick={() => onSelect?.({ kind: 'relationship', relationshipId: r.id })}
                          >
                            {relLabel}
                          </button>
                          <span style={{ opacity: 0.7 }}>→</span>
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Select target element ${targetName}`}
                            onClick={() => onSelect?.({ kind: 'element', elementId: r.targetElementId })}
                          >
                            {targetName}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="propertiesRow">
              <div className="propertiesKey">Incoming</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                {incoming.length === 0 ? (
                  <span style={{ opacity: 0.7 }}>None</span>
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {incoming.map((r) => {
                      const sourceName = getElementLabel(model, r.sourceElementId);
                      const relLabel = `${r.type}${r.name ? ` — ${r.name}` : ''}`;
                      return (
                        <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Select source element ${sourceName}`}
                            onClick={() => onSelect?.({ kind: 'element', elementId: r.sourceElementId })}
                          >
                            {sourceName}
                          </button>
                          <span style={{ opacity: 0.7 }}>→</span>
                          <button
                            type="button"
                            className="miniButton"
                            aria-label={`Select relationship ${relLabel}`}
                            onClick={() => onSelect?.({ kind: 'relationship', relationshipId: r.id })}
                          >
                            {relLabel}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <p className="panelHint">Trace</p>
          <div className="propertiesGrid">
            <div className="propertiesRow">
              <div className="propertiesKey">Direction</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                <select
                  className="selectInput"
                  aria-label="Trace direction"
                  value={traceDirection}
                  onChange={(e) => setTraceDirection(e.target.value as TraceDirection)}
                >
                  <option value="both">Both</option>
                  <option value="outgoing">Outgoing</option>
                  <option value="incoming">Incoming</option>
                </select>
              </div>
            </div>

            <div className="propertiesRow">
              <div className="propertiesKey">Depth</div>
              <div className="propertiesValue" style={{ fontWeight: 400 }}>
                <select
                  className="selectInput"
                  aria-label="Trace depth"
                  value={String(traceDepth)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setTraceDepth(Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1);
                  }}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {traceSteps.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No trace results.</div>
            ) : (
              traceSteps.map((s, idx) => {
                const relLabel = `${s.relationship.type}${s.relationship.name ? ` — ${s.relationship.name}` : ''}`;
                const fromName = getElementLabel(model, s.fromId);
                const toName = getElementLabel(model, s.toId);
                return (
                  <div key={`${s.relationship.id}_${idx}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ opacity: 0.7 }}>d{s.depth}</span>
                    <button
                      type="button"
                      className="miniButton"
                      aria-label={`Select relationship ${relLabel}`}
                      onClick={() => onSelect?.({ kind: 'relationship', relationshipId: s.relationship.id })}
                    >
                      {relLabel}
                    </button>
                    <span style={{ opacity: 0.7 }}>:</span>
                    <button
                      type="button"
                      className="miniButton"
                      aria-label={`Select element ${fromName}`}
                      onClick={() => onSelect?.({ kind: 'element', elementId: s.fromId })}
                    >
                      {fromName}
                    </button>
                    <span style={{ opacity: 0.7 }}>→</span>
                    <button
                      type="button"
                      className="miniButton"
                      aria-label={`Select element ${toName}`}
                      onClick={() => onSelect?.({ kind: 'element', elementId: s.toId })}
                    >
                      {toName}
                    </button>
                  </div>
                );
              })
            )}
          </div>


        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const ok = window.confirm('Delete this element? Relationships referencing it will also be removed.');
              if (!ok) return;
              modelStore.deleteElement(el.id);
            }}
          >
            Delete element
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === 'relationship') {
    const rel = model.relationships[selection.relationshipId];
    if (!rel) return <p className="panelHint">Relationship not found.</p>;
    const elementOptions = Object.values(model.elements)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const sourceName = model.elements[rel.sourceElementId]?.name ?? rel.sourceElementId;
    const targetName = model.elements[rel.targetElementId]?.name ?? rel.targetElementId;

    const usedInViews = Object.values(model.views)
      .filter((v) => v.layout && v.layout.relationships.some((c) => c.relationshipId === rel.id))
      .map((v) => {
        const count = v.layout ? v.layout.relationships.filter((c) => c.relationshipId === rel.id).length : 0;
        return { id: v.id, name: v.name, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return (
      <div>
        <p className="panelHint">Relationship</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Type</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property type"
                value={rel.type}
                onChange={(e) => modelStore.updateRelationship(rel.id, { type: e.target.value as RelationshipType })}
              >
                {RELATIONSHIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">From</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property source"
                value={rel.sourceElementId}
                onChange={(e) => modelStore.updateRelationship(rel.id, { sourceElementId: e.target.value })}
              >
                {elementOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.type})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Current: {sourceName}</div>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">To</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="Relationship property target"
                value={rel.targetElementId}
                onChange={(e) => modelStore.updateRelationship(rel.id, { targetElementId: e.target.value })}
              >
                {elementOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.type})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Current: {targetName}</div>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="Relationship property name"
                value={rel.name ?? ''}
                onChange={(e) => modelStore.updateRelationship(rel.id, { name: e.target.value || undefined })}
              />
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Description</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="Relationship property description"
                value={rel.description ?? ''}
                onChange={(e) => modelStore.updateRelationship(rel.id, { description: e.target.value || undefined })}
              />
            </div>
          </div>

<div className="propertiesRow">
  <div className="propertiesKey">Used in views</div>
  <div className="propertiesValue" style={{ fontWeight: 400 }}>
    {usedInViews.length === 0 ? (
      <span style={{ opacity: 0.7 }}>None</span>
    ) : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {usedInViews.map((v) => (
          <button
            key={v.id}
            type="button"
            className="miniButton"
            aria-label={`Select view ${v.name}`}
            onClick={() => onSelect?.({ kind: 'view', viewId: v.id })}
          >
            {v.name}
            {v.count > 1 ? ` (${v.count})` : ''}
          </button>
        ))}
      </div>
    )}
  </div>
</div>

        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const ok = window.confirm('Delete this relationship?');
              if (!ok) return;
              modelStore.deleteRelationship(rel.id);
            }}
          >
            Delete relationship
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === 'view') {
    const view = model.views[selection.viewId];
    if (!view) return <p className="panelHint">View not found.</p>;
    const currentFolderId = findFolderContaining(model, 'view', view.id);
    const viewpointLabel = (id: string) => VIEWPOINTS.find((v) => v.id === id)?.name ?? id;
    return (
      <div>
        <p className="panelHint">View</p>
        <div className="propertiesGrid">
          <div className="propertiesRow">
            <div className="propertiesKey">Name</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <input
                className="textInput"
                aria-label="View property name"
                value={view.name}
                onChange={(e) => modelStore.updateView(view.id, { name: e.target.value })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Viewpoint</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <select
                className="selectInput"
                aria-label="View property viewpoint"
                value={view.viewpointId}
                onChange={(e) => modelStore.updateView(view.id, { viewpointId: e.target.value })}
              >
                {VIEWPOINTS.map((vp) => (
                  <option key={vp.id} value={vp.id}>
                    {vp.name}
                  </option>
                ))}
              </select>
              <p className="panelHint" style={{ marginTop: 6 }}>
                {viewpointLabel(view.viewpointId)}
              </p>
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Description</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="View property description"
                value={view.description ?? ''}
                onChange={(e) => modelStore.updateView(view.id, { description: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Docs</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <textarea
                className="textArea"
                aria-label="View property documentation"
                value={view.documentation ?? ''}
                onChange={(e) => modelStore.updateView(view.id, { documentation: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="propertiesRow">
            <div className="propertiesKey">Folder</div>
            <div className="propertiesValue">
              <select
                className="selectInput"
                value={currentFolderId ?? ''}
                onChange={(e) => {
                  const targetId = e.target.value;
                  if (targetId) modelStore.moveViewToFolder(view.id, targetId);
                }}
              >
                {options.viewFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Snap</div>
            <div className="propertiesValue">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={view.formatting?.snapToGrid ?? true}
                  onChange={(e) => modelStore.updateViewFormatting(view.id, { snapToGrid: e.target.checked })}
                />
                <span>Snap to grid</span>
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span className="panelHint" style={{ margin: 0 }}>
                  Grid size
                </span>
                <input
                  aria-label="Grid size"
                  type="number"
                  min={2}
                  className="textInput"
                  style={{ width: 100 }}
                  value={view.formatting?.gridSize ?? 20}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    modelStore.updateViewFormatting(view.id, { gridSize: Number.isFinite(n) && n > 1 ? n : 20 });
                  }}
                />
              </div>
            </div>
          </div>

          <div className="propertiesRow">
            <div className="propertiesKey">Defaults</div>
            <div className="propertiesValue" style={{ fontWeight: 400 }}>
              <div className="panelHint" style={{ margin: 0 }}>
                Default style tag per layer
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {ARCHIMATE_LAYERS.map((layer) => {
                  const value = view.formatting?.layerStyleTags?.[layer] ?? '';
                  return (
                    <div
                      key={layer}
                      style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'center' }}
                    >
                      <div className="panelHint" style={{ margin: 0 }}>
                        {layer}
                      </div>
                      <input
                        aria-label={`Default style tag ${layer}`}
                        className="textInput"
                        placeholder="(none)"
                        value={value}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          const nextTags = { ...(view.formatting?.layerStyleTags ?? {}) } as Record<string, string>;
                          if (!nextValue) delete nextTags[layer];
                          else nextTags[layer] = nextValue;
                          modelStore.updateViewFormatting(view.id, { layerStyleTags: nextTags as any });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>


        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const id = modelStore.cloneView(view.id);
              if (id) onSelect?.({ kind: 'view', viewId: id });
            }}
          >
            Duplicate view
          </button>
          <button
            type="button"
            className="shellButton"
            onClick={() => {
              const ok = window.confirm('Delete this view?');
              if (!ok) return;
              modelStore.deleteView(view.id);
            }}
          >
            Delete view
          </button>
        </div>
      </div>
    );
  }

  // model or none
  return (
    <div>
      <p className="panelHint">Model</p>
      <div className="propertiesGrid">
        <div className="propertiesRow">
          <div className="propertiesKey">Name</div>
          <div className="propertiesValue">
            {/* Avoid duplicating the model name as a text node (navigator already shows it). */}
            <input className="textInput" aria-label="Model name" value={model.metadata.name} readOnly />
          </div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Version</div>
          <div className="propertiesValue">{model.metadata.version ?? '—'}</div>
        </div>
        <div className="propertiesRow">
          <div className="propertiesKey">Owner</div>
          <div className="propertiesValue">{model.metadata.owner ?? '—'}</div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="shellButton" onClick={onEditModelProps}>
          Edit model properties
        </button>
      </div>
    </div>
  );
}